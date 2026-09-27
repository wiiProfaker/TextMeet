import { describe, expect, it } from 'vitest';
import { MEETING_ID_PATTERN, MeetingSchema, type Meeting } from './meeting';

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
  ])('rejects %s', (_name, patch) => {
    expect(MeetingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
