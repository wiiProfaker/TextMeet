import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    await expect(decodeToMono16k(resolveFfmpegPath(), file, 1)).rejects.toThrow('ffmpeg не прочитал дорожку');
  });

  it('rejects when ffmpeg cannot be started', async () => {
    await expect(decodeToMono16k(join(makeTempDir(), 'no-ffmpeg'), 'x', 1)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
