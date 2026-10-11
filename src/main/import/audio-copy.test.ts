import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { oddCodecRecording, phoneRecording, videoWithSound } from '../../test-support/media-files';
import { FFMPEG_CANCELLED, resolveFfmpegPath } from '../audio/ffmpeg';
import { copyArgs, copySourceAudio, copyTexts, reencodeArgs, SOURCE_FILE } from './audio-copy';
import { ffmpegInfo } from './probe';

const ffmpeg = resolveFfmpegPath();
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
    expect(existsSync(join(audio, SOURCE_FILE))).toBe(false);
    expect(readdirSync(audio)).toEqual([]);
  });
});
