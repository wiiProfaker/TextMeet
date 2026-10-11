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

/**
 * ffmpeg с -progress пишет о ходе работы дважды в секунду. Если он столько молчит — завис
 * (например, на испорченной после сбоя дорожке): останавливаем, чтобы не встала вся очередь сведения.
 */
export const FFMPEG_STALL_MS = 2 * 60_000;

export interface FfmpegRun {
  /** Сколько секунд звука записано в результат; null — ffmpeg не сообщил. */
  durationSec: number | null;
}

export interface FfmpegOptions {
  /** Сколько ffmpeg может молчать, прежде чем его остановят как зависший. */
  stallMs?: number;
  /** Отмена: ffmpeg останавливается, обещание отклоняется с FFMPEG_CANCELLED. */
  signal?: AbortSignal;
  /** Сколько секунд звука уже обработано — по мере работы (из -progress). */
  onProgress?(seconds: number): void;
}

export const FFMPEG_CANCELLED = 'ffmpeg остановлен: работа отменена';

/** ffmpeg запустился и отказался: завершился с ошибкой (а не был отменён, не завис и не запустился вовсе). */
export class FfmpegExitError extends Error {}

/** Запускает ffmpeg с пониженным приоритетом (не мешать идущей записи); ошибка — с хвостом его вывода. */
export function runFfmpeg(ffmpegPath: string, args: readonly string[], options: FfmpegOptions = {}): Promise<FfmpegRun> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  const { signal, onProgress } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(FFMPEG_CANCELLED));
      return;
    }
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
    let stalled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const rearmWatchdog = (): void => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        // Жёстко: зависший ffmpeg может не ответить на SIGTERM (ffmpeg 7 с -re так и висит), а результат всё равно
        // выбрасывается. На Windows любой kill и так жёсткий.
        child.kill('SIGKILL');
      }, stallMs);
    };
    rearmWatchdog();
    let cancelled = false;
    const onAbort = (): void => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    let progress = '';
    let errors = '';
    let reported: number | null = null;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      progress = keepTail(progress + chunk);
      rearmWatchdog();
      if (!onProgress) return;
      // Только целые строки: недописанное «out_time_us=12» показало бы откат назад.
      const seconds = parseProgressDuration(progress.slice(0, progress.lastIndexOf('\n') + 1));
      if (seconds !== null && seconds !== reported) {
        reported = seconds;
        onProgress(seconds);
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = keepTail(errors + chunk);
      rearmWatchdog();
    });
    child.on('error', (err) => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code, killSignal) => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
      if (cancelled) reject(new Error(FFMPEG_CANCELLED));
      else if (stalled) reject(new Error('ffmpeg завис — долго ничего не сообщал и был остановлен'));
      else if (code === 0) resolve({ durationSec: parseProgressDuration(progress) });
      else {
        const how = code === null ? `сигналом ${killSignal}` : `кодом ${code}`;
        reject(new FfmpegExitError(`ffmpeg завершился с ${how}: ${errors.trim().split('\n').slice(-3).join(' | ')}`));
      }
    });
  });
}
