import { describe, it, expect } from 'vitest';
import { quietestPoint, splitAtQuietPoints } from './split.ts';

const SR = 16000;
const OPTS = { maxLen: 20, minLen: 10, frameSec: 0.05 } as const;

/** Синус 440 Гц с тишиной на заданных промежутках (секунды). */
function tone(seconds: number, silences: ReadonlyArray<readonly [number, number]>): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => {
    const t = i / SR;
    const silent = silences.some(([a, b]) => t >= a && t < b);
    return silent ? 0 : 0.5 * Math.sin(2 * Math.PI * 440 * t);
  });
}

describe('quietestPoint', () => {
  it('finds the silent gap inside the search window', () => {
    const point = quietestPoint(tone(30, [[15, 15.2]]), SR, 10, 20, 0.05);
    expect(point).toBeGreaterThanOrEqual(15);
    expect(point).toBeLessThanOrEqual(15.2);
  });
});

describe('splitAtQuietPoints', () => {
  it('keeps a short interval whole', () => {
    expect(splitAtQuietPoints(tone(18, []), SR, { start: 0, end: 18 }, OPTS)).toEqual([
      { start: 0, end: 18 },
    ]);
  });

  it('cuts a long interval at the silent gap', () => {
    const pieces = splitAtQuietPoints(tone(30, [[15, 15.2]]), SR, { start: 0, end: 30 }, OPTS);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].start).toBe(0);
    expect(pieces[0].end).toBeGreaterThanOrEqual(15);
    expect(pieces[0].end).toBeLessThanOrEqual(15.2);
    expect(pieces[1]).toEqual({ start: pieces[0].end, end: 30 });
  });

  it('never produces pieces longer than maxLen', () => {
    const pieces = splitAtQuietPoints(
      tone(50, [[14, 14.2], [31, 31.2]]),
      SR,
      { start: 0, end: 50 },
      OPTS,
    );
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) expect(p.end - p.start).toBeLessThanOrEqual(OPTS.maxLen);
    expect(pieces[pieces.length - 1].end).toBe(50);
  });

  it('handles an interval that does not start at zero', () => {
    const pieces = splitAtQuietPoints(tone(40, [[22, 22.2]]), SR, { start: 8, end: 40 }, OPTS);
    expect(pieces[0].start).toBe(8);
    expect(pieces[0].end).toBeGreaterThanOrEqual(22);
    expect(pieces[0].end).toBeLessThanOrEqual(22.2);
    expect(pieces[pieces.length - 1].end).toBe(40);
  });
});
