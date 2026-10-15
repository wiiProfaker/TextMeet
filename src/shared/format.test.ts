import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDownloaded,
  formatDownloadedGb,
  formatDurationShort,
  formatLongDate,
  formatMegabytes,
  formatRemaining,
  formatTimestamp,
} from './format';

describe('formatDurationShort', () => {
  it.each([
    [0, 'меньше минуты'],
    [59, 'меньше минуты'],
    [60, '1 мин'],
    [42 * 60 + 15, '42 мин'],
    [3600, '1 ч 00 мин'],
    [3600 + 4 * 60 + 59, '1 ч 04 мин'],
    [2 * 3600 + 35 * 60, '2 ч 35 мин'],
  ])('%s s → %s', (seconds, text) => {
    expect(formatDurationShort(seconds)).toBe(text);
  });

  it('shows a dash for unknown values', () => {
    expect(formatDurationShort(null)).toBe('—');
    expect(formatDurationShort(-1)).toBe('—');
    expect(formatDurationShort(Number.NaN)).toBe('—');
  });
});

describe('formatLongDate', () => {
  it('formats the long date in local time', () => {
    expect(formatLongDate(new Date(2026, 8, 27, 16, 5).toISOString())).toBe('27 сентября 2026, 16:05');
  });

  it('shows a dash for garbage', () => {
    expect(formatLongDate('вчера')).toBe('—');
  });
});

describe('formatTimestamp', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65.9)).toBe('1:05');
    expect(formatTimestamp(724)).toBe('12:04');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(Number.NaN)).toBe('0:00');
  });
});

describe('formatDownloaded', () => {
  it('counts in megabytes', () => {
    expect(formatDownloaded(120.4 * 1024 * 1024, 464 * 1024 * 1024)).toBe('120 из 464 МБ');
    expect(formatDownloaded(-1, 0)).toBe('0 из 0 МБ');
    expect(formatMegabytes(670.6 * 1024 * 1024)).toBe('671 МБ');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 МБ'],
    [50 * 1024 * 1024, '50 МБ'],
    [450 * 1024 * 1024, '0,4 ГБ'],
    [0.8 * 1024 ** 3, '0,8 ГБ'],
    [1024 ** 3, '1,0 ГБ'],
    [9.94 * 1024 ** 3, '9,9 ГБ'],
    [214.4 * 1024 ** 3, '214 ГБ'],
  ])('%s → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });

  it('shows a dash for garbage', () => {
    expect(formatBytes(-5)).toBe('—');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDownloadedGb', () => {
  it('shows the bytes of a big model in gigabytes with one decimal', () => {
    expect(formatDownloadedGb(2.74 * 1024 ** 3, 6_474_702_976)).toBe('2,7 из 6,0 ГБ');
    expect(formatDownloadedGb(0, 5_680_522_464)).toBe('0,0 из 5,3 ГБ');
  });
});

describe('formatRemaining', () => {
  it.each([
    [0, 'осталось меньше минуты'],
    [59, 'осталось меньше минуты'],
    [60, 'осталось около 1 мин'],
    [200, 'осталось около 4 мин'],
    [3900, 'осталось около 1 ч 05 мин'],
  ])('%s с → %s', (seconds, text) => {
    expect(formatRemaining(seconds)).toBe(text);
  });
});
