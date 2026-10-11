// Звук из добавленного файла — в папку встречи (решения Плана 5, §4.3). Сначала как есть (быстро и без потерь), в
// Matroska: она принимает почти любой звуковой кодек. Не вышло — перекодирование в Opus. Видео не копируется.
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { TRACK_FILES } from '../../shared/recording';
import { runFfmpeg } from '../audio/ffmpeg';

/** Звук встречи из файла в папке audio/. */
export const SOURCE_FILE = TRACK_FILES.file;
/** Меньше этого свободного места после неудачи — причина, скорее всего, в нём. */
const LOW_SPACE_BYTES = 50 * 1024 * 1024;

export const copyTexts = {
  missing: 'файл не найден',
  noSpace: 'на диске закончилось место',
  broken: 'файл повреждён или его формат не поддерживается',
} as const;

const onlySound = (input: string): string[] => ['-i', input, '-map', '0:a:0', '-vn', '-sn', '-dn'];

/** Первая звуковая дорожка как есть. */
export const copyArgs = (input: string, output: string): string[] => [
  ...onlySound(input),
  '-c:a',
  'copy',
  '-f',
  'matroska',
  output,
];

/** Первая звуковая дорожка — в Opus (кодек, которого Matroska не принимает как есть). */
export const reencodeArgs = (input: string, output: string): string[] => [
  ...onlySound(input),
  '-c:a',
  'libopus',
  '-b:a',
  '96k',
  '-f',
  'matroska',
  output,
];

export interface CopyOptions {
  signal?: AbortSignal;
  onProgress?(seconds: number): void;
  /** Свободное место в папке, байт; null — неизвестно. */
  freeBytes(dir: string): Promise<number | null>;
}

export interface CopyResult {
  /** Сколько секунд звука записано; null — ffmpeg не сообщил. */
  durationSec: number | null;
  reencoded: boolean;
}

/** Почему не вышло — для человека; подробности (вывод ffmpeg) остаются в cause. */
async function failureReason(source: string, dir: string, options: CopyOptions): Promise<string> {
  const sourceExists = await fsp.stat(source).then(
    () => true,
    () => false,
  );
  if (!sourceExists) return copyTexts.missing;
  const free = await options.freeBytes(dir).catch(() => null);
  if (free !== null && free < LOW_SPACE_BYTES) return copyTexts.noSpace;
  return copyTexts.broken;
}

/** Копирует звук файла в `<audioDir>/source.mka`; при отмене и ошибке недописанного файла не остаётся. */
export async function copySourceAudio(
  ffmpegPath: string,
  source: string,
  audioDir: string,
  options: CopyOptions,
): Promise<CopyResult> {
  const part = join(audioDir, `${SOURCE_FILE}.part`);
  const run = async (args: string[]): Promise<number | null> => {
    try {
      const { durationSec } = await runFfmpeg(ffmpegPath, args, { signal: options.signal, onProgress: options.onProgress });
      await fsp.rename(part, join(audioDir, SOURCE_FILE));
      return durationSec;
    } catch (err) {
      await fsp.rm(part, { force: true }).catch(() => undefined);
      throw err;
    }
  };
  try {
    return { durationSec: await run(copyArgs(source, part)), reencoded: false };
  } catch (copyErr) {
    if (options.signal?.aborted) throw copyErr;
    try {
      return { durationSec: await run(reencodeArgs(source, part)), reencoded: true };
    } catch (err) {
      if (options.signal?.aborted) throw err;
      throw new Error(await failureReason(source, audioDir, options), { cause: err });
    }
  }
}
