import { describe, expect, it } from 'vitest';
import { defaultMeetingTitle } from '../library/naming';
import { fitLength, pickRecordedAt, titleFromFileName } from './naming';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const MODIFIED = new Date('2026-10-04T15:00:00.000Z');

describe('pickRecordedAt', () => {
  it('takes the date written in the file', () => {
    expect(pickRecordedAt('2026-10-04T13:20:05.000000Z', MODIFIED, NOW).toISOString()).toBe('2026-10-04T13:20:05.000Z');
  });

  it('falls back to the time the file was changed when the file has no date', () => {
    expect(pickRecordedAt(null, MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('вчера', MODIFIED, NOW)).toEqual(MODIFIED);
  });

  it('skips dates that cannot be true', () => {
    expect(pickRecordedAt('1904-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('1970-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('2027-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
  });

  it('skips the date of a device whose clock was reset', () => {
    expect(pickRecordedAt('2000-01-01T00:00:00.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('2000-01-01T00:07:31.000000Z', MODIFIED, NOW)).toEqual(MODIFIED);
    expect(pickRecordedAt('2000-01-02T00:00:00.000000Z', MODIFIED, NOW).toISOString()).toBe('2000-01-02T00:00:00.000Z');
  });

  it('allows a clock that is a little fast', () => {
    expect(pickRecordedAt('2026-10-05T20:00:00Z', null, NOW).toISOString()).toBe('2026-10-05T20:00:00.000Z');
  });

  it('uses now when nothing else is believable', () => {
    expect(pickRecordedAt(null, new Date(0), NOW)).toEqual(NOW);
    expect(pickRecordedAt(null, null, NOW)).toEqual(NOW);
  });
});

describe('titleFromFileName', () => {
  const at = new Date(2026, 9, 4, 16, 20);

  it('drops the last extension and the spaces at the ends', () => {
    expect(titleFromFileName('Созвон с Ириной.mp4', at)).toBe('Созвон с Ириной');
    expect(titleFromFileName('  итоги.v2.m4a ', at)).toBe('итоги.v2');
    expect(titleFromFileName('GMT20261002-071500_Recording.mp4', at)).toBe('GMT20261002-071500_Recording');
    expect(titleFromFileName('запись', at)).toBe('запись');
  });

  it('keeps dots that are not an extension', () => {
    expect(titleFromFileName('Встреча 2026.10.05', at)).toBe('Встреча 2026.10.05');
    expect(titleFromFileName('Встреча 2026.10.05.m4a', at)).toBe('Встреча 2026.10.05');
    expect(titleFromFileName('Созвон с Ириной.mp4', at)).toBe('Созвон с Ириной');
    expect(titleFromFileName('Отчёт v1.2', at)).toBe('Отчёт v1.2');
    expect(titleFromFileName('Разговор. Часть первая', at)).toBe('Разговор. Часть первая');
  });

  it('a name of invisible characters becomes the default title', () => {
    expect(titleFromFileName('​‍ .mp3', at)).toBe(defaultMeetingTitle(at));
    expect(titleFromFileName('​Созвон​.mp3', at)).toBe('Созвон');
  });

  it('uses the date of the recording when the name is empty', () => {
    expect(titleFromFileName('.mp3', at)).toBe('Встреча 04.10.2026 16:20');
    expect(titleFromFileName('   .wav', at)).toBe('Встреча 04.10.2026 16:20');
  });

  it('keeps at most 200 characters without cutting a letter in half', () => {
    expect(titleFromFileName(`${'я'.repeat(250)}.mp3`, at)).toBe('я'.repeat(200));
    expect(titleFromFileName(`${'😀'.repeat(250)}.mp3`, at)).toBe('😀'.repeat(100));
  });
});

describe('fitLength', () => {
  it('cuts between characters', () => {
    expect(fitLength('аб😀в', 3)).toBe('аб');
    expect(fitLength('аб😀в', 4)).toBe('аб😀');
    expect(fitLength('аб', 10)).toBe('аб');
  });
});
