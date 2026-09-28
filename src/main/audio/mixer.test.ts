import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { resolveFfmpegPath, runFfmpeg } from './ffmpeg';
import { existingInputs, meetingsNeedingMix, mixArgs, Mixer, mixMeeting } from './mixer';

const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });

/** Дорожка WebM/Opus с тоном нужной длины, как её пишет MediaRecorder. */
async function toneTrack(file: string, seconds: number, channels: 1 | 2): Promise<void> {
  await runFfmpeg(resolveFfmpegPath(), [
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-ac',
    String(channels),
    '-c:a',
    'libopus',
    '-f',
    'webm',
    file,
  ]);
}

async function recordedMeeting(lib: string, tracks: Meeting['tracks'], durationSec: number | null = null) {
  const meeting = await createMeeting(lib, { source: 'recording', status: 'recording' });
  return updateMeeting(lib, meeting.id, (m) => ({ ...m, status: 'recorded', tracks, durationSec }));
}

describe('mixArgs', () => {
  it('delays each track by its offset and mixes them into mono Opus', () => {
    const args = mixArgs(
      [
        { file: 'mic.webm', offsetMs: 0 },
        { file: 'system.webm', offsetMs: 35.4 },
      ],
      'mix.opus.part',
    );
    expect(args.slice(0, 4)).toEqual(['-i', 'mic.webm', '-i', 'system.webm']);
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('[0:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=0:all=1[a0]');
    expect(filter).toContain('adelay=delays=35:all=1[a1]');
    expect(filter).toContain('[a0][a1]amix=inputs=2:duration=longest:normalize=0[m]');
    expect(args.slice(-9)).toEqual(['-ac', '1', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', 'mix.opus.part']);
  });

  it('passes a single track through', () => {
    const filter = mixArgs([{ file: 'mic.webm', offsetMs: 0 }], 'out')[3];
    expect(filter).toBe('[0:a:0]aresample=48000,aformat=channel_layouts=mono,adelay=delays=0:all=1[a0];[a0]anull[m]');
  });

  it('refuses to mix nothing', () => {
    expect(() => mixArgs([], 'out')).toThrow(RangeError);
  });
});

describe('existingInputs', () => {
  it('skips missing and empty track files', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'mic.webm'), 'x');
    writeFileSync(join(dir, 'system.webm'), '');
    const inputs = await existingInputs(dir, [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 10 },
    ]);
    expect(inputs).toEqual([{ file: join(dir, 'mic.webm'), offsetMs: 0 }]);
  });
});

describe('mixMeeting', () => {
  it('mixes both tracks, respecting the offset, and fills a missing duration', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 1500 },
    ]);
    const dir = audioDir(lib, meeting.id);
    await toneTrack(join(dir, 'mic.webm'), 2, 1);
    await toneTrack(join(dir, 'system.webm'), 2, 2);

    await mixMeeting(lib, meeting.id, resolveFfmpegPath());

    expect(readdirSync(dir).sort()).toEqual(['mic.webm', 'mix.opus', 'system.webm']);
    expect((await readMeeting(lib, meeting.id)).durationSec).toBeCloseTo(3.5, 1);
  });

  it('keeps a known duration', async () => {
    const lib = makeTempDir();
    const meeting = await recordedMeeting(lib, [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], 99);
    await toneTrack(join(audioDir(lib, meeting.id), 'mic.webm'), 1, 1);
    await mixMeeting(lib, meeting.id, resolveFfmpegPath());
    expect((await readMeeting(lib, meeting.id)).durationSec).toBe(99);
  });

  it('fails without tracks and leaves no partial file behind', async () => {
    const lib = makeTempDir();
    const noTracks = await recordedMeeting(lib, []);
    await expect(mixMeeting(lib, noTracks.id, resolveFfmpegPath())).rejects.toThrow('нет записанных дорожек');

    const broken = await recordedMeeting(lib, [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }]);
    writeFileSync(join(audioDir(lib, broken.id), 'mic.webm'), 'не звук');
    await expect(mixMeeting(lib, broken.id, resolveFfmpegPath())).rejects.toThrow(/ffmpeg/);
    expect(existsSync(join(audioDir(lib, broken.id), 'mix.opus.part'))).toBe(false);
  });
});

describe('meetingsNeedingMix', () => {
  const meeting = (id: string, patch: Partial<Meeting>): Meeting =>
    ({ id, status: 'recorded', tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }], ...patch }) as Meeting;

  it('picks finished recordings with tracks and without a mix', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', {}), mixReady: false },
      { kind: 'ok', meeting: meeting('b', {}), mixReady: true },
      { kind: 'ok', meeting: meeting('c', { status: 'recording' }), mixReady: false },
      { kind: 'ok', meeting: meeting('d', { tracks: [] }), mixReady: false },
      { kind: 'ok', meeting: meeting('e', { status: 'error' }), mixReady: false },
      { kind: 'broken', id: 'f', reason: 'x' },
      { kind: 'creating', id: 'g' },
    ];
    expect(meetingsNeedingMix(entries)).toEqual(['a', 'e']);
  });
});

describe('Mixer', () => {
  it('mixes queued meetings one by one without duplicates', async () => {
    const order: string[] = [];
    const onMixed = vi.fn();
    const mixer = new Mixer({
      libraryDir: () => 'lib',
      ffmpegPath: () => 'ffmpeg',
      logger: fakeLogger(),
      onMixed,
      mix: async (_lib, id) => {
        order.push(id);
      },
    });
    mixer.enqueue('a');
    mixer.enqueue('b');
    mixer.enqueue('b');
    await mixer.whenIdle();
    expect(order).toEqual(['a', 'b']);
    expect(onMixed).toHaveBeenCalledTimes(2);
  });

  it('logs a failure and goes on with the next meeting', async () => {
    const logger = fakeLogger();
    const onMixed = vi.fn();
    const mixer = new Mixer({
      libraryDir: () => 'lib',
      ffmpegPath: () => 'ffmpeg',
      logger,
      onMixed,
      mix: async (_lib, id) => {
        if (id === 'bad') throw new Error('boom');
      },
    });
    mixer.enqueue('bad');
    mixer.enqueue('good');
    await mixer.whenIdle();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(onMixed).toHaveBeenCalledWith('good');
    await expect(new Mixer({ libraryDir: () => '', ffmpegPath: () => '', logger, onMixed }).whenIdle()).resolves.toBeUndefined();
  });
});
