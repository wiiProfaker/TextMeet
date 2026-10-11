import { existsSync, promises as fsp, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { oddCodecRecording, phoneRecording, videoWithSound } from '../../test-support/media-files';
import { FFMPEG_CANCELLED, FfmpegExitError, resolveFfmpegPath, runFfmpeg } from '../audio/ffmpeg';
import { knownFsReason } from '../fs/fs-errors';
import { copyArgs, copySourceAudio, copyTexts, reencodeArgs, SOURCE_FILE } from './audio-copy';
import { ffmpegInfo } from './probe';

// Настоящий ffmpeg, но видно, сколько раз его запускали.
vi.mock('../audio/ffmpeg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/ffmpeg')>();
  return { ...actual, runFfmpeg: vi.fn((...args: Parameters<typeof actual.runFfmpeg>) => actual.runFfmpeg(...args)) };
});

const ffmpeg = resolveFfmpegPath();
const runs = vi.mocked(runFfmpeg);
/** Сколько раз ffmpeg запускали для звука встречи (тестовые файлы он тоже делает). */
const soundRuns = (): number => runs.mock.calls.filter(([, args]) => args.includes('-map')).length;
const locked = (code: string): Error => Object.assign(new Error(`${code}: resource busy or locked`), { code });
const plenty = async (): Promise<number> => 10 * 1024 ** 3;

describe('copyArgs / reencodeArgs', () => {
  it('takes only the first sound track: as is, or in Opus', () => {
    expect(copyArgs('in.mp4', 'out.part').join(' ')).toBe('-i in.mp4 -map 0:a:0 -vn -sn -dn -c:a copy -f matroska out.part');
    expect(reencodeArgs('in.flv', 'out.part').join(' ')).toBe(
      '-i in.flv -map 0:a:0 -vn -sn -dn -c:a libopus -b:a 96k -f matroska out.part',
    );
  });
});

describe('copySourceAudio', () => {
  beforeEach(() => {
    runs.mockClear();
  });

  it('copies the sound of a video without the picture', async () => {
    const dir = makeTempDir('textmeet-copy-');
    const source = join(dir, 'созвон.mp4');
    await videoWithSound(source, 2);
    const audio = makeTempDir('textmeet-copy-audio-');
    const seen: number[] = [];
    const result = await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty, onProgress: (s) => seen.push(s) });
    expect(result.reencoded).toBe(false);
    expect(result.durationSec).toBeGreaterThan(1.5);
    expect(seen.length).toBeGreaterThan(0);
    expect(readdirSync(audio)).toEqual([SOURCE_FILE]);
    const info = await ffmpegInfo(ffmpeg, join(audio, SOURCE_FILE));
    expect(info).toMatch(/Audio: aac/);
    expect(info).not.toMatch(/Video:/);
  });

  it('copies a phone recording as is', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'Новая запись.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    expect((await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty })).reencoded).toBe(false);
  });

  it('re-encodes a codec that Matroska does not take as is', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'старое.flv');
    await oddCodecRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const result = await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty });
    expect(result.reencoded).toBe(true);
    expect(await ffmpegInfo(ffmpeg, join(audio, SOURCE_FILE))).toMatch(/Audio: opus/);
    expect(readdirSync(audio)).toEqual([SOURCE_FILE]);
  });

  it('names the reason and leaves nothing behind', async () => {
    const dir = makeTempDir('textmeet-copy-');
    const garbage = join(dir, 'сломан.mp3');
    writeFileSync(garbage, 'не звук');
    const audio = makeTempDir('textmeet-copy-audio-');
    await expect(copySourceAudio(ffmpeg, garbage, audio, { freeBytes: plenty })).rejects.toThrow(copyTexts.broken);
    await expect(copySourceAudio(ffmpeg, join(dir, 'нет.mp3'), audio, { freeBytes: plenty })).rejects.toThrow(
      copyTexts.missing,
    );
    await expect(copySourceAudio(ffmpeg, garbage, audio, { freeBytes: async () => 1024 })).rejects.toThrow(
      copyTexts.noSpace,
    );
    expect(readdirSync(audio)).toEqual([]);
  });

  it('stops at once when cancelled and does not try again', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.mp4');
    await videoWithSound(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const abort = new AbortController();
    abort.abort();
    await expect(copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty, signal: abort.signal })).rejects.toThrow(
      FFMPEG_CANCELLED,
    );
    expect(soundRuns()).toBe(1);
    expect(existsSync(join(audio, SOURCE_FILE))).toBe(false);
    expect(readdirSync(audio)).toEqual([]);
  });

  it('does not re-encode when ffmpeg cannot be started', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    await expect(copySourceAudio(join(audio, 'no-ffmpeg.exe'), source, audio, { freeBytes: plenty })).rejects.toThrow();
    expect(soundRuns()).toBe(1);
  });

  it('keeps a good copy while the fresh file is briefly locked', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const rename = fsp.rename.bind(fsp);
    let calls = 0;
    // Защитник Windows ненадолго держит только что записанный файл.
    const busy = vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
      calls += 1;
      if (calls <= 2) throw locked(calls === 1 ? 'EPERM' : 'EBUSY');
      await rename(from, to);
    });
    try {
      expect((await copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty })).reencoded).toBe(false);
    } finally {
      busy.mockRestore();
    }
    expect(soundRuns()).toBe(1);
    expect(readdirSync(audio)).toEqual([SOURCE_FILE]);
  });

  it('gives up on a file that stays locked without re-encoding, says why plainly and leaves nothing behind', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const busy = vi.spyOn(fsp, 'rename').mockRejectedValue(locked('EBUSY'));
    const started = Date.now();
    try {
      // Копия цела — её только не дали переименовать: «файл повреждён» здесь неправда.
      await expect(copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty })).rejects.toThrow(knownFsReason(locked('EBUSY')) ?? '');
      expect(busy.mock.calls.length).toBeGreaterThan(1);
      // Защитник проверяет большой файл секунды: ждём не меньше двух.
      expect(Date.now() - started).toBeGreaterThanOrEqual(2_000);
    } finally {
      busy.mockRestore();
    }
    expect(soundRuns()).toBe(1);
    expect(readdirSync(audio)).toEqual([]);
  }, 15_000);

  it('says the disk is full when ffmpeg ran out of space, even after the partial copy is gone', async () => {
    const source = join(makeTempDir('textmeet-copy-'), 'созвон.m4a');
    await phoneRecording(source, 1);
    const audio = makeTempDir('textmeet-copy-audio-');
    const full = new FfmpegExitError('ffmpeg завершился с кодом 1: Error writing trailer: No space left on device');
    runs.mockRejectedValueOnce(full).mockRejectedValueOnce(full);
    await expect(copySourceAudio(ffmpeg, source, audio, { freeBytes: plenty })).rejects.toThrow(copyTexts.noSpace);
  });
});
