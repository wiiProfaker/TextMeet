import { spawn } from 'node:child_process';
import { constants as osConstants, setPriority } from 'node:os';
import { sep } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

/**
 * Путь к ffmpeg из пакета ffmpeg-static. В установленной программе пакет лежит внутри app.asar,
 * а запускать можно только распакованную копию (electron-builder: asarUnpack).
 */
export function resolveFfmpegPath(raw: string | null = ffmpegStatic): string {
  if (!raw) throw new Error('ffmpeg для этой системы не найден');
  return raw.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

/** Длительность обработанного звука из вывода `-progress` (последнее out_time_us), секунды. */
export function parseProgressDuration(progress: string): number | null {
  const matches = [...progress.matchAll(/^out_time_us=(\d+)$/gm)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? null : Number(last) / 1_000_000;
}

const TAIL_CHARS = 4096;
const keepTail = (text: string): string => text.slice(-TAIL_CHARS);

export interface FfmpegRun {
  /** Сколько секунд звука записано в результат; null — ffmpeg не сообщил. */
  durationSec: number | null;
}

/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[]): Promise<FfmpegRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-y', '-nostats', '-progress', 'pipe:1', ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Не удалось понизить приоритет — не страшно.
      }
    }
    let progress = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      progress = keepTail(progress + chunk);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = keepTail(errors + chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ durationSec: parseProgressDuration(progress) });
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${errors.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}
