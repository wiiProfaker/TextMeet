import { spawn } from 'node:child_process';
import { constants as osConstants, setPriority } from 'node:os';

export const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 4;
/** Запас к ожидаемой длительности: дорожка бывает чуть длиннее, чем показал таймер. */
const HEADROOM = 1.05;
const TAIL_CHARS = 2048;

/**
 * Дорожка → 16 кГц моно float32 через ffmpeg (stdout). Буфер выделяется сразу по ожидаемой длительности
 * и при нехватке растёт удвоением: пик памяти ≈ 1× звука, а не 3×, как у склейки кусков (замечание спайка).
 */
export function decodeToMono16k(ffmpegPath: string, file: string, expectedSec: number): Promise<Float32Array> {
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
    child.stdout.on('data', (chunk: Buffer) => {
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
      errors = (errors + text).slice(-TAIL_CHARS);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg не прочитал дорожку (код ${code}): ${errors.trim().split('\n').slice(-2).join(' | ')}`));
        return;
      }
      const samples = Math.floor(used / BYTES_PER_SAMPLE);
      resolve(new Float32Array(buffer.buffer, buffer.byteOffset, samples));
    });
  });
}
