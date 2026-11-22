import { describe, expect, it } from 'vitest';
import { AI_SHARE_DEFAULT, AI_SHARE_KEY, clampShare, loadShare, saveShare, shareFromPointer } from './ai-column';

describe('ai column width', () => {
  it('clampShare keeps the share between 20 % and 60 %', () => {
    expect(clampShare(0.1)).toBe(0.2);
    expect(clampShare(0.9)).toBe(0.6);
    expect(clampShare(0.45)).toBe(0.45);
    expect(clampShare(Number.NaN)).toBe(0.38);
  });

  it('shareFromPointer measures from the right edge of the meeting area', () => {
    expect(shareFromPointer(600, { left: 200, width: 1000 })).toBeCloseTo(0.6);
    expect(shareFromPointer(1100, { left: 200, width: 1000 })).toBe(0.2);
    expect(shareFromPointer(100, { left: 200, width: 0 })).toBe(AI_SHARE_DEFAULT);
  });

  it('loadShare falls back to the default on garbage or a failing storage', () => {
    expect(loadShare({ getItem: () => 'abc' })).toBe(0.38);
    expect(
      loadShare({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toBe(0.38);
    expect(loadShare({ getItem: () => '0.5' })).toBe(0.5);
    expect(loadShare({ getItem: () => '0.95' })).toBe(0.6);
    expect(loadShare({ getItem: () => null })).toBe(0.38);
    expect(loadShare(null)).toBe(0.38);
  });

  it('saveShare stores the share and survives a failing storage', () => {
    const stored = new Map<string, string>();
    saveShare({ setItem: (k, v) => stored.set(k, v) }, 0.42);
    expect(stored.get(AI_SHARE_KEY)).toBe('0.42');
    expect(() =>
      saveShare(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        0.4,
      ),
    ).not.toThrow();
    expect(() => saveShare(null, 0.4)).not.toThrow();
  });
});
