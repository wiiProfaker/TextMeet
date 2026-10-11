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
  type StopDialogData,
} from '../../shared/recording';
import type { Settings } from '../../shared/settings';
import { fsErrorReason, humanFsError } from '../fs/fs-errors';
import { audioDir, createMeeting, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import {
  micProblem,
  notificationTexts,
  RECORDER_BROKEN,
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
  /** Окно записи падало снова и снова, и его больше не перезапускают: ждать бесполезно. */
  isBroken(): boolean;
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
  /** Горячая клавиша для уведомлений; null — её держит другая программа, остановить ею нельзя. */
  hotkeyLabel(): string | null;
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
  /** Свести дорожки встречи из этой библиотеки (папку могли сменить, пока шла запись). */
  enqueueMix(libraryDir: string, meetingId: string): void;
  /** Ответ в окне «Запись остановлена» сохранён — встреча уходит в очередь расшифровки (и при «Пропустить»). */
  enqueueTranscription(libraryDir: string, meetingId: string): void;
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
  /**
   * Папка библиотеки на момент старта. Папку в настройках могут сменить, пока идёт запись
   * (окно выбора папки открыли до старта): встреча всё равно дописывается туда, где создана.
   */
  libraryDir: string;
  systemRequested: boolean;
  files: TrackFiles | null;
  pendingChunks: { kind: TrackKind; bytes: Uint8Array }[];
  /** Дорожки, пропавшие, пока main ещё открывал файлы: разбираются, когда запись пошла. */
  pendingEnded: TrackKind[];
  /** Окно записи упало во время остановки: последние куски могли не дойти. */
  interrupted: boolean;
  /** Диск отказал, пока запись ещё начиналась: остановить сразу, как только она пойдёт. */
  diskError: boolean;
  startedAt: number;
  silence: SilenceWatch;
  systemSilence: SystemSilenceWatch;
  lowDisk: LowDiskWatch;
  diskTimer: ReturnType<typeof setInterval> | null;
  started: Deferred<StartProblem | null>;
  /** Идущее открытие файлов после «началось» (не отклоняется): старт, от которого отказались, дожидается его. */
  accepting: Promise<void> | null;
  stopped: Deferred<void>;
}

/** Автомат записи: idle → starting → recording → stopping → idle. */
export class RecordingController {
  private state: RecordingState = { ...IDLE_RECORDING_STATE };
  private session: Session | null = null;
  private busy: Promise<void> = Promise.resolve();
  /** Окна «Запись остановлена», ждущие, пока ответят на открытое (state.stopDialog). */
  private waitingDialogs: StopDialogData[] = [];
  /** Выход решён: новые записи не начинаются, кнопки и клавиша ничего не делают. */
  private quitting = false;

  constructor(private readonly deps: ControllerDeps) {}

  getState(): RecordingState {
    return this.state;
  }

  /** Кнопка, пункт трея, горячая клавиша: начать, если не идёт; остановить, если идёт. */
  toggle(): Promise<void> {
    // Идущую запись при выходе останавливает stopForQuit — без окна «Запись остановлена».
    if (this.quitting) return Promise.resolve();
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

  /**
   * Ответ в окне «Запись остановлена».
   * «Пропустить» (participantsHint === null) закрывает окно, даже если ответ не сохранился (папку встречи
   * удалили, нет прав, кончилось место): иначе окно на всё главное окно не закрыть ничем. Ошибка всё равно
   * уходит в окно — там её покажут в боковой панели. При «Расшифровать» окно остаётся открытым с ошибкой.
   */
  async finishStopDialog(answer: StopDialogAnswer): Promise<void> {
    const title = answer.title.trim();
    const skipped = answer.participantsHint === null;
    const libraryDir = this.deps.libraryDir();
    let saved = false;
    try {
      await updateMeeting(libraryDir, answer.meetingId, (m) => ({
        ...m,
        title: title === '' ? m.title : title,
        participantsHint: answer.participantsHint,
      }));
      saved = true;
    } catch (err) {
      throw humanFsError(`Не удалось сохранить ответ в окне «${this.dialogTitle(answer.meetingId)}»`, err);
    } finally {
      if ((saved || skipped) && this.state.stopDialog?.meetingId === answer.meetingId) this.showNextStopDialog();
    }
    this.deps.libraryChanged();
    this.deps.enqueueTranscription(libraryDir, answer.meetingId);
  }

  start(): Promise<void> {
    if (this.quitting || this.state.phase !== 'idle') return this.busy;
    this.busy = this.runStart().catch((err: unknown) => {
      this.deps.logger.error('Запись не началась', err);
      this.failStart({ message: humanFsError('Не удалось начать запись', err).message, settings: null });
    });
    return this.busy;
  }

  stop(reason: StopReason = 'user'): Promise<void> {
    if (this.state.phase !== 'recording') return this.busy;
    const session = this.session;
    this.busy = this.runStop(reason).catch((err: unknown) => {
      this.deps.logger.error('Не удалось корректно остановить запись', err);
      this.resetToIdle(session, null);
      this.saveFailed(err);
    });
    return this.busy;
  }

  /**
   * Выход подтверждён: запись, начатая в последние мгновения (щелчок по трею, клавиша),
   * оборвалась бы вместе с программой — поэтому больше ничего не начинаем.
   */
  lockForQuit(): void {
    this.quitting = true;
  }

  /** Перед выходом: дождаться начала, если оно идёт, и остановить без вопросов и окон. */
  async stopForQuit(): Promise<void> {
    // Пока ждём, могла начаться своя остановка (ошибка диска, сбой окна записи) — ждём и её.
    // Цикл конечен: после lockForQuit новые записи не начинаются.
    for (;;) {
      const pending = this.busy;
      await pending;
      if (this.state.phase === 'recording') await this.stop('quit');
      else if (this.busy === pending) return;
    }
  }

  // ---- Сообщения окна записи ----

  onStarted(message: RecorderStarted): void {
    const session = this.sessionFor(message.meetingId);
    if (!session || this.state.phase !== 'starting') return;
    session.accepting = this.acceptStarted(session, message).catch((err: unknown) => {
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
      // Микрофон отключился раньше — писать больше нечего.
      if (this.state.micEnded) void this.stop('mic-ended');
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
    // Сразу «останавливается»: клавиша или ошибка диска не должны запустить вторую остановку этой же записи.
    this.update({ phase: 'stopping' });
    this.busy = this.finishInterrupted(session).catch((err: unknown) => {
      this.deps.logger.error('Не удалось сохранить прерванную запись', err);
      this.resetToIdle(session, null);
      this.saveFailed(err);
    });
  }

  // ---- Внутреннее ----

  private async runStart(): Promise<void> {
    this.update({ phase: 'starting', startProblem: null });
    if (!this.deps.recorder.isReady()) return this.failStart(this.recorderProblem());

    // После каждого ожидания проверяем, не подтверждён ли выход: запись, начатая уже после этого,
    // оборвалась бы вместе с программой (окно «Мало места» или запрос доступа могли висеть долго).
    const libraryDir = this.deps.libraryDir();
    await fsp.mkdir(libraryDir, { recursive: true });
    const free = await this.deps.freeBytes(libraryDir);
    if (this.quitting) return this.cancelStart();
    if (free < LOW_DISK_BEFORE_START_BYTES && !(await this.deps.confirmLowDisk(free))) return this.cancelStart();
    if (this.quitting) return this.cancelStart();
    if (!(await this.deps.ensureMicAccess())) return this.failStart(MIC_ACCESS_DENIED);
    if (this.quitting) return this.cancelStart();

    const meeting = await createMeeting(libraryDir, {
      source: 'recording',
      status: 'recording',
      now: new Date(this.deps.now()),
    });
    if (this.quitting) {
      await this.removeUnstartedMeeting(libraryDir, meeting.id);
      return this.cancelStart();
    }
    const session: Session = {
      meeting,
      libraryDir,
      systemRequested: this.state.systemAudioNext,
      files: null,
      pendingChunks: [],
      pendingEnded: [],
      interrupted: false,
      diskError: false,
      startedAt: this.deps.now(),
      silence: new SilenceWatch(this.deps.now()),
      systemSilence: new SystemSilenceWatch(this.deps.now()),
      lowDisk: new LowDiskWatch(),
      diskTimer: null,
      started: deferred(),
      accepting: null,
      stopped: deferred(),
    };
    this.session = session;
    this.update({ meetingId: meeting.id, freeBytes: free });
    this.deps.libraryChanged();

    // Окно записи могло перезапуститься, пока висели окно «Мало места» или запрос доступа к микрофону:
    // тогда команду не отправляем, а пустая встреча убирается как при любом несостоявшемся старте.
    if (!this.deps.recorder.isReady()) {
      session.started.resolve(this.recorderProblem());
    } else {
      if (this.deps.settings().recordSounds) this.deps.recorder.playSound('start');
      this.deps.recorder.start({
        meetingId: meeting.id,
        micDeviceId: this.deps.settings().microphoneId,
        systemAudio: session.systemRequested,
      });
    }

    const problem = await within(session.started.promise, this.deps.timeouts?.startMs ?? START_TIMEOUT_MS, RECORDER_TIMEOUT);
    if (problem) {
      // Сразу отвязать запись: поздние сообщения окна игнорируются, а acceptStarted видит, что от старта отказались.
      this.session = null;
      this.clearTimers(session);
      this.deps.recorder.stop();
      // Файлы могли открыться уже после отказа — закрыть их до удаления папки.
      await session.accepting;
      await session.files?.close();
      await this.removeUnstartedMeeting(session.libraryDir, meeting.id);
      this.deps.libraryChanged();
      this.failStart(problem);
    }
  }

  /** Встреча несостоявшейся записи пуста — убираем её папку, чтобы не висела в списке. */
  private async removeUnstartedMeeting(libraryDir: string, meetingId: string): Promise<void> {
    await removeMeetingDir(libraryDir, meetingId).catch((err: unknown) =>
      this.deps.logger.error(`Не удалось удалить папку несостоявшейся записи ${meetingId}`, err),
    );
  }

  /** Старт отменён без ошибки (отказались в окне «Мало места» или решён выход): тихо обратно в «ожидание». */
  private cancelStart(): void {
    this.update({ phase: 'idle' });
  }

  private async acceptStarted(session: Session, message: RecorderStarted): Promise<void> {
    const { libraryDir } = session;
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
    // Запоминаем файлы и при отказе от старта: runStart закроет их.
    session.files = files;
    if (!this.isStarting(session)) return;
    for (const chunk of session.pendingChunks.splice(0)) files.append(chunk.kind, chunk.bytes);
    // Дорожки и сдвиги — сразу в meeting.json: после сбоя по ним восстановится запись.
    session.meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({ ...m, tracks }));
    if (!this.isStarting(session)) return;

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
    if (!session.diskError) this.deps.notify(notificationTexts.started(this.deps.hotkeyLabel()), true);
    this.deps.logger.info(`Запись началась: ${session.meeting.id} (${tracks.map((t) => t.kind).join(', ')})`);
    session.started.resolve(null);
    // Во время старта stop() ничего не делает — остановка по ошибке диска откладывалась до этого места.
    if (session.diskError) {
      void this.stop('disk');
      return;
    }
    for (const kind of session.pendingEnded.splice(0)) this.onTrackEnded({ meetingId: session.meeting.id, kind });
  }

  private async runStop(reason: StopReason): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.update({ phase: 'stopping' });
    this.clearTimers(session);
    this.deps.recorder.stop();
    const stopMs = this.deps.timeouts?.stopMs ?? STOP_TIMEOUT_MS;
    const confirmed = await within(session.stopped.promise.then(() => true), stopMs, false);
    if (!confirmed) {
      this.deps.logger.warn(`Окно записи не подтвердило остановку за ${stopMs} мс: конец звука мог не сохраниться`);
    }
    await session.files?.close();

    const { libraryDir } = session;
    const durationSec = Math.max(0, Math.round((this.deps.now() - session.startedAt) / 100) / 10);
    const meeting = await updateMeeting(libraryDir, session.meeting.id, (m) => ({
      ...m,
      status: 'recorded',
      durationSec,
      recovered: m.recovered || session.interrupted,
    }));
    if (reason !== 'quit' && this.deps.settings().recordSounds) this.deps.recorder.playSound('stop');
    this.deps.enqueueMix(libraryDir, meeting.id);
    this.deps.logger.info(`Запись остановлена: ${meeting.id}, ${durationSec} с (${reason})`);

    if (reason === 'quit') {
      this.resetToIdle(session, null);
    } else {
      if (session.interrupted) this.deps.notify(notificationTexts.interrupted());
      else if (reason === 'user') this.deps.notify(notificationTexts.stopped(durationSec), true);
      if (reason === 'mic-ended') this.deps.notify(notificationTexts.micEnded());
      this.resetToIdle(session, {
        kind: 'recording',
        meetingId: meeting.id,
        title: meeting.title,
        durationSec,
        fileName: null,
      });
      this.deps.showMainWindow();
    }
    this.deps.libraryChanged();
  }

  private async finishInterrupted(session: Session): Promise<void> {
    this.clearTimers(session);
    await session.files?.close();
    const meeting = await finalizeInterrupted(session.libraryDir, session.meeting.id);
    this.deps.enqueueMix(session.libraryDir, meeting.id);
    this.deps.notify(notificationTexts.interrupted());
    this.resetToIdle(session, null);
    this.deps.libraryChanged();
  }

  private onDiskError(err: unknown): void {
    this.deps.logger.error('Не удалось записать кусок дорожки на диск', err);
    this.deps.notify(notificationTexts.stoppedByDisk(fsErrorReason(err)));
    // Куски, пришедшие до открытия файлов, пишутся ещё во время старта: остановить можно, только когда запись пойдёт.
    if (this.state.phase === 'starting' && this.session) this.session.diskError = true;
    else void this.stop('disk');
  }

  /** meeting.json не обновился: встреча пока числится «идёт запись», её исправит восстановление при запуске. */
  private saveFailed(err: unknown): void {
    this.deps.notify(notificationTexts.saveFailed(fsErrorReason(err)));
    this.deps.libraryChanged();
  }

  private async checkDisk(session: Session): Promise<void> {
    try {
      const free = await this.deps.freeBytes(session.libraryDir);
      if (this.session !== session) return;
      this.update({ freeBytes: free });
      if (session.lowDisk.update(free)) this.deps.notify(notificationTexts.lowDisk(free));
    } catch (err) {
      this.deps.logger.warn('Не удалось узнать свободное место на диске', err);
    }
  }

  /** Окно записи не готово: скоро будет (перезапускается) или уже не будет (сдались после сбоев). */
  private recorderProblem(): StartProblem {
    return this.deps.recorder.isBroken() ? RECORDER_BROKEN : RECORDER_NOT_READY;
  }

  private failStart(problem: StartProblem): void {
    this.session = null;
    // Окно «Запись остановлена» прошлой записи могло быть ещё открыто — его не закрываем.
    this.update({
      ...IDLE_RECORDING_STATE,
      systemAudioNext: this.state.systemAudioNext,
      stopDialog: this.state.stopDialog,
      startProblem: problem,
    });
    this.deps.notify(notificationTexts.startFailed(problem), true);
  }

  /** Окно после импорта: сразу, если других окон нет, иначе — в очередь за ними. */
  queueDialog(dialog: StopDialogData): void {
    if (this.state.stopDialog) this.waitingDialogs.push(dialog);
    else this.update({ stopDialog: dialog });
  }

  /** Встречу удалили: её окно «Запись остановлена» больше не нужно — ни открытое, ни ждущее. */
  dropStopDialog(meetingId: string): void {
    this.waitingDialogs = this.waitingDialogs.filter((dialog) => dialog.meetingId !== meetingId);
    if (this.state.stopDialog?.meetingId === meetingId) this.showNextStopDialog();
  }

  private dialogTitle(meetingId: string): string {
    const dialog = [this.state.stopDialog, ...this.waitingDialogs].find((d) => d?.meetingId === meetingId);
    return dialog?.kind === 'import' ? 'Файл добавлен' : 'Запись остановлена';
  }

  private showNextStopDialog(): void {
    this.update({ stopDialog: this.waitingDialogs.shift() ?? null });
  }

  /**
   * После каждой записи переключатель «Звук компьютера» снова включён.
   * session — запись, которую завершаем: запоздавшая остановка старой записи не должна сбросить новую.
   * Окно «Запись остановлена» прошлой записи ещё открыто — новое ждёт своей очереди, а не заменяет его.
   */
  private resetToIdle(session: Session | null, stopDialog: RecordingState['stopDialog']): void {
    if (this.session !== session) return;
    if (this.session) this.clearTimers(this.session);
    this.session = null;
    const current = this.state.stopDialog;
    if (stopDialog && current) this.waitingDialogs.push(stopDialog);
    this.update({ ...IDLE_RECORDING_STATE, stopDialog: current ?? stopDialog });
  }

  private clearTimers(session: Session): void {
    if (session.diskTimer) clearInterval(session.diskTimer);
    session.diskTimer = null;
  }

  /** Старт этой записи ещё идёт: пока открывались файлы, его могли прервать таймаут или сбой окна. */
  private isStarting(session: Session): boolean {
    return this.session === session && this.state.phase === 'starting';
  }

  private sessionFor(meetingId: string): Session | null {
    return this.session?.meeting.id === meetingId ? this.session : null;
  }

  private update(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.emitState(this.state);
  }
}
