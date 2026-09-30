import { spawn } from 'node:child_process';
import { constants as osConstants, setPriority } from 'node:os';
import { FFMPEG_STALL_MS } from '../audio/ffmpeg';

export const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 4;
/** Запас к ожидаемой длительности: дорожка бывает чуть длиннее, чем показал таймер. */
const HEADROOM = 1.05;
const TAIL_CHARS = 2048;

export interface DecodeOptions {
  /** Сколько ffmpeg может молчать (ни звука, ни сообщений), прежде чем его остановят как зависший. */
  stallMs?: number;
  /** Отмена: ffmpeg останавливается, обещание отклоняется с причиной отмены. */
  signal?: AbortSignal;
}

/**
 * Дорожка → 16 кГц моно float32 через ffmpeg (stdout). Буфер выделяется сразу по ожидаемой длительности
 * и при нехватке растёт удвоением: пик памяти ≈ 1× звука, а не 3×, как у склейки кусков (замечание спайка).
 * Зависший на испорченной дорожке ffmpeg останавливается сторожем, как при сведении (runFfmpeg).
 */
export function decodeToMono16k(
  ffmpegPath: string,
  file: string,
  expectedSec: number,
  options: DecodeOptions = {},
): Promise<Float32Array> {
  const stallMs = options.stallMs ?? FFMPEG_STALL_MS;
  const { signal } = options;
  const abortReason = (): unknown => signal?.reason ?? new Error('чтение дорожки отменено');
  if (signal?.aborted) return Promise.reject(abortReason());
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (child.pid !== undefined) {
      try {
        setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Не удалось понизить приоритет — не страшно.
      }
    }
    const initialSamples = Math.max(SAMPLE_RATE, Math.ceil(Math.max(0, expectedSec) * HEADROOM * SAMPLE_RATE));
    // allocUnsafeSlow: свой ArrayBuffer с нулевым смещением — Float32Array ляжет на него без копии.
    let buffer = Buffer.allocUnsafeSlow(initialSamples * BYTES_PER_SAMPLE);
    let used = 0;
    let errors = '';
    let stopped: 'stall' | 'abort' | null = null;
    // Жёстко: зависший ffmpeg может не ответить на SIGTERM (ffmpeg 7 под Linux), а результат всё равно не нужен.
    const stop = (why: 'stall' | 'abort'): void => {
      stopped ??= why;
      child.kill('SIGKILL');
    };
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const rearmWatchdog = (): void => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => stop('stall'), stallMs);
    };
    rearmWatchdog();
    const onAbort = (): void => stop('abort');
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = (): void => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      rearmWatchdog();
      if (used + chunk.length > buffer.length) {
        let size = buffer.length * 2;
        while (size < used + chunk.length) size *= 2;
        const bigger = Buffer.allocUnsafeSlow(size);
        buffer.copy(bigger, 0, 0, used);
        buffer = bigger;
      }
      chunk.copy(buffer, used);
      used += chunk.length;
    });
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      rearmWatchdog();
      errors = (errors + text).slice(-TAIL_CHARS);
    });
    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
    child.on('close', (code, exitSignal) => {
      cleanup();
      if (stopped === 'abort') {
        reject(abortReason());
        return;
      }
      if (stopped === 'stall') {
        reject(new Error('ffmpeg завис — долго ничего не сообщал и был остановлен'));
        return;
      }
      if (code !== 0) {
        const how = code === null ? `сигналом ${exitSignal}` : `кодом ${code}`;
        const tail = errors.trim().split('\n').slice(-2).join(' | ');
        reject(new Error(`ffmpeg не прочитал дорожку (завершился с ${how}): ${tail}`));
        return;
      }
      const samples = Math.floor(used / BYTES_PER_SAMPLE);
      resolve(new Float32Array(buffer.buffer, buffer.byteOffset, samples));
    });
  });
}
