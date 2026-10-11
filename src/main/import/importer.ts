// Очередь импорта (решения Плана 5, §4.3): файл проверяется, встреча создаётся сразу («импорт…»), звук копируется
// по одному файлу за раз. Electron сюда не подключается — окно, сведение и окно «Файл добавлен» внедряются.
import { promises as fsp } from 'node:fs';
import { basename, join } from 'node:path';
import { MAX_IMPORT_FILES, type ImportFailedEvent, type ImportProgress, type ImportResult } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { knownFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, listMeetings, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copySourceAudio, copyTexts, SOURCE_FILE } from './audio-copy';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';
import { examineFile, probeTexts } from './probe';

/** Имя исходного файла в meeting.json — не длиннее (столько же разрешают Windows и macOS). */
const MAX_FILE_NAME_LENGTH = 255;

export const importTexts = {
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  quitting: 'программа закрывается',
  /** Под заголовком «Импорт прервался» во встрече. */
  interrupted: 'Добавьте файл ещё раз.',
} as const;

/** Причины неудачи копирования, которые можно показать человеку как есть; остальное — «файл повреждён…». */
const SHOWN_COPY_REASONS: readonly string[] = Object.values(copyTexts);

export interface ImporterDeps {
  ffmpegPath(): string;
  logger: Logger;
  now(): Date;
  /** Свободное место в папке, байт; null — неизвестно. */
  freeBytes(dir: string): Promise<number | null>;
  /** Встреча появилась, изменилась или убрана — окно перечитает список. */
  libraryChanged(): void;
  progressChanged(progress: ImportProgress[]): void;
  /** Звук скопирован: сведение и окно «Файл добавлен». */
  imported(event: { libraryDir: string; meeting: Meeting }): void;
  /** Звук не скопировался: недоделанная встреча убрана, окно покажет ошибку. */
  failed(failure: ImportFailedEvent): void;
  examine?: typeof examineFile;
  copy?: typeof copySourceAudio;
}

interface ImportJob {
  /** Папка библиотеки на момент добавления: её могут сменить в настройках, пока файл ждёт очереди. */
  libraryDir: string;
  meetingId: string;
  source: string;
  durationSec: number | null;
}

/** Чем кончилась работа над файлом: готово, не вышло (встреча убрана или с ошибкой) или отменено. */
type Outcome = 'done' | 'failed' | 'cancelled';

interface CurrentJob {
  job: ImportJob;
  abort: AbortController;
  done: Promise<Outcome>;
  seconds: number | null;
}

const sameJob = (job: ImportJob, libraryDir: string, meetingId: string): boolean =>
  job.libraryDir === libraryDir && job.meetingId === meetingId;

export class Importer {
  private readonly queue: ImportJob[] = [];
  private current: CurrentJob | null = null;
  private running = false;
  private disposed = false;
  /** Идущие addFiles: пока файлы проверяются, импорт тоже идёт (папку библиотеки менять нельзя). */
  private adding = 0;

  constructor(private readonly deps: ImporterDeps) {}

  /** Проверить файлы, создать их встречи и поставить звук в очередь копирования. */
  async addFiles(libraryDir: string, paths: readonly string[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], failed: [] };
    this.adding += 1;
    try {
      for (const [index, path] of paths.entries()) {
        const name = basename(path);
        const outcome =
          index < MAX_IMPORT_FILES ? await this.addFile(libraryDir, path, name) : { reason: importTexts.tooMany };
        if (typeof outcome === 'string') result.added.push(outcome);
        else result.failed.push({ name, reason: outcome.reason });
      }
    } finally {
      this.adding -= 1;
    }
    return result;
  }

  /** Встреча ждёт копирования или копируется. */
  isPending(libraryDir: string, meetingId: string): boolean {
    const current = this.current;
    return (
      this.queue.some((job) => sameJob(job, libraryDir, meetingId)) ||
      (current !== null && sameJob(current.job, libraryDir, meetingId))
    );
  }

  progress(): ImportProgress[] {
    const current = this.current;
    const list: ImportProgress[] = [];
    if (current) {
      const { durationSec } = current.job;
      const fraction =
        durationSec && durationSec > 0 ? Math.min(1, Math.max(0, (current.seconds ?? 0) / durationSec)) : null;
      list.push({ meetingId: current.job.meetingId, fraction, waiting: false });
    }
    for (const job of this.queue) list.push({ meetingId: job.meetingId, fraction: null, waiting: true });
    return list;
  }

  isBusy(): boolean {
    return this.adding > 0 || this.current !== null || this.queue.length > 0;
  }

  /**
   * Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. Ответ —
   * как вернуть файл в очередь (первым), если удалить встречу не выйдет; null — возвращать нечего: встреча не
   * импортировалась или её импорт успел закончиться, пока его останавливали.
   */
  async cancel(libraryDir: string, meetingId: string): Promise<(() => void) | null> {
    const waiting = this.queue.findIndex((job) => sameJob(job, libraryDir, meetingId));
    if (waiting !== -1) {
      const job = this.queue[waiting]!;
      this.queue.splice(waiting, 1);
      this.report();
      return () => this.requeue(job);
    }
    const current = this.current;
    if (!current || !sameJob(current.job, libraryDir, meetingId)) return null;
    current.abort.abort();
    return (await current.done) === 'cancelled' ? () => this.requeue(current.job) : null;
  }

  /**
   * Windows завершает сеанс: остановить импорт (новые файлы не берутся, копирование прерывается) без уборки — на неё
   * нет времени, недоделанные встречи разберёт следующий запуск.
   */
  async stop(): Promise<void> {
    await this.halt();
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
  async disposeForQuit(): Promise<void> {
    for (const job of await this.halt()) {
      await removeMeetingDir(job.libraryDir, job.meetingId).catch((err: unknown) =>
        this.deps.logger.warn(`Недоделанная встреча ${job.meetingId} не убрана при выходе`, err),
      );
    }
  }

  /** Остановка; ответ — недоделанные файлы (законченный за время остановки файл в их число не входит). */
  private async halt(): Promise<ImportJob[]> {
    this.disposed = true;
    const jobs = [...this.queue];
    this.queue.length = 0;
    const current = this.current;
    if (current) {
      current.abort.abort();
      if ((await current.done) === 'cancelled') jobs.unshift(current.job);
    }
    return jobs;
  }

  /** id созданной встречи или причина отказа. */
  private async addFile(libraryDir: string, path: string, name: string): Promise<string | { reason: string }> {
    const examine = this.deps.examine ?? examineFile;
    let examined;
    try {
      examined = await examine(this.deps.ffmpegPath(), path);
    } catch (err) {
      this.deps.logger.error(`Не удалось прочитать сведения о файле ${name}`, err);
      return { reason: probeTexts.unreadable };
    }
    if (!examined.ok) {
      this.deps.logger.info(`Файл ${name} не добавлен: ${examined.reason}`);
      return { reason: examined.reason };
    }
    // Пока файл проверялся, программу начали закрывать: встречу уже не создаём.
    if (this.disposed) return { reason: importTexts.quitting };
    const recordedAt = pickRecordedAt(examined.info.creationTime, examined.modifiedAt, this.deps.now());
    let meeting: Meeting;
    try {
      meeting = await createMeeting(libraryDir, {
        source: 'import',
        status: 'importing',
        title: titleFromFileName(name, recordedAt),
        now: recordedAt,
        durationSec: examined.info.durationSec,
        sourceFileName: fitLength(name, MAX_FILE_NAME_LENGTH),
      });
    } catch (err) {
      this.deps.logger.error(`Не удалось создать встречу для файла ${name}`, err);
      return { reason: knownFsReason(err) ?? importTexts.notCreated };
    }
    if (this.disposed) {
      await removeMeetingDir(libraryDir, meeting.id).catch((err: unknown) =>
        this.deps.logger.warn(`Встреча ${meeting.id}, созданная при закрытии программы, не убрана`, err),
      );
      return { reason: importTexts.quitting };
    }
    this.queue.push({ libraryDir, meetingId: meeting.id, source: path, durationSec: examined.info.durationSec });
    this.notify(() => this.deps.libraryChanged());
    this.report();
    this.kick();
    return meeting.id;
  }

  private requeue(job: ImportJob): void {
    // Встречу удаляли дважды, и оба раза не вышло: файл уже вернулся в очередь.
    if (this.disposed || this.isPending(job.libraryDir, job.meetingId)) return;
    this.queue.unshift(job);
    this.report();
    this.kick();
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.drain();
  }

  /** Очередь не встаёт ни от какой ошибки: отказ одного файла — только запись в журнал. */
  private async drain(): Promise<void> {
    try {
      for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
        const abort = new AbortController();
        const current: CurrentJob = { job, abort, done: Promise.resolve<Outcome>('cancelled'), seconds: null };
        this.current = current;
        this.report();
        current.done = this.importOne(job, abort.signal, (seconds) => {
          current.seconds = seconds;
          this.report();
        }).catch((err: unknown) => {
          this.deps.logger.error(`Импорт встречи ${job.meetingId} закончился ошибкой`, err);
          return 'failed' as const;
        });
        await current.done;
        this.current = null;
        this.report();
      }
    } finally {
      this.current = null;
      this.running = false;
    }
  }

  private report(): void {
    this.notify(() => this.deps.progressChanged(this.progress()));
  }

  /** Сообщение наружу (окну, сведению): его сбой не должен ни остановить очередь, ни удалить готовую встречу. */
  private notify(send: () => void): void {
    try {
      send();
    } catch (err) {
      this.deps.logger.error('Сообщение об импорте не доставлено', err);
    }
  }

  private async importOne(job: ImportJob, signal: AbortSignal, onProgress: (seconds: number) => void): Promise<Outcome> {
    const { libraryDir, meetingId } = job;
    const copy = this.deps.copy ?? copySourceAudio;
    let result;
    try {
      result = await copy(this.deps.ffmpegPath(), job.source, audioDir(libraryDir, meetingId), {
        signal,
        onProgress,
        freeBytes: this.deps.freeBytes,
      });
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Импорт отменён: ${meetingId}`);
        return 'cancelled';
      }
      this.deps.logger.error(`Не удалось скопировать звук встречи ${meetingId}`, err);
      const message = err instanceof Error ? err.message : '';
      await this.discard(job, SHOWN_COPY_REASONS.includes(message) ? message : copyTexts.broken);
      return 'failed';
    }
    let meeting: Meeting;
    try {
      meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
        ...m,
        status: 'recorded',
        tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
        durationSec: m.durationSec ?? result.durationSec,
      }));
    } catch (err) {
      this.deps.logger.error(`Звук встречи ${meetingId} скопирован, но встреча не сохранилась`, err);
      await this.discard(job, knownFsReason(err) ?? importTexts.notSaved);
      return 'failed';
    }
    this.deps.logger.info(`Импорт готов: ${meetingId}${result.reencoded ? ' (звук перекодирован)' : ''}`);
    this.notify(() => this.deps.libraryChanged());
    this.notify(() => this.deps.imported({ libraryDir, meeting }));
    return 'done';
  }

  /** Неудача: папка недоделанной встречи убирается (в ней только наша неполная копия); не вышло — встреча с ошибкой. */
  private async discard(job: ImportJob, reason: string): Promise<void> {
    const { libraryDir, meetingId } = job;
    try {
      await removeMeetingDir(libraryDir, meetingId);
    } catch (err) {
      this.deps.logger.warn(`Недоделанная встреча ${meetingId} не убрана`, err);
      await updateMeeting(libraryDir, meetingId, (m) => ({
        ...m,
        status: 'error',
        tracks: [],
        errorMessage: `Не удалось добавить файл: ${reason}.`,
      })).catch((saveErr: unknown) => this.deps.logger.warn(`Ошибка импорта ${meetingId} не записана`, saveErr));
    }
    this.notify(() => this.deps.libraryChanged());
    this.notify(() => this.deps.failed({ meetingId, name: basename(job.source), reason }));
  }
}

/**
 * При запуске: встречи «импорт…», которых нет в очереди, — импорт прервался сбоем. Встреча остаётся с понятной
 * ошибкой (её можно удалить и добавить файл ещё раз), недописанная копия звука удаляется — она бывает большой.
 */
export async function recoverInterruptedImports(
  libraryDir: string,
  logger: Logger,
  isPending: (meetingId: string) => boolean,
): Promise<string[]> {
  const recovered: string[] = [];
  for (const entry of await listMeetings(libraryDir)) {
    if (entry.kind !== 'ok' || entry.meeting.status !== 'importing' || isPending(entry.meeting.id)) continue;
    const id = entry.meeting.id;
    try {
      await updateMeeting(libraryDir, id, (m) =>
        m.status === 'importing' ? { ...m, status: 'error', tracks: [], errorMessage: importTexts.interrupted } : m,
      );
      recovered.push(id);
      logger.warn(`Импорт встречи ${id} прервался — встреча помечена ошибкой`);
      await fsp
        .rm(join(audioDir(libraryDir, id), `${SOURCE_FILE}.part`), { force: true })
        .catch((err: unknown) => logger.warn(`Недописанная копия звука встречи ${id} не удалена`, err));
    } catch (err) {
      logger.error(`Не удалось отметить прерванный импорт ${id}`, err);
    }
  }
  return recovered;
}
