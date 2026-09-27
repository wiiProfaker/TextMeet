import { describe, expect, it } from 'vitest';
import { formatDuration, formatMeetingDate, launchAtLoginNoticeText, statusLabel } from './format';

describe('statusLabel', () => {
  it('translates every status', () => {
    expect(statusLabel('recording')).toBe('Идёт запись');
    expect(statusLabel('done')).toBe('Готово');
    expect(statusLabel('error')).toBe('Ошибка');
  });
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

describe('formatMeetingDate', () => {
  it('formats local date and time', () => {
    expect(formatMeetingDate(new Date(2026, 8, 5, 9, 7).toISOString())).toBe('05.09.2026 09:07');
  });

  it('shows a dash for garbage', () => {
    expect(formatMeetingDate('вчера')).toBe('—');
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
