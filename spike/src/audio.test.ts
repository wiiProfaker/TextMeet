import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeToMono16k, SAMPLE_RATE } from './audio.ts';

const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static');

describe('decodeToMono16k', () => {
  it('decodes a stereo 44.1 kHz file to 16 kHz mono float samples', async () => {
    const file = path.join(os.tmpdir(), `textmeet-tone-${process.pid}.wav`);
    const gen = spawnSync(ffmpegPath, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=44100',
      '-ac', '2', file,
    ]);
    expect(gen.status).toBe(0);
    try {
      const samples = await decodeToMono16k(file);
      expect(Math.abs(samples.length - SAMPLE_RATE)).toBeLessThan(200);
      const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      expect(peak).toBeGreaterThan(0.05);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('rejects with the ffmpeg error for a missing file', async () => {
    await expect(decodeToMono16k(path.join(os.tmpdir(), 'textmeet-no-such-file.m4a'))).rejects.toThrow(
      /ffmpeg exited/,
    );
  });
});
