import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static');

export const SAMPLE_RATE = 16000;

/** Декодирует любой аудио/видео файл в моно float32, 16 кГц. */
export function decodeToMono16k(filePath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-v', 'error', '-i', filePath,
      '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      const bytes = Buffer.concat(chunks);
      // Копия в собственный выровненный буфер: Buffer может начинаться с невыровненного смещения.
      const samples = new Float32Array(Math.floor(bytes.length / 4));
      new Uint8Array(samples.buffer).set(bytes.subarray(0, samples.length * 4));
      resolve(samples);
    });
  });
}
