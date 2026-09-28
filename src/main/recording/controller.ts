import { promises as fsp } from 'node:fs';
import type { Meeting, Track, TrackKind } from '../../shared/meeting';
import {
  IDLE_RECORDING_STATE,
  TRACK_FILES,
  type Peaks,
  type RecorderPeaks,
  type RecorderStartCommand,
  type RecorderStarted,
  type RecorderStartFailed,
  type RecorderStopped,
  type RecorderTrackEnded,
  type RecordingState,
  type SoundKind,
  type StartProblem,
  type StopDialogAnswer,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
import { audioDir, createMeeting, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import {
  micProblem,
  notificationTexts,
  RECORDER_NOT_READY,
  RECORDER_TIMEOUT,
  systemAudioProblem,
  MIC_ACCESS_DENIED,
  type NotificationText,
} from '../texts';
import {
  DISK_CHECK_INTERVAL_MS,
  LOW_DISK_BEFORE_START_BYTES,
  LowDiskWatch,
  SilenceWatch,
  SystemSilenceWatch,
} from './monitors';
import { finalizeInterrupted } from './recovery';
import { openTrackFiles, type TrackFiles } from './track-files';

/** Окно записи, каким его видит автомат. */
export interface RecorderLink {
  isReady(): boolean;
  start(command: RecorderStartCommand): void;
  stop(): void;
  playSound(kind: SoundKind): void;
}

export interface ControllerDeps {
  platform: string;
  logger: Logger;
  recorder: RecorderLink;
  now(): number;
  libraryDir(): string;
  settings(): Pick<Settings, 'microphoneId' | 'recordSounds'>;
  hotkeyLabel(): string;
  freeBytes(dir: string): Promise<number>;
  /** Системное окно «Мало места на диске»: true — «Всё равно начать». */
  confirmLowDisk(freeBytes: number): Promise<boolean>;
  /** macOS: запрос доступа к микрофону; Windows — всегда true. */
  ensureMicAccess(): Promise<boolean>;
  /** onlyWhenAway — не показывать, если главное окно на экране и в фокусе. */
  notify(text: NotificationText, onlyWhenAway?: boolean): void;
  showMainWindow(): void;
  emitState(state: RecordingState): void;
  emitPeaks(peaks: Peaks): void;
  libraryChanged(): void;
  enqueueMix(meetingId: string): void;
  openTracks?: typeof openTrackFiles;
  timeouts?: { startMs: number; stopMs: number };
}

export type StopReason = 'user' | 'quit' | 'disk' | 'mic-ended';

/** Ждём ответа окна записи на «начать»: на Mac в это время может висеть запрос разрешения. */
export const START_TIMEOUT_MS = 60_000;
export const STOP_TIMEOUT_MS = 10_000;

const SYSTEM_TRACK_ENDED = 'Звук компьютера перестал записываться. Микрофон записывается как обычно.';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Результат ожидания или fallback, если не дождались. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface Session {
  meeting: Meeting;
  systemRequested: boolean;
  files: TrackFiles | null;
  pendingChunks: { kind: TrackKind; bytes: Uint8Array }[];
  /** Дорожки, пропавшие, пока main ещё открывал файлы: разбираются, когда запись пошла. */
  pendingEnded: TrackKind[];
  /** Окно записи упало во время остановки: последние куски могли не дойти. */
  interrupted: boolean;
  startedAt: number;
  silence: SilenceWatch;
  systemSilence: SystemSilenceWatch;
  lowDisk: LowDiskWatch;
  diskTimer: ReturnType<typeof setInterval> | null;
  started: Deferred<StartProblem | null>;
  stopped: Deferred<void>;
}

/** Автомат записи: idle → starting → recording → stopping → idle. */
export class RecordingController {
  private state: RecordingState = { ...IDLE_RECORDING_STATE };
  private session: Session | null = null;
  private busy: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ControllerDeps) {}

  getState(): RecordingState {
    return this.state;
  }

  /** Кнопка, пункт трея, горячая клавиша: начать, если не идёт; остановить, если идёт. */
  toggle(): Promise<void> {
    if (this.state.phase === 'idle') return this.start();
    if (this.state.phase === 'recording') return this.stop('user');
    return Promise.resolve();
  }

  setSystemAudioNext(enabled: boolean): void {
    if (this.state.phase === 'idle') this.update({ systemAudioNext: enabled });
  }

  dismissStartProblem(): void {
    this.update({ startProblem: null });
  }

  /** Ответ в окне «Запись остановлена». */
  async finishStopDialog(answer: StopDialogAnswer): Promise<void> {
    const title = answer.title.trim();
    await updateMeeting(this.deps.libraryDir(), answer.meetingId, (m) => ({
      ...m,
      title: title === '' ? m.title : title,
      participantsHint: answer.participantsHint,
    }));
    if (this.state.stopDialog?.meetingId === answer.meetingId) this.update({ stopDialog: null });
    this.deps.libraryChanged();
  }

  start(): Promise<void> {
    if (this.state.phase !== 'idle') return this.busy;
    this.busy = this.runStart().catch((err: unknown) => {
      this.deps.logger.error('Запись не началась', err);
      this.failStart({ message: humanFsError('Не удалось начать запись', err).message, settings: null });
    });
    return this.busy;
  }

  stop(reason: StopReason = 'user'): Promise<void> {
    if (this.state.phase !== 'recording') return this.busy;
    this.busy = this.runStop(reason).catch((err: unknown) => {
      this.deps.logger.error('Не удалось корректно остановить запись', err);
      this.resetToIdle(null);
    });
    return this.busy;
  }

  /** Перед выходом: дождаться начала, если оно идёт, и остановить без вопросов и окон. */
  async stopForQuit(): Promise<void> {
    await this.busy;
    if (this.state.phase === 'recording') await this.stop('quit');
  }

  // ---- Сообщения окна записи ----

  onStarted(message: RecorderStarted): void {
    const session = this.sessionFor(message.meetingId);
    if (!session || this.state.phase !== 'starting') return;
    this.acceptStarted(session, message).catch((err: unknown) => {
      this.deps.logger.error('Не удалось открыть файлы дорожек', err);
      session.started.resolve({ message: humanFsError('Не удалось начать запись', err).message, settings: null });
    });
  }

  onStartFailed(message: RecorderStartFailed): void {
    const session = this.sessionFor(message.meetingId);
    if (!session) return;
    this.deps.logger.warn(`Микрофон не включился: ${message.failure.name}: ${message.failure.message}`);
    session.started.resolve(micProblem(message.failure));
  }

  onChunk(meetingId: string, kind: TrackKind, bytes: Uint8Array): void {
    const session = this.sessionFor(meetingId);
    if (!session) return;
    if (session.files) session.files.append(kind, bytes);
    else session.pendingChunks.push({ kind, bytes });
  }

  onPeaks(message: RecorderPeaks): void {
    const session = this.sessionFor(message.meetingId);
    if (!session || this.state.phase !== 'recording') return;
    const peaks: Peaks = { mic: message.mic, system: message.system };
    this.deps.emitPeaks(peaks);
    const now = this.deps.now();
    if (session.silence.update(now, peaks)) {
      this.deps.notify(notificationTexts.stillRecording(this.deps.hotkeyLabel()));
    }
    const systemSilent = session.systemSilence.update(now, peaks.system);
    if (systemSilent !== this.state.systemSilent) this.update({ systemSilent });
  }

  onTrackEnded(message: RecorderTrackEnded): void {
    const session = this.sessionFor(message.meetingId);
    if (!session) return;
    if (this.state.phase === 'starting') {
      session.pendingEnded.push(message.kind);
      return;
    }
    if (this.state.phase !== 'recording') return;
    this.deps.logger.warn(`Дорожка ${message.kind} завершилась во время записи`);
    if (message.kind === 'system') {
      this.update({ system: 'failed', systemProblem: SYSTEM_TRACK_ENDED, systemSilent: false });
    } else if (this.state.system === 'on') {
      this.update({ micEnded: true });
    } else {
      void this.stop('mic-ended');
    }
  }

  onStopped(message: RecorderStopped): void {
    this.sessionFor(message.meetingId)?.stopped.resolve();
  }

  /** Окно записи упало или перезагрузилось. */
  onRecorderGone(): void {
    const session = this.session;
    if (!session) return;
    if (this.state.phase === 'starting') {
      session.started.resolve({ message: 'Окно записи закрылось из-за сбоя. Попробуйте ещё раз.', settings: null });
      return;
    }
    // Во время остановки окно тоже могло упасть: ждать его ответа незачем, а запись — с пометкой о сбое.
    if (this.state.phase === 'stopping') {
      session.interrupted = true;
      session.stopped.resolve();
      return;
    }
    if (this.state.phase !== 'recording') return;
    this.busy = this.finishInterrupted(session).catch((err: unknown) => {
      this.deps.logger.error('Не удалось сохранить прерванную запись', err);
      this.resetToIdle(null);
    });
  }

  // ---- Внутреннее ----

  private async runStart(): Promise<void> {
    this.update({ phase: 'starting', startProblem: null });
    if (!this.deps.recorder.isReady()) return this.failStart(RECORDER_NOT_READY);

    const libraryDir = this.deps.libraryDir();
    await fsp.mkdir(libraryDir, { recursive: true });
    const free = await this.deps.freeBytes(libraryDir);
    if (free < LOW_DISK_BEFORE_START_BYTES && !(await this.deps.confirmLowDisk(free))) {
      this.update({ phase: 'idle' });
      return;
    }
    if (!(await this.deps.ensureMicAccess())) return this.failStart(MIC_ACCESS_DENIED);

    const meeting = await createMeeting(libraryDir, {
      source: 'recording',
      status: 'recording',
      now: new Date(this.deps.now()),
    });
    const session: Session = {
      meeting,
      systemRequested: this.state.systemAudioNext,
      files: null,
      pendingChunks: [],
      pendingEnded: [],
      interrupted: false,
      startedAt: this.deps.now(),
      silence: new SilenceWatch(this.deps.now()),
      systemSilence: new SystemSilenceWatch(this.deps.now()),
      lowDisk: new LowDiskWatch(),
      diskTimer: null,
      started: deferred(),
      stopped: deferred(),
    };
    this.session = session;
    this.update({ meetingId: meeting.id, freeBytes: free });
    this.deps.libraryChanged();

    if (this.deps.settings().recordSounds) this.deps.recorder.playSound('start');
    this.deps.recorder.start({
      meetingId: meeting.id,
      micDeviceId: this.deps.settings().microphoneId,
      systemAudio: session.systemRequested,
    });

    const problem = await within(session.started.promise, this.deps.timeouts?.startMs ?? START_TIMEOUT_MS, RECORDER_TIMEOUT);
    if (problem) {
      this.deps.recorder.stop();
      await session.files?.close();
      this.session = null;
      await removeMeetingDir(libraryDir, meeting.id).catch((err: unknown) =>
        this.deps.logger.error(`Не удалось удалить папку несостоявшейся записи ${meeting.id}`, err),
      );
      this.deps.libraryChanged();
      this.failStart(problem);
    }
  }

  private async acceptStarted(session: Session, message: RecorderStarted): Promise<void> {
    const libraryDir = this.deps.libraryDir();
    const earliest = Math.min(...message.tracks.map((t) => t.startedAt));
    const tracks: Track[] = message.tracks.map((t) => ({
      kind: t.kind,
      file: TRACK_FILES[t.kind],
      startOffsetMs: Math.max(0, Math.round(t.startedAt - earliest)),
    }));
    const files = await (this.deps.openTracks ?? openTrackFiles)(
      audioDir(libraryDir, session.meeting.id),
      tracks.map((t) => t.kind),
      (err) => this.onDiskError(err),
    );
    session.files = files;
    for (const chunk of session.pendingChunks.splice(0)) files.append(chunk.kind, chunk.bytes);
    // Дорожки и сдвиги — сразу в meeting.json: после сбоя по ним восстановится запись.
    session.meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({ ...m, tracks }));

    const now = this.deps.now();
    session.startedAt = now;
    session.silence = new SilenceWatch(now);
    session.systemSilence = new SystemSilenceWatch(now);
    const systemFailed = session.systemRequested && message.systemFailure !== null;
    if (message.systemFailure) {
      this.deps.logger.warn(`Звук компьютера не подключился: ${message.systemFailure.name}: ${message.systemFailure.message}`);
    }
    this.update({
      phase: 'recording',
      startedAt: now,
      system: !session.systemRequested ? 'off' : systemFailed ? 'failed' : 'on',
      systemProblem: message.systemFailure ? systemAudioProblem(message.systemFailure, this.deps.platform) : null,
      micLabel: message.micLabel,
    });
    session.diskTimer = setInterval(() => void this.checkDisk(session), DISK_CHECK_INTERVAL_MS);
    this.deps.notify(notificationTexts.started(this.deps.hotkeyLabel()), true);
    this.deps.logger.info(`Запись началась: ${session.meeting.id} (${tracks.map((t) => t.kind).join(', ')})`);
    session.started.resolve(null);
    for (const kind of session.pendingEnded.splice(0)) this.onTrackEnded({ meetingId: session.meeting.id, kind });
  }

  private async runStop(reason: StopReason): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.update({ phase: 'stopping' });
    this.clearTimers(session);
    this.deps.recorder.stop();
    await within(session.stopped.promise, this.deps.timeouts?.stopMs ?? STOP_TIMEOUT_MS, undefined);
    await session.files?.close();

    const libraryDir = this.deps.libraryDir();
    const durationSec = Math.max(0, Math.round((this.deps.now() - session.startedAt) / 100) / 10);
    const meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({
      ...m,
      status: 'recorded',
      durationSec,
      recovered: m.recovered || session.interrupted,
    }));
    if (reason !== 'quit' && this.deps.settings().recordSounds) this.deps.recorder.playSound('stop');
    this.deps.enqueueMix(meeting.id);
    this.deps.logger.info(`Запись остановлена: ${meeting.id}, ${durationSec} с (${reason})`);

    if (reason === 'quit') {
      this.resetToIdle(null);
    } else {
      if (session.interrupted) this.deps.notify(notificationTexts.interrupted());
      else if (reason === 'user') this.deps.notify(notificationTexts.stopped(durationSec), true);
      if (reason === 'mic-ended') this.deps.notify(notificationTexts.micEnded());
      this.resetToIdle({ meetingId: meeting.id, title: meeting.title, durationSec });
      this.deps.showMainWindow();
    }
    this.deps.libraryChanged();
  }

  private async finishInterrupted(session: Session): Promise<void> {
    this.clearTimers(session);
    await session.files?.close();
    const meeting = await finalizeInterrupted(this.deps.libraryDir(), session.meeting.id);
    this.deps.enqueueMix(meeting.id);
    this.deps.notify(notificationTexts.interrupted());
    this.resetToIdle(null);
    this.deps.libraryChanged();
  }

  private onDiskError(err: unknown): void {
    this.deps.logger.error('Не удалось записать кусок дорожки на диск', err);
    this.deps.notify(notificationTexts.stoppedByDisk(fsErrorReason(err)));
    void this.stop('disk');
  }

  private async checkDisk(session: Session): Promise<void> {
    try {
      const free = await this.deps.freeBytes(this.deps.libraryDir());
      if (this.session !== session) return;
      this.update({ freeBytes: free });
      if (session.lowDisk.update(free)) this.deps.notify(notificationTexts.lowDisk(free));
    } catch (err) {
      this.deps.logger.warn('Не удалось узнать свободное место на диске', err);
    }
  }

  private failStart(problem: StartProblem): void {
    this.session = null;
    this.update({ ...IDLE_RECORDING_STATE, systemAudioNext: this.state.systemAudioNext, startProblem: problem });
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /** После каждой записи переключатель «Звук компьютера» снова включён. */
  private resetToIdle(stopDialog: RecordingState['stopDialog']): void {
    if (this.session) this.clearTimers(this.session);
    this.session = null;
    this.update({ ...IDLE_RECORDING_STATE, stopDialog: stopDialog ?? this.state.stopDialog });
  }

  private clearTimers(session: Session): void {
    if (session.diskTimer) clearInterval(session.diskTimer);
    session.diskTimer = null;
  }

  private sessionFor(meetingId: string): Session | null {
    return this.session?.meeting.id === meetingId ? this.session : null;
  }

  private update(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.emitState(this.state);
  }
}
