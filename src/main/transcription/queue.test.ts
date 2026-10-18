import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { makeTempDir } from '../../test-support/temp-dir';
import { withFileLock } from '../library/file-lock';
import { audioDir, createMeeting, listMeetings, readMeeting, updateMeeting } from '../library/library';
import { readTranscript } from '../library/transcript-store';
import { describeError, type Logger } from '../logger';
import { DownloadError } from '../models/download';
import { transcriptionTexts } from '../texts';
import type { MainToWorker, TranscribeCommand, WorkerToMain } from './protocol';
import { IDLE_SHUTDOWN_MS, MODELS_SLOW_MS, TranscriptionQueue, WATCHDOG_MIN_MS, type WorkerHandle } from './queue';

/** Поддельный процесс расшифровки: запоминает команды, тест присылает ответы и «роняет» его. */
class FakeWorker implements WorkerHandle {
  readonly sent: MainToWorker[] = [];
  killed = false;
  /** Настоящий процесс завершается не сразу после kill(): выход приходит позже (exit()). */
  deferExit = false;
  private messageListener: (message: unknown) => void = () => undefined;
  private exitListener: (code: number | null) => void = () => undefined;

  send(message: MainToWorker): void {
    this.sent.push(message);
  }
  kill(): void {
    if (this.killed) return;
    this.killed = true;
    if (!this.deferExit) this.exitListener(null);
  }
  exit(code: number | null = null): void {
    this.exitListener(code);
  }
  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }
  onExit(listener: (code: number | null) => void): void {
    this.exitListener = listener;
  }
  post(message: WorkerToMain | unknown): void {
    this.messageListener(message);
  }
  crash(code = 1): void {
    this.killed = true;
    this.exitListener(code);
  }
  transcribes(): TranscribeCommand[] {
    return this.sent.filter((m): m is TranscribeCommand => m.type === 'transcribe');
  }
}

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };
/** Что ушло в журнал ошибок — так, как это запишет настоящий журнал (с причинами). */
const loggedErrors = (): string =>
  vi
    .mocked(logger.error)
    .mock.calls.map(([message, err]) => `${message} ${err === undefined ? '' : describeError(err)}`)
    .join('\n');

async function recordedMeeting(lib: string, patch: Partial<Meeting> = {}, now?: Date): Promise<Meeting> {
  const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', ...(now && { now }) });
  writeFileSync(join(audioDir(lib, meeting.id), 'mic.webm'), 'x');
  writeFileSync(join(audioDir(lib, meeting.id), 'system.webm'), 'x');
  return updateMeeting(lib, meeting.id, (m) => ({
    ...m,
    status: 'recorded',
    durationSec: 60,
    participantsHint: 2,
    tracks: [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 250 },
    ],
    ...patch,
  }));
}

function setup(
  overrides: {
    ensure?: (onProgress: (p: { done: number; total: number }) => void, signal?: AbortSignal) => Promise<void>;
    deferExit?: boolean;
    ffmpegPath?: () => string;
    finished?: (event: { meeting: Meeting; ok: boolean }) => void;
    /** Обработчики окна падают (окно закрыто и т. п.). */
    callbacksThrow?: boolean;
  } = {},
) {
  const workers: FakeWorker[] = [];
  /** Какие группы моделей просила каждая задача. */
  const ensured: string[][] = [];
  const finished: { meeting: Meeting; ok: boolean }[] = [];
  const progress: TranscriptionProgress[][] = [];
  let now = 1_000;
  let threads = 7;
  const queue = new TranscriptionQueue({
    spawn: () => {
      const worker = new FakeWorker();
      worker.deferExit = overrides.deferExit ?? false;
      workers.push(worker);
      return worker;
    },
    models: {
      root: 'M',
      ensure: (groups, options) => {
        ensured.push([...groups]);
        return (overrides.ensure ?? (async () => undefined))(options.onProgress ?? (() => undefined), options.signal);
      },
    },
    ffmpegPath: overrides.ffmpegPath ?? (() => 'ffmpeg'),
    threads: () => threads,
    now: () => now,
    logger,
    libraryChanged: () => {
      if (overrides.callbacksThrow) throw new Error('окно недоступно');
    },
    progressChanged: (p) => {
      progress.push(p);
      if (overrides.callbacksThrow) throw new Error('окно недоступно');
    },
    finished: (event) => {
      finished.push(event);
      overrides.finished?.(event);
    },
  });
  return {
    queue,
    workers,
    ensured,
    finished,
    progress,
    worker: () => workers.at(-1)!,
    setNow: (value: number) => {
      now = value;
    },
    setThreads: (value: number) => {
      threads = value;
    },
  };
}

const done = (jobId: string): WorkerToMain => ({
  type: 'done',
  jobId,
  result: {
    segments: [
      { id: 'seg-1', start: 0, end: 2, speakerId: 'me', text: 'Привет.' },
      { id: 'seg-2', start: 2.5, end: 4, speakerId: 's1', text: 'Здравствуйте.' },
    ],
    speakers: [
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
    ],
    skippedTracks: [],
  },
});

/** Ждёт, пока процесс получит n-ю команду «расшифровать». */
async function transcribeSent(get: () => FakeWorker | undefined, n = 1): Promise<TranscribeCommand> {
  await vi.waitFor(() => expect(get()?.transcribes().length ?? 0).toBeGreaterThanOrEqual(n));
  return get()!.transcribes()[n - 1]!;
}

afterEach(() => {
  vi.useRealTimers();
  // Общий logger: вызовы прошлого теста не должны засчитываться следующему.
  vi.clearAllMocks();
});

describe('TranscriptionQueue', () => {
  it('forgets the names of other speakers after a new transcription and keeps the owner name', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'done', speakerNames: { me: 'Кирилл', s1: 'Ирина' } });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    // Пока новая расшифровка идёт, имена прежнего текста ещё видны.
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1), { timeout: 5000 });
    expect((await readMeeting(lib, meeting.id)).speakerNames).toEqual({ me: 'Кирилл' });
  });

  it('transcribes a meeting: queued → transcribing → transcript.json and «done»', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    expect(command).toMatchObject({ modelsDir: 'M', model: 'whisper-large-v3-turbo', ffmpegPath: 'ffmpeg', threads: 7 });
    expect(t.ensured).toEqual([['whisper-large-v3-turbo', 'voices']]);
    expect(command.input).toEqual({
      tracks: [
        { kind: 'mic', file: join(audioDir(lib, meeting.id), 'mic.webm'), offsetSec: 0 },
        { kind: 'system', file: join(audioDir(lib, meeting.id), 'system.webm'), offsetSec: 0.25 },
      ],
      recordedSystem: true,
      participantsHint: 2,
      durationSec: 60,
    });
    expect((await readMeeting(lib, meeting.id)).status).toBe('transcribing');

    t.worker().post({ type: 'progress', jobId: command.jobId, progress: { stage: 'me', fraction: 0.4 } });
    expect(t.queue.progress()).toEqual([{ meetingId: meeting.id, stage: 'me', fraction: 0.4, download: null }]);

    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done', model: 'whisper-large-v3-turbo' } });
    const transcript = await readTranscript(lib, meeting.id);
    expect(transcript).toMatchObject({ model: 'whisper-large-v3-turbo', modelTitle: 'Whisper large-v3-turbo' });
    expect(transcript?.segments.map((s) => s.text)).toEqual(['Привет.', 'Здравствуйте.']);
    expect(transcript?.segments[0]?.edited).toBe(false);
    expect(t.queue.isBusy()).toBe(false);
    expect(t.queue.progress()).toEqual([]);
  });

  it('transcribes with the model asked for and remembers it in meeting.json', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, undefined, 'parakeet-tdt-0.6b-v3');
    expect((await readMeeting(lib, meeting.id)).model).toBe('parakeet-tdt-0.6b-v3');
    const command = await transcribeSent(t.worker);
    expect(command.model).toBe('parakeet-tdt-0.6b-v3');
    expect(t.ensured).toEqual([['parakeet-tdt-0.6b-v3', 'voices']]);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.meeting.model).toBe('parakeet-tdt-0.6b-v3');
    expect(await readTranscript(lib, meeting.id)).toMatchObject({ model: 'parakeet-tdt-0.6b-v3', modelTitle: 'Parakeet v3' });
  });

  it('keeps the model of meeting.json when none is given, and takes the default one for an unknown model', async () => {
    const lib = makeTempDir();
    const chosen = await recordedMeeting(lib, { model: 't-one' });
    const unknown = await recordedMeeting(lib, { model: 'whisper-tiny' });
    const t = setup();
    await t.queue.enqueue(lib, chosen.id);
    const first = await transcribeSent(t.worker);
    expect(first.model).toBe('t-one');
    t.worker().post(done(first.jobId));
    await t.queue.enqueue(lib, unknown.id);
    // Модель другая — у второй встречи новый процесс.
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const second = await transcribeSent(t.worker);
    expect(second.model).toBe('whisper-large-v3-turbo');
    expect(vi.mocked(logger.warn).mock.calls.map(([m]) => m).join('\n')).toContain('whisper-tiny');
  });

  it('starts a fresh process when the next meeting has another model, and reuses it for the same model', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const same = await recordedMeeting(lib);
    const other = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, first.id, undefined, 't-one');
    const one = await transcribeSent(t.worker);
    t.worker().post(done(one.jobId));
    await t.queue.enqueue(lib, same.id, undefined, 't-one');
    const two = await transcribeSent(t.worker, 2);
    t.worker().post(done(two.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect(t.workers).toHaveLength(1);
    // Другая модель: прежний процесс закрывается и освобождает память своей модели, не дожидаясь сборщика мусора.
    await t.queue.enqueue(lib, other.id, undefined, 'whisper-large-v3-turbo');
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    expect(t.workers[0]?.killed).toBe(true);
    const command = await transcribeSent(t.worker);
    expect(command.model).toBe('whisper-large-v3-turbo');
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(3));
    expect(t.finished.map((f) => f.ok)).toEqual([true, true, true]);
  });

  it('names the model that could not be loaded', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, undefined, 'qwen3-asr-0.6b');
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'failed', jobId: command.jobId, message: 'Load model failed: C:\\models\\x', code: 'model-load' });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.modelLoad('Qwen3-ASR 0.6B'));
  });

  it('saves a new number of participants and passes it on', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id, 4);
    expect((await transcribeSent(t.worker)).input.participantsHint).toBe(4);
    expect((await readMeeting(lib, meeting.id)).participantsHint).toBe(4);
  });

  it('refuses a meeting that is still being recorded', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'recording' });
    await expect(setup().queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillRecording);
  });

  it('refuses a meeting whose file is still being copied and does not resume it', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'importing', source: 'import' });
    const t = setup();
    await expect(t.queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.stillImporting);
    t.queue.resume(lib, await listMeetings(lib));
    expect(t.queue.progress()).toEqual([]);
    expect((await readMeeting(lib, meeting.id)).status).toBe('importing');
  });

  it('notes a track that could not be read and keeps the text of the other one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    const { result } = done(command.jobId) as Extract<WorkerToMain, { type: 'done' }>;
    t.worker().post({ type: 'done', jobId: command.jobId, result: { ...result, skippedTracks: [{ kind: 'mic', message: 'битый файл' }] } });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('дорожка mic не прочитана — битый файл'));
  });

  it('marks the meeting with the reason in plain words when the process fails, the raw text goes to the log', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    const raw = String.raw`ffmpeg не прочитал дорожку (завершился с кодом 1): C:\Users\ира\mic.webm: Invalid data`;
    t.worker().post({ type: 'failed', jobId: command.jobId, message: raw });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    const failed = await readMeeting(lib, meeting.id);
    expect(failed).toMatchObject({ status: 'error', errorMessage: transcriptionTexts.workerFailed(raw) });
    expect(failed.errorMessage).not.toContain(String.raw`C:\Users`);
    expect(t.finished[0]?.ok).toBe(false);
    expect(loggedErrors()).toContain(raw);
  });

  it('shows no raw system error when the result cannot be saved', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    // На месте transcript.json — папка: записать результат нельзя.
    mkdirSync(join(lib, meeting.id, 'transcript.json'));
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    const { errorMessage } = await readMeeting(lib, meeting.id);
    expect(errorMessage).toMatch(/^Расшифровка не удалась/);
    expect(errorMessage).not.toContain(lib);
  });

  it('survives a crash of the process and starts a new one for the next meeting', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await transcribeSent(t.worker);
    t.worker().crash();
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const next = await transcribeSent(t.worker);
    expect(await readMeeting(lib, first.id)).toMatchObject({ status: 'error', errorMessage: transcriptionTexts.crashed });
    t.worker().post(done(next.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect((await readMeeting(lib, second.id)).status).toBe('done');
  });

  it('stops a process that stays silent too long', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.workers[0]?.killed).toBe(true);
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.hung);
  });

  it('restarts a meeting that is asked again while it is transcribed', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    await t.queue.enqueue(lib, meeting.id, 3);
    expect(t.workers[0]?.killed).toBe(true);
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const second = await transcribeSent(t.worker);
    expect(second.input.participantsHint).toBe(3);
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.ok).toBe(true);
    expect((await readMeeting(lib, meeting.id)).status).toBe('done');
  });

  it('does not queue the same meeting twice', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup({ ensure: () => new Promise(() => undefined) });
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await t.queue.enqueue(lib, second.id);
    expect(t.queue.progress().filter((p) => p.stage === 'queued').map((p) => p.meetingId)).toEqual([second.id]);
    expect(t.queue.isBusy()).toBe(true);
  });

  it('shows the download of models and explains a failed download', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({
      ensure: async (onProgress) => {
        onProgress({ done: 100, total: 400 });
        throw new DownloadError('network', 'нет связи с сервером');
      },
    });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.progress.flat()).toContainEqual({
      meetingId: meeting.id,
      stage: 'download',
      fraction: 0,
      download: { done: 100, total: 400, title: 'Whisper large-v3-turbo' },
    });
    expect((await readMeeting(lib, meeting.id)).errorMessage).toContain('нет связи');
    expect(t.workers).toHaveLength(0);
    expect(loggedErrors()).toContain('DownloadError: нет связи с сервером');
  });

  it('leaves the download stage as soon as the models are ready', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ ensure: async (onProgress) => onProgress({ done: 400, total: 400 }) });
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    // Процесс ещё ничего не прислал, а байты скачивания уже не показываются.
    expect(t.queue.progress()).toEqual([{ meetingId: meeting.id, stage: 'prepare', fraction: 0, download: null }]);
  });

  it('shows «preparing the model» when the check of the models takes long', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let finish = (): void => undefined;
    const t = setup({
      ensure: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    await t.queue.enqueue(lib, meeting.id, undefined, 'whisper-large-v3-turbo');
    await vi.waitFor(() => expect(t.queue.progress()[0]?.stage).toBe('download'), { timeout: MODELS_SLOW_MS + 2000 });
    expect(t.queue.progress()[0]?.download).toEqual({ done: 0, total: 0, title: 'Whisper large-v3-turbo' });
    finish();
    await transcribeSent(t.worker);
  });

  it('a new request for the same meeting stops the download of its models and starts over', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const signals: (AbortSignal | undefined)[] = [];
    const t = setup({
      ensure: (_onProgress, signal) => {
        signals.push(signal);
        if (signals.length > 1) return Promise.resolve();
        return new Promise<void>((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено'))),
        );
      },
    });
    await t.queue.enqueue(lib, meeting.id, undefined, 'qwen3-asr-0.6b');
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    await t.queue.enqueue(lib, meeting.id, undefined, 't-one');
    expect(signals[0]?.aborted).toBe(true);
    const command = await transcribeSent(t.worker);
    expect(command.model).toBe('t-one');
    expect(t.finished).toEqual([]);
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBeNull();
  });

  it('cancel stops the running meeting, drops a queued one and goes on with the rest', async () => {
    const lib = makeTempDir();
    const running = await recordedMeeting(lib);
    const queued = await recordedMeeting(lib);
    const next = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, running.id);
    await t.queue.enqueue(lib, queued.id);
    await t.queue.enqueue(lib, next.id);
    await transcribeSent(t.worker);
    const first = t.worker();

    await t.queue.cancel(lib, queued.id);
    expect(t.queue.progress().map((p) => p.meetingId)).toEqual([running.id, next.id]);
    await t.queue.cancel(lib, running.id);
    // Процесс расшифровки закрыт, задача завершилась без уведомления.
    expect(first.killed).toBe(true);
    expect(t.finished).toEqual([]);

    await vi.waitFor(() => expect(t.workers).toHaveLength(2), { timeout: 5000 });
    const command = await transcribeSent(t.worker);
    expect(command.input.tracks[0]?.file).toContain(next.id);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1), { timeout: 5000 });
    expect(t.finished[0]?.meeting.id).toBe(next.id);
    expect((await readMeeting(lib, queued.id)).status).toBe('queued');
  });

  it('cancel stops a meeting whose models are still being prepared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let signal: AbortSignal | undefined;
    const t = setup({
      ensure: (_onProgress, s) => {
        signal = s;
        return new Promise<void>((_resolve, reject) =>
          s?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено'))),
        );
      },
    });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await t.queue.cancel(lib, meeting.id);
    expect(signal?.aborted).toBe(true);
    expect(t.finished).toEqual([]);
    expect(t.workers).toHaveLength(0);
    expect(t.queue.isBusy()).toBe(false);
  });

  it('cancel stops a meeting that is just starting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    // Задача уже взята, но ещё пишет статус «расшифровывается».
    await t.queue.cancel(lib, meeting.id);
    expect(t.ensured).toEqual([]);
    expect(t.workers).toHaveLength(0);
    expect(t.finished).toEqual([]);
  });

  it('cancel that lands while the result is being saved does not announce the meeting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    // Запись статуса встаёт в очередь за чужим изменением meeting.json: текст уже сохранён, статус — ещё нет.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = withFileLock(join(lib, meeting.id, 'meeting.json'), () => gate);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(existsSync(join(lib, meeting.id, 'transcript.json'))).toBe(true));
    const cancelled = t.queue.cancel(lib, meeting.id);
    release();
    await Promise.all([held, cancelled]);
    expect((await readMeeting(lib, meeting.id)).status).toBe('done');
    expect(t.finished).toEqual([]);
  });

  it('refuses to transcribe a meeting whose audio was deleted', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'done', tracks: [], audioDeleted: true });
    const t = setup();
    await expect(t.queue.enqueue(lib, meeting.id)).rejects.toThrow(transcriptionTexts.audioDeleted);
    expect((await readMeeting(lib, meeting.id)).status).toBe('done');
  });

  it('cancel of a meeting that is not in the queue does nothing', async () => {
    const t = setup();
    await expect(t.queue.cancel(makeTempDir(), '2026-01-01_0000_ffffff')).resolves.toBeUndefined();
  });

  it('fails clearly when there are no recorded tracks', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { tracks: [] });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.noTracks);
  });

  it('skips a meeting whose folder disappeared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { status: 'queued' });
    rmSync(join(lib, meeting.id), { recursive: true });
    const t = setup();
    t.queue.resume(lib, [{ kind: 'ok', meeting, mixReady: false, mixFailed: false }]);
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.workers).toHaveLength(0);
    expect(t.finished).toHaveLength(0);
    expect(existsSync(join(lib, meeting.id))).toBe(false);
  });

  it('resumes after a restart the interrupted meeting first, then the queued ones oldest first', async () => {
    const lib = makeTempDir();
    const at = (hour: number): Date => new Date(2026, 8, 25, hour, 0);
    const older = await recordedMeeting(lib, { status: 'queued' }, at(9));
    const interrupted = await recordedMeeting(lib, { status: 'transcribing' }, at(10));
    const newer = await recordedMeeting(lib, { status: 'queued' }, at(11));
    const finished = await recordedMeeting(lib, { status: 'done' }, at(12));
    const t = setup();
    // Как listMeetings при запуске: новые сверху.
    t.queue.resume(
      lib,
      [finished, newer, interrupted, older].map((meeting) => ({ kind: 'ok' as const, meeting, mixReady: true, mixFailed: false })),
    );
    const order: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const command = await transcribeSent(t.worker, n);
      order.push(command.input.tracks[0]!.file);
      t.worker().post(done(command.jobId));
    }
    expect(order.map((file) => [interrupted, older, newer].findIndex((m) => file.includes(m.id)))).toEqual([0, 1, 2]);
    await vi.waitFor(() => expect(t.finished).toHaveLength(3));
  });

  it('tells the process about fewer threads during a recording', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    t.setThreads(2);
    t.queue.threadsChanged();
    expect(t.worker().sent.at(-1)).toEqual({ type: 'threads', threads: 2 });
  });

  it('moves the bar by time during diarization and ignores foreign messages', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'ready', engine: 'sherpa-onnx 1.13.8' });
    t.worker().post({
      type: 'progress',
      jobId: command.jobId,
      progress: { stage: 'diarize', fraction: 0.4, diarize: { to: 0.6, expectedMs: 10_000 } },
    });
    t.setNow(1_000 + 5_000);
    expect(t.queue.progress()[0]?.fraction).toBeCloseTo(0.5, 10);
    t.worker().post({ type: 'progress', jobId: 'job-999', progress: { stage: 'others', fraction: 0.9 } });
    t.worker().post({ type: 'nonsense' });
    expect(t.queue.progress()[0]?.stage).toBe('diarize');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('неверное сообщение'));
  });

  it('closes an idle process after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.worker().killed).toBe(false);
    vi.advanceTimersByTime(IDLE_SHUTDOWN_MS + 1);
    expect(t.worker().killed).toBe(true);
  });

  it('kills the process on dispose', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    await transcribeSent(t.worker);
    t.queue.dispose();
    expect(t.worker().killed).toBe(true);
  });

  it('keeps a late exit of a stopped process away from the next meeting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup({ deferExit: true });
    await t.queue.enqueue(lib, first.id);
    await transcribeSent(t.worker);
    await t.queue.enqueue(lib, second.id);
    // Сторож останавливает первый процесс, но тот завершается не сразу.
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const next = await transcribeSent(t.worker);
    t.workers[0]!.exit(1);
    t.worker().post(done(next.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect(t.finished.map((f) => f.ok)).toEqual([false, true]);
    expect((await readMeeting(lib, second.id)).status).toBe('done');
  });

  it('on quit leaves the meeting to be resumed and starts nothing new', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    await transcribeSent(t.worker);
    t.queue.dispose();
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.workers).toHaveLength(1);
    expect(t.finished).toHaveLength(0);
    expect((await readMeeting(lib, first.id)).status).toBe('transcribing');
    expect((await readMeeting(lib, second.id)).status).toBe('queued');
    await t.queue.enqueue(lib, second.id);
    expect(t.workers).toHaveLength(1);
  });

  it('on quit while a job is being picked up does not start preparing its models', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    // Задача уже взята и записывает статус «расшифровывается» — программа закрывается.
    t.queue.dispose();
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.ensured).toEqual([]);
    expect(t.workers).toHaveLength(0);
    expect(t.finished).toHaveLength(0);
  });

  it('drops a result that arrives after the meeting was asked again', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ deferExit: true });
    await t.queue.enqueue(lib, meeting.id);
    const first = await transcribeSent(t.worker);
    await t.queue.enqueue(lib, meeting.id, 3);
    t.workers[0]!.post(done(first.jobId));
    t.workers[0]!.exit();
    await vi.waitFor(() => expect(t.workers).toHaveLength(2));
    const second = await transcribeSent(t.worker);
    expect(second.input.participantsHint).toBe(3);
    expect(t.finished).toHaveLength(0);
    expect(await readTranscript(lib, meeting.id)).toBeNull();
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
  });

  it('does not start a meeting that was asked again while models were being prepared', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const t = setup({ ensure: () => ready });
    await t.queue.enqueue(lib, meeting.id);
    await t.queue.enqueue(lib, meeting.id, 3);
    release();
    const command = await transcribeSent(t.worker);
    expect(command.input.participantsHint).toBe(3);
    expect(t.worker().transcribes()).toHaveLength(1);
  });

  it('fails at once when the process sends broken data for the current meeting', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({ type: 'done', jobId: command.jobId, result: { segments: [{ speakerId: '../x' }], speakers: [] } });
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.badMessage);
    expect(t.workers[0]?.killed).toBe(true);
  });

  it('waits longer while diarization runs, in proportion to the length of the audio', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, { durationSec: null });
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.worker().post({
      type: 'progress',
      jobId: command.jobId,
      progress: { stage: 'diarize', fraction: 0.2, diarize: { to: 0.6, expectedMs: 5 * 60_000 } },
    });
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    expect(t.worker().killed).toBe(false);
    vi.advanceTimersByTime(30 * 60_000);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect((await readMeeting(lib, meeting.id)).errorMessage).toBe(transcriptionTexts.hung);
  });

  it('counts a meeting being put in the queue as busy', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    const pending = t.queue.enqueue(lib, meeting.id);
    expect(t.queue.isBusy()).toBe(true);
    await pending;
  });

  it('shows a restarted meeting once in the progress', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ ensure: () => new Promise(() => undefined) });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.queue.progress()[0]?.stage).toBe('prepare'));
    await t.queue.enqueue(lib, meeting.id);
    expect(t.queue.progress().map((p) => p.meetingId)).toEqual([meeting.id]);
  });

  it('closes an idle process before models are deleted, but not a busy one', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    t.queue.stopIdleWorker();
    expect(t.worker().killed).toBe(false);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    t.queue.stopIdleWorker();
    expect(t.worker().killed).toBe(true);
  });

  it('does not transcribe twice a meeting asked again while its job is being picked up', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    // Второй запрос записан раньше, чем задача первого прочитает встречу: она уже увидит 3 участника.
    await Promise.all([t.queue.enqueue(lib, meeting.id), t.queue.enqueue(lib, meeting.id, 3)]);
    const command = await transcribeSent(t.worker);
    expect(command.input.participantsHint).toBe(3);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    await vi.waitFor(() => expect(t.queue.isBusy()).toBe(false));
    expect(t.worker().transcribes()).toHaveLength(1);
  });

  it('asked again while the result is being saved: no «ready» notice and the idle process is kept', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const first = await transcribeSent(t.worker);
    t.worker().post(done(first.jobId));
    // Результат уже у очереди и сохраняется — в этот момент встречу ставят заново.
    await t.queue.enqueue(lib, meeting.id, 3);
    const second = await transcribeSent(t.worker, 2);
    expect(second.input.participantsHint).toBe(3);
    expect(t.workers).toHaveLength(1);
    expect(t.workers[0]?.killed).toBe(false);
    expect(t.finished).toHaveLength(0);
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done' } });
  });

  it('keeps a finished meeting done when the notification fails, and goes on', async () => {
    const lib = makeTempDir();
    const first = await recordedMeeting(lib);
    const second = await recordedMeeting(lib);
    const t = setup({
      finished: () => {
        throw new Error('уведомление упало');
      },
    });
    await t.queue.enqueue(lib, first.id);
    await t.queue.enqueue(lib, second.id);
    for (let n = 1; n <= 2; n++) {
      const command = await transcribeSent(t.worker, n);
      t.worker().post(done(command.jobId));
    }
    await vi.waitFor(() => expect(t.finished).toHaveLength(2));
    expect(t.finished.map((f) => f.ok)).toEqual([true, true]);
    expect((await readMeeting(lib, first.id)).status).toBe('done');
    expect((await readMeeting(lib, second.id)).status).toBe('done');
  });

  it('leaves no watchdog behind when the command for the process cannot be built', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({
      ffmpegPath: () => {
        throw new Error('ffmpeg не найден');
      },
    });
    await t.queue.enqueue(lib, meeting.id);
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]?.ok).toBe(false);
    vi.advanceTimersByTime(WATCHDOG_MIN_MS + 1);
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('молчит'));
  });

  it('a failing window callback neither breaks the queue nor escapes from the progress ticker', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup({ callbacksThrow: true });
    await t.queue.enqueue(lib, meeting.id);
    const command = await transcribeSent(t.worker);
    vi.advanceTimersByTime(2_500);
    t.worker().post(done(command.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done' } });
    expect(t.queue.isBusy()).toBe(false);
  });

  it('asked again while the failure is being saved: stays queued and gets no «failed» notice', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib);
    const t = setup();
    await t.queue.enqueue(lib, meeting.id);
    const first = await transcribeSent(t.worker);
    t.worker().post({ type: 'failed', jobId: first.jobId, message: 'ffmpeg не прочитал дорожку' });
    // Причина ещё не записана — в этот момент встречу ставят заново.
    await t.queue.enqueue(lib, meeting.id, 3);
    const second = await transcribeSent(t.worker, 2);
    expect(second.input.participantsHint).toBe(3);
    expect(t.finished).toHaveLength(0);
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ status: 'transcribing', errorMessage: null });
    t.worker().post(done(second.jobId));
    await vi.waitFor(() => expect(t.finished).toHaveLength(1));
    expect(t.finished[0]).toMatchObject({ ok: true, meeting: { status: 'done' } });
  });
});
