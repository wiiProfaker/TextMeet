import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MeetingStatus, Track } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';
import { finalizeInterrupted, INTERRUPTED_WITHOUT_AUDIO, recoverInterruptedRecordings } from './recovery';

const fakeLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });
const mic: Track = { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 };
const system: Track = { kind: 'system', file: 'system.webm', startOffsetMs: 40 };

async function meetingWith(lib: string, status: MeetingStatus, tracks: Track[], files: Record<string, string>) {
  const created = await createMeeting(lib, { source: 'recording', status });
  const meeting = await updateMeeting(lib, created.id, (m) => ({ ...m, tracks }));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(audioDir(lib, meeting.id), name), content);
  return meeting;
}

describe('finalizeInterrupted', () => {
  it('marks a recording with audio as recorded and recovered, keeping its tracks', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [mic, system], { 'mic.webm': 'x', 'system.webm': 'y' });

    const result = await finalizeInterrupted(lib, meeting.id);

    expect(result).toMatchObject({ status: 'recorded', recovered: true, tracks: [mic, system], durationSec: null });
    expect(await readMeeting(lib, meeting.id)).toEqual(result);
  });

  it('finds track files when the crash came before they were saved in meeting.json', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [], { 'mic.webm': 'x', 'system.webm': '' });
    const result = await finalizeInterrupted(lib, meeting.id);
    expect(result.tracks).toEqual([
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 0 },
    ]);
    expect(result.status).toBe('recorded');
  });

  it('marks a recording without any audio as an error with no tracks to mix', async () => {
    const lib = makeTempDir();
    const meeting = await meetingWith(lib, 'recording', [mic], { 'mic.webm': '' });
    expect(await finalizeInterrupted(lib, meeting.id)).toMatchObject({
      status: 'error',
      recovered: true,
      errorMessage: INTERRUPTED_WITHOUT_AUDIO,
      tracks: [],
    });
  });
});

describe('recoverInterruptedRecordings', () => {
  it('finalizes only meetings left in the recording state', async () => {
    const lib = makeTempDir();
    const interrupted = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const finished = await meetingWith(lib, 'recorded', [mic], { 'mic.webm': 'x' });
    const logger = fakeLogger();

    const recovered = await recoverInterruptedRecordings(lib, logger);

    expect(recovered.map((m) => m.id)).toEqual([interrupted.id]);
    expect((await readMeeting(lib, finished.id)).recovered).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('leaves alone the recording that is going on right now', async () => {
    const lib = makeTempDir();
    const active = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const recovered = await recoverInterruptedRecordings(lib, fakeLogger(), (id) => id === active.id);
    expect(recovered).toEqual([]);
    expect((await readMeeting(lib, active.id)).status).toBe('recording');
  });

  it('skips meetings it cannot read', async () => {
    const lib = makeTempDir();
    const good = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    const bad = await meetingWith(lib, 'recording', [mic], { 'mic.webm': 'x' });
    // Слишком длинное имя спикера: файл не проходит проверку и в списке считается повреждённым.
    const file = join(lib, bad.id, 'meeting.json');
    writeFileSync(file, JSON.stringify({ ...bad, speakerNames: { S1: 'x'.repeat(101) } }));
    const logger = fakeLogger();

    const recovered = await recoverInterruptedRecordings(lib, logger);

    expect(recovered.map((m) => m.id)).toEqual([good.id]);
  });
});
