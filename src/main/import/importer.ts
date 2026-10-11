// Очередь импорта (решения Плана 5, §4.3): файл проверяется, встреча создаётся сразу («импорт…»), звук копируется
// по одному файлу за раз. Electron сюда не подключается — окно, сведение и окно «Файл добавлен» внедряются.
import { basename } from 'node:path';
import { MAX_IMPORT_FILES, type ImportFailure, type ImportProgress, type ImportResult } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { knownFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, listMeetings, removeMeetingDir, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copySourceAudio, SOURCE_FILE } from './audio-copy';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';
import { examineFile, probeTexts } from './probe';

/** Имя исходного файла в meeting.json — не длиннее (столько же разрешают Windows и macOS). */
const MAX_FILE_NAME_LENGTH = 255;

export const importTexts = {
  tooMany: `за раз можно добавить до ${MAX_IMPORT_FILES} файлов`,
  notCreated: 'не удалось создать встречу',
  notSaved: 'не удалось сохранить встречу',
  interrupted: 'Импорт прервался. Добавьте файл ещё раз.',
} as const;

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
  failed(failure: ImportFailure): void;
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

const sameJob = (job: ImportJob, libraryDir: string, meetingId: string): boolean =>
  job.libraryDir === libraryDir && job.meetingId === meetingId;

export class Importer {
  private readonly queue: ImportJob[] = [];
  private current: { job: ImportJob; abort: AbortController; done: Promise<void>; seconds: number | null } | null = null;
  private running = false;
  private disposed = false;

  constructor(private readonly deps: ImporterDeps) {}

  /** Проверить файлы, создать их встречи и поставить звук в очередь копирования. */
  async addFiles(libraryDir: string, paths: readonly string[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], failed: [] };
    for (const [index, path] of paths.entries()) {
      const name = basename(path);
      const outcome = index < MAX_IMPORT_FILES ? await this.addFile(libraryDir, path, name) : { reason: importTexts.tooMany };
      if (typeof outcome === 'string') result.added.push(outcome);
      else result.failed.push({ name, reason: outcome.reason });
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
    return this.current !== null || this.queue.length > 0;
  }

  /**
   * Встречу удаляют: снять из очереди или остановить копирование и дождаться, пока ffmpeg отпустит файлы. Ответ —
   * как вернуть файл в очередь (первым), если удалить встречу не выйдет; null — встреча не импортировалась.
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
    await current.done;
    return () => this.requeue(current.job);
  }

  /** Выход из программы: остановить копирование и убрать недоделанные встречи — исходные файлы на месте. */
  async disposeForQuit(): Promise<void> {
    this.disposed = true;
    const jobs = [...this.queue];
    this.queue.length = 0;
    const current = this.current;
    if (current) {
      jobs.unshift(current.job);
      current.abort.abort();
      await current.done;
    }
    for (const job of jobs) {
      await removeMeetingDir(job.libraryDir, job.meetingId).catch((err: unknown) =>
        this.deps.logger.warn(`Недоделанная встреча ${job.meetingId} не убрана при выходе`, err),
      );
    }
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
    this.queue.push({ libraryDir, meetingId: meeting.id, source: path, durationSec: examined.info.durationSec });
    this.deps.libraryChanged();
    this.report();
    this.kick();
    return meeting.id;
  }

  private requeue(job: ImportJob): void {
    if (this.disposed) return;
    this.queue.unshift(job);
    this.report();
    this.kick();
  }

  private kick(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    for (let job = this.queue.shift(); job !== undefined && !this.disposed; job = this.queue.shift()) {
      const abort = new AbortController();
      const current = { job, abort, done: Promise.resolve(), seconds: null as number | null };
      this.current = current;
      this.report();
      current.done = this.importOne(job, abort.signal, (seconds) => {
        current.seconds = seconds;
        this.report();
      });
      await current.done;
      this.current = null;
      this.report();
    }
    this.running = false;
  }

  private report(): void {
    this.deps.progressChanged(this.progress());
  }

  private async importOne(job: ImportJob, signal: AbortSignal, onProgress: (seconds: number) => void): Promise<void> {
    const { libraryDir, meetingId } = job;
    const copy = this.deps.copy ?? copySourceAudio;
    let reason: string;
    try {
      const result = await copy(this.deps.ffmpegPath(), job.source, audioDir(libraryDir, meetingId), {
        signal,
        onProgress,
        freeBytes: this.deps.freeBytes,
      });
      try {
        const meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
          ...m,
          status: 'recorded',
          tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
          durationSec: m.durationSec ?? result.durationSec,
        }));
        this.deps.logger.info(`Импорт готов: ${meetingId}${result.reencoded ? ' (звук перекодирован)' : ''}`);
        this.deps.libraryChanged();
        this.deps.imported({ libraryDir, meeting });
        return;
      } catch (err) {
        this.deps.logger.error(`Звук встречи ${meetingId} скопирован, но встреча не сохранилась`, err);
        reason = knownFsReason(err) ?? importTexts.notSaved;
      }
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Импорт отменён: ${meetingId}`);
        return;
      }
      this.deps.logger.error(`Не удалось скопировать звук встречи ${meetingId}`, err);
      reason = err instanceof Error ? err.message : String(err);
    }
    await this.discard(job, reason);
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
    this.deps.libraryChanged();
    this.deps.failed({ name: basename(job.source), reason });
  }
}

/**
 * При запуске: встречи «импорт…», которых нет в очереди, — импорт прервался сбоем. Встреча остаётся с понятной
 * ошибкой: её можно удалить и добавить файл ещё раз.
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
    } catch (err) {
      logger.error(`Не удалось отметить прерванный импорт ${id}`, err);
    }
  }
  return recovered;
}
