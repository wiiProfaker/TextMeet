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
export async function mixMeeting(libraryDir: string, meetingId: string, ffmpegPath: string): Promise<void> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const inputs = await existingInputs(dir, meeting.tracks);
  if (inputs.length === 0) throw new Error('нет записанных дорожек');
  const part = join(dir, `${MIX_FILE}.part`);
  try {
    const { durationSec } = await runFfmpeg(ffmpegPath, mixArgs(inputs, part));
    await fsp.rename(part, join(dir, MIX_FILE));
    if (meeting.durationSec === null && durationSec !== null) {
      await updateMeeting(libraryDir, meetingId, (m) => ({ ...m, durationSec: m.durationSec ?? durationSec }));
    }
  } catch (err) {
    await fsp.rm(part, { force: true }).catch(() => undefined);
    throw err;
  }
}

/** Встречи, которым нужно сведение: есть дорожки, нет mix.opus, запись закончена. */
export function meetingsNeedingMix(entries: readonly MeetingListEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.kind === 'ok' && !entry.mixReady && entry.meeting.status !== 'recording' && entry.meeting.tracks.length > 0
      ? [entry.meeting.id]
      : [],
  );
}

export interface MixerDeps {
  libraryDir(): string;
  ffmpegPath(): string;
  logger: Logger;
  /** Сведение готово — список встреч надо обновить. */
  onMixed(meetingId: string): void;
  mix?: typeof mixMeeting;
}

/** Очередь сведения: по одной встрече за раз, повторы в очереди не дублируются. */
export class Mixer {
  private readonly queue: string[] = [];
  private running: Promise<void> | null = null;

  constructor(private readonly deps: MixerDeps) {}

  enqueue(meetingId: string): void {
    if (!this.queue.includes(meetingId)) this.queue.push(meetingId);
    this.running ??= this.drain();
  }

  /** Дождаться, пока очередь опустеет (для тестов и выхода). */
  whenIdle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async drain(): Promise<void> {
    const mix = this.deps.mix ?? mixMeeting;
    for (let id = this.queue.shift(); id !== undefined; id = this.queue.shift()) {
      try {
        await mix(this.deps.libraryDir(), id, this.deps.ffmpegPath());
        this.deps.logger.info(`Сведение готово: ${id}`);
        this.deps.onMixed(id);
      } catch (err) {
        this.deps.logger.error(`Не удалось свести дорожки встречи ${id}`, err);
      }
    }
    this.running = null;
  }
}
