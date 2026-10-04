import { describe, expect, it } from 'vitest';
import { formatBytes, formatDownloaded, formatDurationShort, formatMegabytes } from './format';

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
