import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { MeetingListEntry, Track } from '../../shared/meeting';
import { MIX_FILE } from '../../shared/recording';
import { audioDir, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { runFfmpeg } from './ffmpeg';

export interface MixInput {
  file: string;
  /** Сдвиг начала дорожки, мс. */
  offsetMs: number;
}

/** Аргументы ffmpeg: дорожки со сдвигами → моно Ogg Opus 48 кбит/с. */
export function mixArgs(inputs: readonly MixInput[], output: string): string[] {
  if (inputs.length === 0) throw new RangeError('Нечего сводить: нет дорожек');
  const args = inputs.flatMap((input) => ['-i', input.file]);
  const prepared = inputs.map(
    (input, i) =>
      `[${i}:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=${Math.round(input.offsetMs)}:all=1[a${i}]`,
  );
  const mix =
    inputs.length === 1
      ? '[a0]anull[m]'
      : `${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:duration=longest:normalize=0[m]`;
  return [
    ...args,
    '-filter_complex',
    [...prepared, mix].join(';'),
    '-map',
    '[m]',
    '-ac',
    '1',
    '-c:a',
    'libopus',
    '-b:a',
    '48k',
    '-f',
    'ogg',
    output,
  ];
}

async function nonEmpty(file: string): Promise<boolean> {
  return fsp.stat(file).then(
    (stats) => stats.isFile() && stats.size > 0,
    () => false,
  );
}

/** Какие дорожки есть на диске и не пустые. */
export async function existingInputs(dir: string, tracks: readonly Track[]): Promise<MixInput[]> {
  const inputs: MixInput[] = [];
  for (const track of tracks) {
    const file = join(dir, track.file);
    if (await nonEmpty(file)) inputs.push({ file, offsetMs: track.startOffsetMs });
  }
  return inputs;
}

/** Сводит дорожки встречи в audio/mix.opus; длительность записывает, если её ещё нет (восстановленная запись). */
export async function mixMeeting(
  libraryDir: string,
  meetingId: string,
  ffmpegPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const inputs = await existingInputs(dir, meeting.tracks);
  if (inputs.length === 0) throw new Error('нет записанных дорожек');
  const part = join(dir, `${MIX_FILE}.part`);
  try {
    const { durationSec } = await runFfmpeg(ffmpegPath, mixArgs(inputs, part), { signal });
    await fsp.rename(part, join(dir, MIX_FILE));
    if (meeting.durationSec === null && durationSec !== null) {
      await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, durationSec: m.durationSec ?? durationSec }));
    }
  } catch (err) {
    await fsp.rm(part, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Встречи, которым нужно сведение: есть дорожки, нет mix.opus, запись закончена. Встречи с ошибкой (например,
 * расшифровки) тоже: иначе плеер вечно «готовит запись». У записи, прервавшейся без звука, дорожек нет.
 */
export function meetingsNeedingMix(entries: readonly MeetingListEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'ok' &&
    !entry.mixReady &&
    entry.meeting.status !== 'recording' &&
    entry.meeting.tracks.length > 0
      ? [entry.meeting.id]
      : [],
  );
}

export interface MixerDeps {
  ffmpegPath(): string;
  logger: Logger;
  /** Сведение закончилось (готово или не удалось) — список встреч надо обновить. */
  onSettled(meetingId: string): void;
  mix?: typeof mixMeeting;
}

interface MixJob {
  /**
   * Папка библиотеки на момент постановки в очередь: пока встреча ждёт очереди, папку в настройках
   * могут сменить, а сводить надо там, где встреча лежит.
   */
  libraryDir: string;
  meetingId: string;
}

/** Ключ встречи — её папка: одна и та же встреча может лежать в разных библиотеках. */
const jobKey = (libraryDir: string, meetingId: string): string => join(libraryDir, meetingId);

/** Очередь сведения: по одной встрече за раз, повторы в очереди не дублируются. */
export class Mixer {
  private readonly queue: MixJob[] = [];
  /** Встречи, которые не удалось свести в этом запуске: вместо вечного «Готовим…» окно покажет, что не вышло. */
  private readonly failed = new Set<string>();
  private running = false;
  private current: { job: MixJob; abort: AbortController; done: Promise<void> } | null = null;

  constructor(private readonly deps: MixerDeps) {}

  enqueue(libraryDir: string, meetingId: string): void {
    if (!this.queue.some((job) => job.libraryDir === libraryDir && job.meetingId === meetingId)) {
      this.queue.push({ libraryDir, meetingId });
    }
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  hasFailed(libraryDir: string, meetingId: string): boolean {
    return this.failed.has(jobKey(libraryDir, meetingId));
  }

  /** Встреча ждёт сведения или сводится. */
  isPending(libraryDir: string, meetingId: string): boolean {
    const key = jobKey(libraryDir, meetingId);
    const current = this.current;
    return (
      this.queue.some((job) => jobKey(job.libraryDir, job.meetingId) === key) ||
      (current !== null && jobKey(current.job.libraryDir, current.job.meetingId) === key)
    );
  }

  /** Встречу удаляют: снять из очереди, а если она сводится — остановить ffmpeg и дождаться, пока он отпустит файлы. */
  async cancel(libraryDir: string, meetingId: string): Promise<void> {
    const key = jobKey(libraryDir, meetingId);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const job = this.queue[i]!;
      if (jobKey(job.libraryDir, job.meetingId) === key) this.queue.splice(i, 1);
    }
    this.failed.delete(key);
    const current = this.current;
    if (current && jobKey(current.job.libraryDir, current.job.meetingId) === key) {
      current.abort.abort();
      await current.done;
    }
  }

  private async drain(): Promise<void> {
    const mix = this.deps.mix ?? mixMeeting;
    for (let job = this.queue.shift(); job !== undefined; job = this.queue.shift()) {
      const abort = new AbortController();
      const done = this.mixOne(mix, job, abort.signal);
      this.current = { job, abort, done };
      await done;
      this.current = null;
    }
    this.running = false;
  }

  private async mixOne(mix: typeof mixMeeting, job: MixJob, signal: AbortSignal): Promise<void> {
    const { libraryDir, meetingId } = job;
    try {
      await mix(libraryDir, meetingId, this.deps.ffmpegPath(), signal);
      this.failed.delete(jobKey(libraryDir, meetingId));
      this.deps.logger.info(`Сведение готово: ${meetingId}`);
    } catch (err) {
      if (signal.aborted) {
        this.deps.logger.info(`Сведение отменено: ${meetingId}`);
        return;
      }
      this.failed.add(jobKey(libraryDir, meetingId));
      this.deps.logger.error(`Не удалось свести дорожки встречи ${meetingId}`, err);
    }
    this.deps.onSettled(meetingId);
  }
}
