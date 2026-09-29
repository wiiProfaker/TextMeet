import { describe, expect, it } from 'vitest';
import type { Meeting, MeetingListEntry } from '../../shared/meeting';
import {
  cleanDeviceLabel,
  dayLabel,
  formatClock,
  formatDuration,
  formatDurationWithSeconds,
  formatLongDate,
  formatTimeOfDay,
  groupByDay,
  hotkeyKeys,
  launchAtLoginNoticeText,
  meetingNote,
  parseParticipants,
  participantsText,
  pluralize,
} from './format';

const meeting = (id: string, createdAt: Date, patch: Partial<Meeting> = {}): Meeting => ({
  schemaVersion: 1,
  id,
  title: id,
  createdAt: createdAt.toISOString(),
  durationSec: 60,
  source: 'recording',
  participantsHint: null,
  model: null,
  status: 'done',
  errorMessage: null,
  speakerNames: {},
  tracks: [],
  recovered: false,
  ...patch,
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [75, '1:15'],
    [59.6, '1:00'],
    [3725, '1:02:05'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])('shows a dash for %s', (value) => {
    expect(formatDuration(value)).toBe('—');
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00:00'],
    [23 * 60 + 41.9, '00:23:41'],
    [3 * 3600 + 5, '03:00:05'],
    [-4, '00:00:00'],
    [Number.NaN, '00:00:00'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});

describe('formatDurationWithSeconds', () => {
  it.each([
    [15, '15 с'],
    [42 * 60 + 15, '42 мин 15 с'],
    [3600 + 2 * 60 + 5, '1 ч 02 мин 05 с'],
    [-1, '0 с'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDurationWithSeconds(seconds)).toBe(expected);
  });
});

describe('dates', () => {
  it('formats the time of day and the long date in local time', () => {
    const iso = new Date(2026, 8, 27, 16, 5).toISOString();
    expect(formatTimeOfDay(iso)).toBe('16:05');
    expect(formatLongDate(iso)).toBe('27 сентября 2026, 16:05');
  });

  it('shows a dash for garbage', () => {
    expect(formatTimeOfDay('вчера')).toBe('—');
    expect(formatLongDate('вчера')).toBe('—');
  });
});

describe('pluralize / participantsText', () => {
  it.each([
    [1, '1 участник'],
    [2, '2 участника'],
    [4, '4 участника'],
    [5, '5 участников'],
    [11, '11 участников'],
    [12, '12 участников'],
    [21, '21 участник'],
    [22, '22 участника'],
  ])('%s → %s', (n, text) => {
    expect(participantsText(n)).toBe(text);
  });

  it('works for other words', () => {
    expect(pluralize(3, 'встреча', 'встречи', 'встреч')).toBe('встречи');
  });
});

describe('parseParticipants', () => {
  it.each([
    ['7', 7],
    [' 12 ', 12],
    ['1', 1],
    ['50', 50],
    ['0', null],
    ['51', null],
    ['2.5', null],
    ['пять', null],
    ['', null],
    ['100', null],
  ])('%j → %s', (text, value) => {
    expect(parseParticipants(text)).toBe(value);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 28, 15, 0);

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 8, 28, 0, 1), now)).toBe('Сегодня');
    expect(dayLabel(new Date(2026, 8, 27, 23, 59), now)).toBe('Вчера');
  });

  it('shows the date, with the year only for other years', () => {
    expect(dayLabel(new Date(2026, 8, 25, 21, 9), now)).toBe('25 сентября');
    expect(dayLabel(new Date(2025, 11, 31, 10, 0), now)).toBe('31 декабря 2025');
  });

  it('knows yesterday across a month border', () => {
    expect(dayLabel(new Date(2026, 8, 30, 12, 0), new Date(2026, 9, 1, 9, 0))).toBe('Вчера');
  });
});

describe('groupByDay', () => {
  const now = new Date(2026, 8, 28, 15, 0);

  it('groups consecutive meetings of one day', () => {
    const entries: MeetingListEntry[] = [
      { kind: 'ok', meeting: meeting('a', new Date(2026, 8, 28, 14, 30)), mixReady: false, mixFailed: false },
      { kind: 'creating', id: '2026-09-28_1100_bbbbbb' },
      { kind: 'ok', meeting: meeting('c', new Date(2026, 8, 27, 16, 20)), mixReady: false, mixFailed: false },
      { kind: 'broken', id: '2026-09-25_2109_dddddd', reason: 'x' },
      { kind: 'broken', id: 'странная-папка', reason: 'x' },
    ];
    expect(groupByDay(entries, now).map((g) => [g.label, g.entries.length])).toEqual([
      ['Сегодня', 2],
      ['Вчера', 1],
      ['25 сентября', 1],
      ['Без даты', 1],
    ]);
  });

  it('returns no groups for an empty library', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('meetingNote', () => {
  const at = new Date(2026, 8, 28);

  it('marks only meetings with something to say', () => {
    expect(meetingNote(meeting('a', at, { status: 'done' }))).toBeNull();
    expect(meetingNote(meeting('a', at, { status: 'recorded' }))).toEqual({ text: 'записано', tone: 'accent' });
    expect(meetingNote(meeting('a', at, { status: 'recorded', recovered: true }))).toEqual({
      text: 'восстановлена после сбоя',
      tone: 'warn',
    });
    expect(meetingNote(meeting('a', at, { status: 'recording' }))?.tone).toBe('live');
    expect(meetingNote(meeting('a', at, { status: 'queued' }))?.text).toBe('в очереди на расшифровку');
    expect(meetingNote(meeting('a', at, { status: 'transcribing' }))?.text).toBe('расшифровка…');
    expect(meetingNote(meeting('a', at, { status: 'error' }))).toEqual({ text: 'ошибка', tone: 'error' });
  });
});

describe('cleanDeviceLabel', () => {
  it.each([
    ['Default - Микрофон (Logitech PRO X)', 'Микрофон (Logitech PRO X)'],
    ['По умолчанию — Микрофон MacBook Air', 'Микрофон MacBook Air'],
    ['Communications - Headset', 'Headset'],
    ['Микрофон (Realtek)', 'Микрофон (Realtek)'],
  ])('%s → %s', (label, clean) => {
    expect(cleanDeviceLabel(label)).toBe(clean);
  });
});

describe('hotkeyKeys', () => {
  it('splits Windows and Mac labels into keys', () => {
    expect(hotkeyKeys('Ctrl+Space', 'win32')).toEqual(['Ctrl', 'Space']);
    expect(hotkeyKeys('F9', 'win32')).toEqual(['F9']);
    expect(hotkeyKeys('⌥ Space', 'darwin')).toEqual(['⌥', 'Space']);
    expect(hotkeyKeys('⌃⌥⇧ R', 'darwin')).toEqual(['⌃', '⌥', '⇧', 'R']);
    expect(hotkeyKeys('F5', 'darwin')).toEqual(['F5']);
  });
});

describe('launchAtLoginNoticeText', () => {
  it('has no text when everything is fine', () => {
    expect(launchAtLoginNoticeText('none')).toBeNull();
  });

  it('explains the other cases', () => {
    expect(launchAtLoginNoticeText('dev-build')).toContain('установленной');
    expect(launchAtLoginNoticeText('needs-approval')).toContain('Объекты входа');
    expect(launchAtLoginNoticeText('blocked-by-system')).toContain('Диспетчер задач');
    expect(launchAtLoginNoticeText('unsupported')).toContain('не поддерживается');
  });
});
