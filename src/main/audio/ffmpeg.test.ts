import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { parseProgressDuration, resolveFfmpegPath, runFfmpeg } from './ffmpeg';

describe('resolveFfmpegPath', () => {
  it('points inside app.asar.unpacked in the installed app', () => {
    const packed = ['C:', 'TextMeet', 'resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'].join(sep);
    expect(resolveFfmpegPath(packed)).toBe(packed.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`));
  });

  it('keeps a development path as is', () => {
    const dev = ['D:', 'TextMeet', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'].join(sep);
    expect(resolveFfmpegPath(dev)).toBe(dev);
  });

  it('fails clearly when there is no binary for this system', () => {
    expect(() => resolveFfmpegPath(null)).toThrow('ffmpeg для этой системы не найден');
  });

  it('finds the bundled binary', () => {
    expect(resolveFfmpegPath()).toContain('ffmpeg');
  });
});

describe('parseProgressDuration', () => {
  it('takes the last out_time_us value', () => {
    const progress = 'out_time_us=1000000\nprogress=continue\nout_time_us=5000500\nprogress=end\n';
    expect(parseProgressDuration(progress)).toBeCloseTo(5.0005, 6);
  });

  it('returns null when ffmpeg reported no time', () => {
    expect(parseProgressDuration('out_time_us=N/A\nprogress=end\n')).toBeNull();
    expect(parseProgressDuration('')).toBeNull();
  });
});

describe('runFfmpeg', () => {
  it('runs ffmpeg and reports the output duration', async () => {
    const out = join(makeTempDir(), 'tone.opus');
    const run = await runFfmpeg(resolveFfmpegPath(), [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:a',
      'libopus',
      '-f',
      'ogg',
      out,
    ]);
    expect(run.durationSec).toBeCloseTo(2, 1);
  });

  it('rejects with the tail of the ffmpeg log', async () => {
    await expect(runFfmpeg(resolveFfmpegPath(), ['-i', join(makeTempDir(), 'нет.webm'), '-f', 'null', '-'])).rejects.toThrow(
      /ffmpeg завершился с кодом \d+: .+/,
    );
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(runFfmpeg(join(makeTempDir(), 'no-ffmpeg.exe'), [])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
