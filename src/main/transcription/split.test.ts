import { describe, expect, it } from 'vitest';
import { quietestPoint, splitAtQuietPoints } from './split';

const RATE = 100;
/** Громкий сигнал с тишиной в заданных секундах. */
function signal(seconds: number, quiet: number[]): Float32Array {
  const samples = new Float32Array(seconds * RATE).fill(0.5);
  for (const q of quiet) samples.fill(0, q * RATE, (q + 1) * RATE);
  return samples;
}

describe('quietestPoint', () => {
  it('finds the silent frame', () => {
    expect(quietestPoint(signal(30, [14]), RATE, 10, 20, 0.5)).toBeCloseTo(14.25, 5);
  });

  it('stays inside the given range', () => {
    const point = quietestPoint(signal(30, [5]), RATE, 10, 20, 0.5);
    expect(point).toBeGreaterThanOrEqual(10);
    expect(point).toBeLessThanOrEqual(20);
  });
});

describe('splitAtQuietPoints', () => {
  it('keeps a short interval whole', () => {
    expect(splitAtQuietPoints(signal(30, []), RATE, { start: 2, end: 15 })).toEqual([{ start: 2, end: 15 }]);
  });

  it('cuts a long interval at quiet places into pieces of at most 20 s', () => {
    const pieces = splitAtQuietPoints(signal(60, [15, 33]), RATE, { start: 0, end: 50 });
    expect(pieces).toHaveLength(3);
    // Разрезы — внутри тихих секунд 15 и 33.
    expect(Math.floor(pieces[0]!.end)).toBe(15);
    expect(Math.floor(pieces[1]!.end)).toBe(33);
    expect(pieces.at(-1)!.end).toBe(50);
    for (const p of pieces) expect(p.end - p.start).toBeLessThanOrEqual(20);
  });
});
