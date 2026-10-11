// Что за файл добавляют (решения Плана 5, §4.2): есть ли в нём звук, сколько длится, когда записан. ffmpeg без
// выходного файла печатает сведения о входном и завершается с кодом 1 — его вывод и разбираем.
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { knownFsReason } from '../fs/fs-errors';

export const probeTexts = {
  missing: 'файл не найден',
  folder: 'это папка — перетащите сами файлы',
  notFile: 'это не файл',
  empty: 'файл пустой',
  unreadable: 'не получилось прочитать звук из файла',
  noAudio: 'в файле нет звука',
  unavailable: 'файл недоступен',
} as const;

/** Вывод ffmpeg о файле — не больше этого (у файла с сотней дорожек он длинный, а нужна только шапка). */
const MAX_OUTPUT_CHARS = 64 * 1024;
/** Сведения о файле ffmpeg печатает за доли секунды; файл на уснувшем сетевом диске ждём не дольше. */
export const PROBE_TIMEOUT_MS = 30_000;

export interface MediaInfo {
  hasAudio: boolean;
  /** Длительность из шапки файла; null — ffmpeg её не знает. */
  durationSec: number | null;
  /** creation_time самого файла (не дорожки) как есть; null — нет. */
  creationTime: string | null;
}

/** Разбор вывода `ffmpeg -i`; null — ffmpeg не узнал формат (это не аудио и не видео). */
export function parseProbe(output: string): MediaInfo | null {
  const start = output.indexOf('Input #0');
  if (start === -1) return null;
  const input = output.slice(start);
  const firstStream = input.search(/^\s*Stream #0:/m);
  // Сведения самого файла — до первой дорожки; у дорожек свои creation_time.
  const head = firstStream === -1 ? input : input.slice(0, firstStream);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(head);
  const durationSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null;
  const creation = /^\s*creation_time\s*:\s*(\S.*?)\s*$/m.exec(head);
  return {
    hasAudio: /^\s*Stream #0:\S*: Audio:/m.test(input),
    durationSec,
    creationTime: creation?.[1] ?? null,
  };
}

/** Вывод `ffmpeg -i <файл>` (stderr). Отказ — только если ffmpeg не запустился или завис. */
export function ffmpegInfo(ffmpegPath: string, file: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', file], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk.slice(0, MAX_OUTPUT_CHARS - output.length);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('ffmpeg слишком долго читал сведения о файле'));
      else resolve(output);
    });
  });
}

export type Examined =
  | { ok: true; info: MediaInfo; size: number; modifiedAt: Date }
  | { ok: false; reason: string };

/** Подходит ли файл для импорта; причина отказа — для человека (§2.2). */
export async function examineFile(ffmpegPath: string, file: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<Examined> {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: probeTexts.missing };
    return { ok: false, reason: knownFsReason(err) ?? probeTexts.unavailable };
  }
  if (stat.isDirectory()) return { ok: false, reason: probeTexts.folder };
  if (!stat.isFile()) return { ok: false, reason: probeTexts.notFile };
  if (stat.size === 0) return { ok: false, reason: probeTexts.empty };
  const info = parseProbe(await ffmpegInfo(ffmpegPath, file, timeoutMs));
  if (!info) return { ok: false, reason: probeTexts.unreadable };
  if (!info.hasAudio) return { ok: false, reason: probeTexts.noAudio };
  return { ok: true, info, size: stat.size, modifiedAt: stat.mtime };
}
