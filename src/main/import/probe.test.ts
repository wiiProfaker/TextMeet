import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { phoneRecording, videoWithoutSound, videoWithSound } from '../../test-support/media-files';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { examineFile, ffmpegInfo, parseProbe, probeTexts } from './probe';

// Настоящий запуск, но тест может подменить один процесс — зависший.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn((...args: Parameters<typeof actual.spawn>) => actual.spawn(...args)) };
});

const ZOOM = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'GMT20261004-132005_Recording.mp4':
  Metadata:
    major_brand     : isom
    creation_time   : 2026-10-04T13:20:05.000000Z
    encoder         : Lavf60.16.100
  Duration: 00:47:12.34, start: 0.000000, bitrate: 113 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 36 kb/s, 25 fps (default)
    Metadata:
      creation_time   : 2020-01-01T00:00:00.000000Z
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified
`;

describe('parseProbe', () => {
  it('reads the sound, the duration and the date of the file itself', () => {
    expect(parseProbe(ZOOM)).toEqual({ hasAudio: true, durationSec: 47 * 60 + 12.34, creationTime: '2026-10-04T13:20:05.000000Z' });
  });

  it('does not take the date of a track for the date of the file', () => {
    const noFileDate = ZOOM.replace('    creation_time   : 2026-10-04T13:20:05.000000Z\n', '');
    expect(parseProbe(noFileDate)?.creationTime).toBeNull();
  });

  it('a video without sound', () => {
    const video = ZOOM.replace(/ {2}Stream #0:1.*\n/, '');
    expect(parseProbe(video)?.hasAudio).toBe(false);
  });

  it('a raw stream without a known duration', () => {
    const raw = "Input #0, amr, from 'a.amr':\n  Duration: N/A, bitrate: N/A\n  Stream #0:0: Audio: amr_nb (samr), 8000 Hz, mono, flt\n";
    expect(parseProbe(raw)).toEqual({ hasAudio: true, durationSec: null, creationTime: null });
  });

  it('does not take a metadata value for the duration', () => {
    const tagged =
      "Input #0, mp3, from 'a.mp3':\n  Metadata:\n    comment         : Duration: 01:00:00.00\n  Duration: N/A, bitrate: N/A\n" +
      '  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s\n';
    expect(parseProbe(tagged)?.durationSec).toBeNull();
  });

  it('a zero duration means an unknown one', () => {
    expect(parseProbe(ZOOM.replace('Duration: 00:47:12.34', 'Duration: 00:00:00.00'))?.durationSec).toBeNull();
  });

  it('not a media file', () => {
    expect(parseProbe('[in#0 @ 0x1] Error opening input: Invalid data found when processing input\n')).toBeNull();
    expect(parseProbe('')).toBeNull();
  });
});

describe('ffmpegInfo / examineFile', () => {
  const ffmpeg = resolveFfmpegPath();

  it('accepts a video call with sound and reads its date', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'созвон.mp4');
    await videoWithSound(file, 1, '2026-10-04T13:20:05.000000Z');
    const examined = await examineFile(ffmpeg, file);
    expect(examined).toMatchObject({ ok: true, info: { hasAudio: true, creationTime: '2026-10-04T13:20:05.000000Z' } });
    if (!examined.ok) throw new Error('файл не подошёл');
    expect(examined.info.durationSec).toBeGreaterThan(0.9);
    expect(examined.size).toBeGreaterThan(0);
  });

  it('accepts a phone recording', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'Новая запись 3.m4a');
    await phoneRecording(file, 1);
    expect((await examineFile(ffmpeg, file)).ok).toBe(true);
  });

  it('refuses a video without sound, a text file, an empty file, a folder and a missing file', async () => {
    const dir = makeTempDir('textmeet-probe-');
    const silent = join(dir, 'экран.mp4');
    await videoWithoutSound(silent, 1);
    writeFileSync(join(dir, 'отчёт.pdf'), 'не видео');
    writeFileSync(join(dir, 'пусто.mp3'), '');
    mkdirSync(join(dir, 'папка'));
    expect(await examineFile(ffmpeg, silent)).toEqual({ ok: false, reason: probeTexts.noAudio });
    expect(await examineFile(ffmpeg, join(dir, 'отчёт.pdf'))).toEqual({ ok: false, reason: probeTexts.unreadable });
    expect(await examineFile(ffmpeg, join(dir, 'пусто.mp3'))).toEqual({ ok: false, reason: probeTexts.empty });
    expect(await examineFile(ffmpeg, join(dir, 'папка'))).toEqual({ ok: false, reason: probeTexts.folder });
    expect(await examineFile(ffmpeg, join(dir, 'нет.mp3'))).toEqual({ ok: false, reason: probeTexts.missing });
  });

  it('stops ffmpeg that takes too long', async () => {
    const file = join(makeTempDir('textmeet-probe-'), 'a.mp4');
    await videoWithSound(file, 1);
    await expect(ffmpegInfo(ffmpeg, file, 0)).rejects.toThrow('слишком долго');
  });

  it('gives up on time even when the stopped ffmpeg never closes (a stuck network read)', async () => {
    const child = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn(() => true) });
    vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcess);
    const started = Date.now();
    await expect(ffmpegInfo(ffmpeg, 'Z:\\созвон.mp4', 50)).rejects.toThrow('слишком долго');
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('fails when ffmpeg itself is missing', async () => {
    await expect(ffmpegInfo(join(makeTempDir(), 'нет-ffmpeg.exe'), 'a.mp4')).rejects.toThrow();
  });
});
