import { describe, expect, it } from 'vitest';
import { entryId, MEETING_ID_PATTERN, MeetingSchema, type Meeting } from './meeting';

const valid: Meeting = {
  schemaVersion: 1,
  id: '2026-09-25_1430_a1b2c3',
  title: 'Встреча 25.09.2026 14:30',
  createdAt: '2026-09-25T11:30:00.000Z',
  durationSec: null,
  source: 'recording',
  participantsHint: null,
  model: null,
  status: 'recording',
  errorMessage: null,
  speakerNames: {},
  tracks: [],
  recovered: false,
  audioDeleted: false,
  sourceFileName: null,
};

describe('MEETING_ID_PATTERN', () => {
  it('accepts well-formed ids', () => {
    expect(MEETING_ID_PATTERN.test('2026-09-25_1430_a1b2c3')).toBe(true);
  });

  it.each(['2026-09-25_1430_A1B2C3', '2026-09-25_1430', '../2026-09-25_1430_a1b2c3', '2026-09-25_1430_a1b2c3/x'])(
    'rejects %s',
    (id) => {
      expect(MEETING_ID_PATTERN.test(id)).toBe(false);
    },
  );
});

describe('MeetingSchema', () => {
  it('accepts a valid meeting', () => {
    expect(MeetingSchema.parse(valid)).toEqual(valid);
  });

  it('reads a meeting written by the previous version (no tracks, flags and source file name)', () => {
    const { tracks: _tracks, recovered: _recovered, audioDeleted: _audioDeleted, sourceFileName: _name, ...old } = valid;
    expect(MeetingSchema.parse(old)).toEqual(valid);
  });

  it('accepts a meeting from a file that is still being copied', () => {
    const imported = { ...valid, source: 'import', status: 'importing', sourceFileName: 'Созвон с Ириной.mp4' };
    expect(MeetingSchema.parse(imported)).toEqual(imported);
    const tracks = [{ kind: 'file', file: 'source.mka', startOffsetMs: 0 }];
    expect(MeetingSchema.parse({ ...imported, status: 'recorded', tracks }).tracks).toEqual(tracks);
  });

  it('rejects an empty or too long source file name', () => {
    expect(MeetingSchema.safeParse({ ...valid, sourceFileName: '' }).success).toBe(false);
    expect(MeetingSchema.safeParse({ ...valid, sourceFileName: 'a'.repeat(256) }).success).toBe(false);
  });

  it('keeps fields it does not know (written by a newer version)', () => {
    const parsed = MeetingSchema.parse({ ...valid, summaryLanguage: 'ru', extra: { a: 1 } });
    expect(parsed).toMatchObject({ summaryLanguage: 'ru', extra: { a: 1 } });
  });

  it('accepts tracks with offsets', () => {
    const tracks = [
      { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
      { kind: 'system', file: 'system.webm', startOffsetMs: 35 },
    ];
    expect(MeetingSchema.parse({ ...valid, tracks }).tracks).toEqual(tracks);
  });

  it('trims the title and speaker names', () => {
    const parsed = MeetingSchema.parse({ ...valid, title: '  План  ', speakerNames: { S1: ' Иван ' } });
    expect(parsed.title).toBe('План');
    expect(parsed.speakerNames).toEqual({ S1: 'Иван' });
  });

  it.each([
    ['empty title', { title: '   ' }],
    ['bad date', { createdAt: 'вчера' }],
    ['negative duration', { durationSec: -1 }],
    ['unknown status', { status: 'paused' }],
    ['zero participants', { participantsHint: 0 }],
    ['fractional participants', { participantsHint: 2.5 }],
    ['future schema version', { schemaVersion: 2 }],
    ['unknown track kind', { tracks: [{ kind: 'video', file: 'v.webm', startOffsetMs: 0 }] }],
    ['track file with a path', { tracks: [{ kind: 'mic', file: '../mic.webm', startOffsetMs: 0 }] }],
    ['negative track offset', { tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: -5 }] }],
    ['recovered not a boolean', { recovered: 'yes' }],
    ['audioDeleted not a boolean', { audioDeleted: 1 }],
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('entryId', () => {
  it('returns the id of every kind of entry', () => {
    expect(entryId({ kind: 'ok', meeting: valid, mixReady: false, mixFailed: false })).toBe(valid.id);
    expect(entryId({ kind: 'creating', id: 'x' })).toBe('x');
    expect(entryId({ kind: 'broken', id: 'y', reason: 'r' })).toBe('y');
  });
});
