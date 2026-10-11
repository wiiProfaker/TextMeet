// Звук из добавленного файла — в папку встречи (решения Плана 5, §4.3). Сначала как есть (быстро и без потерь), в
// Matroska: она принимает почти любой звуковой кодек. Не вышло — перекодирование в Opus. Видео не копируется.
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { TRACK_FILES } from '../../shared/recording';
import { FfmpegExitError, runFfmpeg } from '../audio/ffmpeg';
import { knownFsReason } from '../fs/fs-errors';

/** Звук встречи из файла в папке audio/. */
export const SOURCE_FILE = TRACK_FILES.file;
/** Меньше этого свободного места после неудачи — причина, скорее всего, в нём. */
const LOW_SPACE_BYTES = 50 * 1024 * 1024;
/**
 * Свежий файл ненадолго держат антивирус (Защитник Windows) и индексатор: переименование повторяется — около 2,75 с,
 * большой файл Защитник проверяет секунды.
 */
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_ATTEMPTS = 12;
const RENAME_DELAY_MS = 250;
/** Так ffmpeg пишет о полном диске; к нашей проверке места копия уже удалена, и место снова есть. */
const NO_SPACE_OUTPUT = /No space left on device/i;

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
async function failureReason(source: string, dir: string, options: CopyOptions, err: unknown): Promise<string> {
  if (err instanceof Error && NO_SPACE_OUTPUT.test(err.message)) return copyTexts.noSpace;
  const sourceExists = await fsp.stat(source).then(
    () => true,
    () => false,
  );
  if (!sourceExists) return copyTexts.missing;
  const free = await options.freeBytes(dir).catch(() => null);
  if (free !== null && free < LOW_SPACE_BYTES) return copyTexts.noSpace;
  return copyTexts.broken;
}

async function renameLocked(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const locked = LOCK_CODES.has((err as NodeJS.ErrnoException | null)?.code ?? '');
      if (!locked || attempt >= RENAME_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, RENAME_DELAY_MS));
    }
  }
}

/** Копирует звук файла в `<audioDir>/source.mka`; при отмене и ошибке недописанного файла не остаётся. */
export async function copySourceAudio(
  ffmpegPath: string,
  source: string,
  audioDir: string,
  options: CopyOptions,
): Promise<CopyResult> {
  const part = join(audioDir, `${SOURCE_FILE}.part`);
  const run = async (args: string[]): Promise<number | null> =>
    (await runFfmpeg(ffmpegPath, args, { signal: options.signal, onProgress: options.onProgress })).durationSec;
  let copied = false;
  try {
    let result: CopyResult;
    try {
      result = { durationSec: await run(copyArgs(source, part)), reencoded: false };
    } catch (copyErr) {
      // Перекодировать — только если ffmpeg отказался копировать как есть; не запустился или отменён — незачем.
      if (!(copyErr instanceof FfmpegExitError)) throw copyErr;
      await fsp.rm(part, { force: true }).catch(() => undefined);
      result = { durationSec: await run(reencodeArgs(source, part)), reencoded: true };
    }
    copied = true;
    await renameLocked(part, join(audioDir, SOURCE_FILE));
    return result;
  } catch (err) {
    await fsp.rm(part, { force: true }).catch(() => undefined);
    if (options.signal?.aborted) throw err;
    // Звук скопирован, файл не дали переименовать: причина — от системы, а не «файл повреждён».
    if (copied) throw new Error(knownFsReason(err) ?? copyTexts.broken, { cause: err });
    throw new Error(await failureReason(source, audioDir, options, err), { cause: err });
  }
}
