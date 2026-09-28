import { describe, expect, it } from 'vitest';
import { MEETING_ID_PATTERN } from '../../shared/meeting';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

// Даты строятся из местных компонентов, поэтому тесты не зависят от часового пояса машины.
const date = new Date(2026, 8, 5, 9, 7);

describe('makeMeetingId', () => {
  it('builds the id from local date and time', () => {
    expect(makeMeetingId(date, 'a1b2c3')).toBe('2026-09-05_0907_a1b2c3');
  });

  it('rejects a bad suffix', () => {
    expect(() => makeMeetingId(date, 'XYZ')).toThrow(RangeError);
  });
});

describe('randomMeetingSuffix', () => {
  it('produces ids that match the folder pattern', () => {
    for (let i = 0; i < 20; i++) {
      expect(MEETING_ID_PATTERN.test(makeMeetingId(date, randomMeetingSuffix()))).toBe(true);
    }
  });
});

describe('defaultMeetingTitle', () => {
  it('formats the title in Russian style', () => {
    expect(defaultMeetingTitle(date)).toBe('Встреча 05.09.2026 09:07');
  });
});
