import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import {
  audioDir,
  createMeeting,
  listMeetings,
  meetingDir,
  readMeeting,
  removeMeetingDir,
  saveMeeting,
  updateMeeting,
} from './library';
import { makeTempDir } from '../../test-support/temp-dir';

const tempLibrary = () => join(makeTempDir('textmeet-lib-'), 'library');
const at = new Date(2026, 8, 25, 14, 30);
const suffixes = (...values: string[]) => {
  const queue = [...values];
  return () => queue.shift() ?? 'ffffff';
};

describe('meetingDir', () => {
  it('joins a valid id', () => {
    expect(meetingDir('/lib', '2026-09-25_1430_a1b2c3')).toBe(join('/lib', '2026-09-25_1430_a1b2c3'));
  });

  it('refuses ids that could escape the library', () => {
    expect(() => meetingDir('/lib', '..')).toThrow(RangeError);
    expect(() => meetingDir('/lib', '../2026-09-25_1430_a1b2c3')).toThrow(RangeError);
  });
});

describe('createMeeting', () => {
  it('creates the folder, the audio subfolder and meeting.json', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, {
      source: 'recording',
      status: 'recording',
      now: at,
      randomSuffix: suffixes('a1b2c3'),
    });
    expect(meeting).toMatchObject({
      id: '2026-09-25_1430_a1b2c3',
      title: 'Встреча 25.09.2026 14:30',
      createdAt: at.toISOString(),
      source: 'recording',
      status: 'recording',
      speakerNames: {},
    });
    const dir = join(lib, meeting.id);
    expect(existsSync(join(dir, 'audio'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'meeting.json'), 'utf8'))).toEqual(meeting);
  });

  it('uses a custom title', async () => {
    const meeting = await createMeeting(tempLibrary(), { source: 'import', status: 'queued', title: 'Созвон', now: at });
    expect(meeting.title).toBe('Созвон');
  });

  it('picks another suffix when the folder already exists', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
    const meeting = await createMeeting(lib, {
      source: 'recording',
      status: 'recording',
      now: at,
      randomSuffix: suffixes('aaaaaa', 'bbbbbb'),
    });
    expect(meeting.id).toBe('2026-09-25_1430_bbbbbb');
  });

  it('removes the half-created folder when creation fails', async () => {
    const lib = tempLibrary();
    await expect(
      createMeeting(lib, { source: 'recording', status: 'recording', title: '   ', now: at, randomSuffix: suffixes('a1b2c3') }),
    ).rejects.toThrow();
    expect(existsSync(join(lib, '2026-09-25_1430_a1b2c3'))).toBe(false);
  });

  it('gives up after repeated collisions', async () => {
    const lib = tempLibrary();
    mkdirSync(join(lib, '2026-09-25_1430_aaaaaa'), { recursive: true });
    const always = () => 'aaaaaa';
    await expect(
      createMeeting(lib, { source: 'recording', status: 'recording', now: at, randomSuffix: always }),
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });
});

describe('readMeeting / saveMeeting', () => {
  it('round-trips a meeting', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    const renamed: Meeting = { ...meeting, title: 'Планёрка', status: 'recorded', durationSec: 61.5 };
    await saveMeeting(lib, renamed);
    expect(await readMeeting(lib, meeting.id)).toEqual(renamed);
  });

  it('refuses to save invalid data', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await expect(saveMeeting(lib, { ...meeting, title: '' })).rejects.toThrow();
  });

  it('explains why a meeting cannot be read', async () => {
    const lib = tempLibrary();
    await expect(readMeeting(lib, '2026-09-25_1430_a1b2c3')).rejects.toThrow('не прочитана');
  });
});

describe('listMeetings', () => {
  it('creates a missing library folder and returns an empty list', async () => {
    const lib = tempLibrary();
    expect(await listMeetings(lib)).toEqual([]);
    expect(existsSync(lib)).toBe(true);
  });

  it('lists meetings newest first and marks broken ones', async () => {
    const lib = tempLibrary();
    const older = await createMeeting(lib, {
      source: 'recording',
      status: 'done',
      now: new Date(2026, 8, 20, 10, 0),
    });
    const newer = await createMeeting(lib, { source: 'import', status: 'queued', now: new Date(2026, 8, 25, 9, 0) });
    mkdirSync(join(lib, '2026-09-22_1200_cccccc'));
    writeFileSync(join(lib, '2026-09-22_1200_cccccc', 'meeting.json'), '{oops');
    mkdirSync(join(lib, '2026-09-23_1200_dddddd'));
    mkdirSync(join(lib, 'Разное'));
    writeFileSync(join(lib, 'notes.txt'), 'x');

    const list = await listMeetings(lib);

    expect(list.map((e) => (e.kind === 'ok' ? e.meeting.id : e.id))).toEqual([
      newer.id,
      '2026-09-23_1200_dddddd',
      '2026-09-22_1200_cccccc',
      older.id,
    ]);
    expect(list[0]).toMatchObject({ kind: 'ok', mixReady: false });
    expect(list[1]).toEqual({ kind: 'creating', id: '2026-09-23_1200_dddddd' });
    expect(list[2]).toMatchObject({ kind: 'broken', id: '2026-09-22_1200_cccccc' });
  });

  it('reports whether the listening mix is ready', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recorded', now: at });
    writeFileSync(join(audioDir(lib, meeting.id), 'mix.opus'), 'x');
    expect(await listMeetings(lib)).toEqual([{ kind: 'ok', meeting, mixReady: true }]);
  });

  it('marks a meeting whose id does not match its folder', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'done', now: at });
    const copy = join(lib, '2026-09-26_1000_eeeeee');
    mkdirSync(copy);
    writeFileSync(join(copy, 'meeting.json'), JSON.stringify(meeting));
    const list = await listMeetings(lib);
    expect(list[0]).toMatchObject({ kind: 'broken', id: '2026-09-26_1000_eeeeee' });
    expect(list[0]?.kind === 'broken' && list[0].reason).toContain('не совпадает');
  });

  it('marks a meeting whose meeting.json cannot be read at all', async () => {
    const lib = tempLibrary();
    // meeting.json — папка: чтение падает с EISDIR, а не «нет файла».
    mkdirSync(join(lib, '2026-09-26_1000_ffffff', 'meeting.json'), { recursive: true });
    const list = await listMeetings(lib);
    expect(list[0]).toMatchObject({ kind: 'broken', id: '2026-09-26_1000_ffffff' });
  });
});

describe('updateMeeting', () => {
  it('keeps fields written by a newer version of the app', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    const file = join(meetingDir(lib, meeting.id), 'meeting.json');
    writeFileSync(file, JSON.stringify({ ...meeting, futureField: { keep: true } }));

    const updated = await updateMeeting(lib, meeting.id, (m) => ({ ...m, status: 'recorded' }));

    expect(updated.status).toBe('recorded');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ status: 'recorded', futureField: { keep: true } });
  });

  it('applies concurrent changes of one meeting in order without losing any', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await Promise.all([
      updateMeeting(lib, meeting.id, (m) => ({ ...m, title: 'Планёрка' })),
      updateMeeting(lib, meeting.id, (m) => ({ ...m, durationSec: 90 })),
      updateMeeting(lib, meeting.id, (m) => ({ ...m, participantsHint: 3 })),
    ]);
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ title: 'Планёрка', durationSec: 90, participantsHint: 3 });
  });

  it('reports a failed change and keeps serving the next ones', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await expect(updateMeeting(lib, meeting.id, (m) => ({ ...m, title: '' }))).rejects.toThrow();
    await expect(updateMeeting(lib, meeting.id, (m) => ({ ...m, title: 'Ок' }))).resolves.toMatchObject({ title: 'Ок' });
  });
});

describe('removeMeetingDir', () => {
  it('removes the meeting folder and refuses bad ids', async () => {
    const lib = tempLibrary();
    const meeting = await createMeeting(lib, { source: 'recording', status: 'recording', now: at });
    await removeMeetingDir(lib, meeting.id);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
    await expect(removeMeetingDir(lib, '..')).rejects.toThrow(RangeError);
  });
});
