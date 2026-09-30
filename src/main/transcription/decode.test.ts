import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k, SAMPLE_RATE } from './decode';

/** Тон 440 Гц заданной длины в WebM/Opus — как дорожка записи. */
function toneWebm(seconds: number): string {
  const file = join(makeTempDir(), 'mic.webm');
  execFileSync(resolveFfmpegPath(), [
    '-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-ac', '2', '-c:a', 'libopus', '-f', 'webm', file,
  ]);
  return file;
}

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** «Дорожка», которую ffmpeg читает по сети, а сервер молчит: так выглядит зависший ffmpeg. */
async function silentTrack(): Promise<string> {
  const server = createServer(() => undefined);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mic.webm`;
}

describe('decodeToMono16k', () => {
  it('decodes a track into 16 kHz mono samples', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), toneWebm(2), 2);
    expect(samples.length / SAMPLE_RATE).toBeCloseTo(2, 1);
    expect(Math.max(...samples.subarray(8000, 9000))).toBeGreaterThan(0.05);
  });

  it('grows the buffer when the track is longer than expected', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), toneWebm(3), 0);
    expect(samples.length / SAMPLE_RATE).toBeCloseTo(3, 1);
  });

  it('explains a file ffmpeg cannot read', async () => {
    const file = join(makeTempDir(), 'broken.webm');
    await expect(decodeToMono16k(resolveFfmpegPath(), file, 1)).rejects.toThrow(
      /^ffmpeg не прочитал дорожку \(завершился с кодом \d+\): .+/,
    );
  });

  it('stops ffmpeg that stays silent too long', async () => {
    const started = Date.now();
    await expect(decodeToMono16k(resolveFfmpegPath(), await silentTrack(), 1, { stallMs: 500 })).rejects.toThrow('ffmpeg завис');
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('stops ffmpeg when asked to', async () => {
    const controller = new AbortController();
    const decoding = decodeToMono16k(resolveFfmpegPath(), await silentTrack(), 1, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error('отменено')), 200);
    await expect(decoding).rejects.toThrow('отменено');
  });

  it('does not start ffmpeg when already stopped', async () => {
    const controller = new AbortController();
    controller.abort(new Error('отменено'));
    // Несуществующий ffmpeg: если бы запуск был, ошибка была бы ENOENT.
    await expect(decodeToMono16k(join(makeTempDir(), 'no-ffmpeg'), 'x', 1, { signal: controller.signal })).rejects.toThrow(
      'отменено',
    );
  });

  it('rejects when ffmpeg cannot be started', async () => {
    await expect(decodeToMono16k(join(makeTempDir(), 'no-ffmpeg'), 'x', 1)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
