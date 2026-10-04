// Очередь расшифровки в main (спецификация Плана 3, §5): одна встреча за раз, процесс расшифровки,
// прогресс, сторож зависания, отмена, продолжение после запуска. Electron сюда не подключается — процесс внедряется.
import { asrModel, DEFAULT_ASR_MODEL } from '../../shared/asr-models';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';
import { updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import type { Logger } from '../logger';
import type { EnsureOptions } from '../models/model-manager';
import type { ModelGroupId } from '../models/registry';
import { transcriptionTexts } from '../texts';
import { buildPipelineInput } from './job-input';
import type { PipelineInput, PipelineResult } from './pipeline';
import { interpolateDiarize, type DiarizeClock } from './progress';
import { WorkerToMainSchema, type MainToWorker, type TranscribeCommand } from './protocol';

/** Процесс расшифровки глазами очереди (в программе — utilityProcess, в тестах — подделка). */
export interface WorkerHandle {
  send(message: MainToWorker): void;
  kill(): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number | null) => void): void;
}

export interface TranscriptionQueueDeps {
  spawn(): WorkerHandle;
  models: { root: string; ensure(groups: readonly ModelGroupId[], options: EnsureOptions): Promise<void> };
  ffmpegPath(): string;
  /** Сколько потоков можно занять сейчас (во время записи — меньше, §5.3). */
  threads(): number;
  now(): number;
  logger: Logger;
  /** Статус встречи изменился — список встреч надо перечитать. */
  libraryChanged(): void;
  progressChanged(progress: TranscriptionProgress[]): void;
  /** Расшифровка встречи закончилась (для уведомления). */
  finished(event: { libraryDir: string; meeting: Meeting; ok: boolean }): void;
}

/** Процесс без сообщений дольше max(10 мин, половины длительности встречи) — завис (§5.2). */
export const WATCHDOG_MIN_MS = 10 * 60_000;
export const WATCHDOG_SHARE = 0.5;
/**
 * Разделение по голосам и группировка — долгие вызовы без сообщений. На время этого шага сторож ждёт в столько раз
 * дольше оценки его длительности: оценка — по длине звука, поэтому сторож работает и у восстановленной записи,
 * у которой длительность встречи ещё неизвестна.
 */
export const DIARIZE_WATCHDOG_FACTOR = 6;
/** Процесс без задач закрывается: модели занимают ~1 ГБ памяти. */
export const IDLE_SHUTDOWN_MS = 5 * 60_000;
/** Прогресс в окно — не чаще. */
export const PROGRESS_INTERVAL_MS = 500;

interface Job {
  /** Папка библиотеки на момент постановки: папку в настройках могут сменить, пока встреча ждёт. */
  libraryDir: string;
  meetingId: string;
}

/** failed: message — для человека, detail — исходный текст процесса расшифровки (только в журнал). */
type Outcome =
  | { kind: 'done'; result: PipelineResult }
  | { kind: 'failed'; message: string; detail?: string }
  | { kind: 'cancelled' };

/** Ошибка, текст которой написан для человека: во встречу он попадает как есть, остальные — общим текстом. */
class ShownError extends Error {}

interface Current {
  job: Job;
  jobId: string | null;
  /** Процесс, на котором идёт эта задача: сообщения и выход других процессов её не касаются. */
  worker: WorkerHandle | null;
  progress: TranscriptionProgress;
  clock: (DiarizeClock & { startedAt: number }) | null;
  cancelled: boolean;
  /** Задача в процессе расшифровки: завершить её (один раз). */
  settle: ((outcome: Outcome) => void) | null;
  /** Сообщение от процесса — сторож зависания начинает отсчёт заново (с новым сроком). */
  rearm: ((limitMs: number) => void) | null;
  /** Обычный срок сторожа для этой встречи. */
  baseLimitMs: number;
}

const sameJob = (a: Job, b: Job): boolean => a.libraryDir === b.libraryDir && a.meetingId === b.meetingId;

export class TranscriptionQueue {
  private readonly queue: Job[] = [];
  private current: Current | null = null;
  /** Задача взята из очереди, но ещё готовится (запись статуса) — для isBusy. */
  private active: Job | null = null;
  /** Задача взята из очереди, а meeting.json ещё не прочитан: она прочитает и то, что запишут до этого. */
  private starting: Job | null = null;
  private pendingEnqueues = 0;
  private worker: WorkerHandle | null = null;
  private running = false;
  private disposed = false;
  private jobCounter = 0;
  private lastEmit = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: TranscriptionQueueDeps) {}

  /**
   * Поставить встречу в очередь («Расшифровать», «Расшифровать заново», «Повторить», после окна «Запись
   * остановлена»). participantsHint: undefined — оставить как в meeting.json. Если встреча уже расшифровывается —
   * работа прерывается и начинается заново.
   */
  async enqueue(libraryDir: string, meetingId: string, participantsHint?: number | null): Promise<void> {
    this.pendingEnqueues += 1;
    try {
      await updateMeeting(libraryDir, meetingId, (m) => {
        if (m.status === 'recording') throw new Error(transcriptionTexts.stillRecording);
        return {
          ...m,
          status: 'queued',
          errorMessage: null,
          ...(participantsHint !== undefined && { participantsHint }),
        };
      });
      // Сначала в очередь: сбой обработчика окна не должен оставить встречу «в очереди» без задачи.
      this.add({ libraryDir, meetingId });
      this.report(() => this.deps.libraryChanged());
    } finally {
      this.pendingEnqueues -= 1;
    }
  }

  /**
   * При запуске программы: встречи, ждавшие очереди, и прерванные выходом на середине расшифровки. Порядок — как
   * в очереди до выхода: сначала прерванная, затем ждавшие, старые первыми (entries от listMeetings — новые сверху).
   */
  resume(libraryDir: string, entries: readonly MeetingListEntry[]): void {
    const rank = (meeting: Meeting): number => (meeting.status === 'transcribing' ? 0 : 1);
    const meetings = entries
      .flatMap((entry) => (entry.kind === 'ok' ? [entry.meeting] : []))
      .filter((meeting) => meeting.status === 'queued' || meeting.status === 'transcribing')
      // По времени создания: createdAt точнее id (в id — минуты местного времени), id — на случай совпадения.
      .sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const meeting of meetings) this.add({ libraryDir, meetingId: meeting.id });
  }

  /** Началась или закончилась запись: процессу — новое число потоков. */
  threadsChanged(): void {
    this.worker?.send({ type: 'threads', threads: this.deps.threads() });
  }

  progress(): TranscriptionProgress[] {
    const current = this.current;
    const queued = this.queue
      .filter((job) => !current || job.meetingId !== current.job.meetingId)
      .map((job) => ({ meetingId: job.meetingId, stage: 'queued' as const, fraction: 0, download: null }));
    if (!current) return queued;
    const { progress, clock } = current;
    const fraction = clock ? interpolateDiarize(clock, this.deps.now() - clock.startedAt) : progress.fraction;
    return [{ ...progress, fraction }, ...queued];
  }

  /** Идёт, готовится или ждёт расшифровка — модели удалять нельзя. */
  isBusy(): boolean {
    return this.current !== null || this.active !== null || this.queue.length > 0 || this.pendingEnqueues > 0;
  }

  /** Перед удалением моделей: закрыть простаивающий процесс — он держит файлы моделей открытыми. */
  stopIdleWorker(): void {
    if (!this.isBusy()) this.killWorker(this.worker);
  }

  /**
   * Выход из программы: процесс закрывается, очередь останавливается. Встречи остаются в статусах «в очереди» /
   * «расшифровывается» и продолжатся при следующем запуске (resume) — ошибкой они не помечаются.
   */
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    clearTimeout(this.watchdog);
    clearInterval(this.ticker);
    if (this.current) this.current.cancelled = true;
    this.killWorker(this.worker);
  }

  private killWorker(worker: WorkerHandle | null): void {
    if (!worker) return;
    if (this.worker === worker) this.worker = null;
    worker.kill();
  }

  private add(job: Job): void {
    if (this.disposed) return;
    // Задача этой встречи уже взята, но встречу ещё не прочитала: прочитает и новое — второй раз не ставим.
    if (this.starting && sameJob(this.starting, job)) return;
    const current = this.current;
    if (current && sameJob(current.job, job)) {
      current.cancelled = true;
      // Процесс останавливается, только пока он занят этой встречей: готовый результат он уже прислал.
      if (current.settle) this.killWorker(current.worker);
    }
    if (!this.queue.some((queued) => sameJob(queued, job))) this.queue.push(job);
    this.emitProgress(true);
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    clearTimeout(this.idleTimer);
    for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
      this.active = job;
      this.starting = job;
      try {
        await this.runJob(job);
      } catch (err) {
        this.deps.logger.error(`Очередь расшифровки: сбой задачи ${job.meetingId}`, err);
      } finally {
        this.active = null;
        this.starting = null;
      }
    }
    this.running = false;
    if (this.disposed) return;
    this.emitProgress(true);
    this.idleTimer = setTimeout(() => this.killWorker(this.worker), IDLE_SHUTDOWN_MS);
  }

  private async runJob(job: Job): Promise<void> {
    const { libraryDir, meetingId } = job;
    let meeting: Meeting;
    try {
      meeting = await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, status: 'transcribing', errorMessage: null }));
    } catch (err) {
      this.deps.logger.warn(`Расшифровка: встреча ${meetingId} не найдена — задача снята (${(err as Error).message})`);
      return;
    } finally {
      this.starting = null;
    }
    const current: Current = {
      job,
      jobId: null,
      worker: null,
      progress: { meetingId, stage: 'prepare', fraction: 0, download: null },
      clock: null,
      cancelled: this.disposed,
      settle: null,
      rearm: null,
      baseLimitMs: WATCHDOG_MIN_MS,
    };
    this.current = current;
    this.report(() => this.deps.libraryChanged());
    this.emitProgress(true);
    this.ticker = setInterval(() => this.emitProgress(true), 1000);
    this.deps.logger.info(`Расшифровка началась: ${meetingId}`);
    let ended: { meeting: Meeting; ok: boolean } | null = null;
    try {
      ended = await this.transcribe(current, meeting);
    } finally {
      clearInterval(this.ticker);
      this.current = null;
      if (!this.disposed) {
        this.report(() => this.deps.libraryChanged());
        this.emitProgress(true);
      }
    }
    // Уведомление — после всех записей на диск: его сбой не превращает готовую встречу в ошибку.
    const event = ended && { libraryDir, ...ended };
    if (event) this.report(() => this.deps.finished(event));
  }

  /** Модели, процесс расшифровки, запись результата. null — уведомлять не о чем (встречу поставили заново). */
  private async transcribe(current: Current, meeting: Meeting): Promise<{ meeting: Meeting; ok: boolean } | null> {
    const { libraryDir, meetingId } = current.job;
    try {
      const { title } = asrModel(DEFAULT_ASR_MODEL);
      await this.deps.models
        .ensure([DEFAULT_ASR_MODEL, 'voices'], {
          onProgress: (download) => this.setProgress(current, { stage: 'download', fraction: 0, download: { ...download, title } }),
        })
        .catch((err: unknown) => {
          throw new ShownError(transcriptionTexts.download(err), { cause: err });
        });
      if (current.cancelled) return null;
      const input = await buildPipelineInput(libraryDir, meeting);
      if (current.cancelled) return null;
      if (input.tracks.length === 0) throw new ShownError(transcriptionTexts.noTracks);
      const outcome = await this.runInWorker(current, input);
      // Встречу поставили заново (или программа закрывается), пока шла работа: этот результат не нужен.
      if (current.cancelled || outcome.kind === 'cancelled') return null;
      if (outcome.kind === 'failed') throw new ShownError(outcome.message, { cause: outcome.detail });
      for (const skipped of outcome.result.skippedTracks) {
        this.deps.logger.warn(`Расшифровка ${meetingId}: дорожка ${skipped.kind} не прочитана — ${skipped.message}`);
      }
      await writeTranscript(libraryDir, meetingId, {
        schemaVersion: 1,
        model: DEFAULT_ASR_MODEL,
        createdAt: new Date(this.deps.now()).toISOString(),
        speakers: outcome.result.speakers,
        segments: outcome.result.segments.map((s) => ({ ...s, edited: false })),
      });
      const done = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'done', model: DEFAULT_ASR_MODEL, errorMessage: null } : m,
      );
      if (done.status !== 'done') {
        // Встречу поставили заново, пока результат сохранялся: её расшифруют ещё раз — сообщать о готовности рано.
        this.deps.logger.info(`Расшифровка ${meetingId} сохранена, но встреча уже снова в очереди`);
        return null;
      }
      this.deps.logger.info(`Расшифровка готова: ${meetingId}, реплик ${outcome.result.segments.length}`);
      return { meeting: done, ok: true };
    } catch (err) {
      if (current.cancelled) return null;
      // Системные тексты (пути, коды, вывод sherpa-onnx) — только в журнал: во встрече — понятная причина.
      const message = err instanceof ShownError ? err.message : transcriptionTexts.unexpected(err);
      this.deps.logger.error(`Расшифровка не удалась: ${meetingId}`, err);
      const failed = await updateMeeting(libraryDir, meetingId, (m) =>
        m.status === 'transcribing' ? { ...m, status: 'error', errorMessage: message } : m,
      ).catch((writeErr: unknown) => {
        this.deps.logger.error(`Не удалось записать ошибку расшифровки: ${meetingId}`, writeErr);
        return null;
      });
      if (failed && failed.status !== 'error') {
        // Встречу поставили заново, пока записывалась причина: её расшифруют ещё раз — сообщать о сбое незачем.
        this.deps.logger.info(`Расшифровка ${meetingId} не удалась, но встреча уже снова в очереди`);
        return null;
      }
      return failed && { meeting: failed, ok: false };
    }
  }

  /** Обработчики main (окно, уведомления) не должны ломать очередь: их сбой только пишется в журнал. */
  private report(callback: () => void): void {
    try {
      callback();
    } catch (err) {
      this.deps.logger.error('Очередь расшифровки: сбой обработчика', err);
    }
  }

  private runInWorker(current: Current, input: PipelineInput): Promise<Outcome> {
    // Команда собирается до запуска процесса и сторожа: сбой здесь не оставит взведённого сторожа.
    const command: TranscribeCommand = {
      type: 'transcribe',
      jobId: `job-${++this.jobCounter}`,
      input,
      modelsDir: this.deps.models.root,
      model: DEFAULT_ASR_MODEL,
      ffmpegPath: this.deps.ffmpegPath(),
      threads: this.deps.threads(),
    };
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      current.worker = worker;
      current.jobId = command.jobId;
      current.baseLimitMs = Math.max(WATCHDOG_MIN_MS, input.durationSec * 1000 * WATCHDOG_SHARE);
      const arm = (limitMs: number): void => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
          this.deps.logger.error(`Процесс расшифровки молчит ${Math.round(limitMs / 1000)} с — останавливаем`);
          current.settle?.({ kind: 'failed', message: transcriptionTexts.hung });
          this.killWorker(worker);
        }, limitMs);
      };
      current.settle = (outcome) => {
        current.settle = null;
        current.rearm = null;
        clearTimeout(this.watchdog);
        resolve(outcome);
      };
      current.rearm = arm;
      arm(current.baseLimitMs);
      worker.send(command);
    });
  }

  private ensureWorker(): WorkerHandle {
    if (this.worker) return this.worker;
    const worker = this.deps.spawn();
    this.worker = worker;
    worker.onMessage((raw) => this.onWorkerMessage(worker, raw));
    worker.onExit((code) => {
      if (this.worker === worker) this.worker = null;
      const current = this.current;
      // Выход прежнего процесса (закрыт простоем, сторожем или отменой) текущей задачи не касается.
      if (!current?.settle || current.worker !== worker) return;
      if (current.cancelled) {
        current.settle({ kind: 'cancelled' });
        return;
      }
      this.deps.logger.error(`Процесс расшифровки завершился с кодом ${code}`);
      current.settle({ kind: 'failed', message: transcriptionTexts.crashed });
    });
    return worker;
  }

  private onWorkerMessage(worker: WorkerHandle, raw: unknown): void {
    const current = this.current;
    const ours = current !== null && current.worker === worker;
    const parsed = WorkerToMainSchema.safeParse(raw);
    if (!parsed.success) {
      this.deps.logger.warn(`Процесс расшифровки: неверное сообщение: ${parsed.error.message}`);
      // Не ждать сторожа 10+ минут: задача, для которой пришли неверные данные, завершается сразу.
      if (ours && current.settle) {
        current.settle({ kind: 'failed', message: transcriptionTexts.badMessage });
        this.killWorker(worker);
      }
      return;
    }
    const message = parsed.data;
    if (message.type === 'ready') {
      this.deps.logger.info(`Процесс расшифровки запущен (${message.engine})`);
      return;
    }
    if (!ours || message.jobId !== current.jobId) return;
    if (message.type === 'progress') {
      const { stage, fraction, diarize } = message.progress;
      current.clock = diarize ? { from: fraction, to: diarize.to, expectedMs: diarize.expectedMs, startedAt: this.deps.now() } : null;
      current.rearm?.(diarize ? Math.max(current.baseLimitMs, diarize.expectedMs * DIARIZE_WATCHDOG_FACTOR) : current.baseLimitMs);
      this.setProgress(current, { stage, fraction, download: null });
      return;
    }
    current.settle?.(
      message.type === 'done'
        ? { kind: 'done', result: message.result }
        : { kind: 'failed', message: transcriptionTexts.workerFailed(message.message), detail: message.message },
    );
  }

  private setProgress(current: Current, next: Omit<TranscriptionProgress, 'meetingId'>): void {
    const stageChanged = current.progress.stage !== next.stage;
    current.progress = { meetingId: current.job.meetingId, ...next };
    this.emitProgress(stageChanged);
  }

  private emitProgress(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastEmit < PROGRESS_INTERVAL_MS) return;
    this.lastEmit = now;
    // Вызывается и из таймера: сбой обработчика не должен стать необработанным исключением или прервать задачу.
    const progress = this.progress();
    this.report(() => this.deps.progressChanged(progress));
  }
}
