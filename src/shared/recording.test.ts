import { describe, expect, it } from 'vitest';
import { levelFromPeak, litSegments, METER_SEGMENTS } from './recording';

describe('levelFromPeak', () => {
  it('maps −60…0 dB onto 0…1', () => {
    expect(levelFromPeak(1)).toBe(1);
    expect(levelFromPeak(0.001)).toBeCloseTo(0, 5); // −60 дБ
    expect(levelFromPeak(10 ** (-30 / 20))).toBeCloseTo(0.5, 5);
  });

  it('clamps silence, noise below the floor, overload and garbage', () => {
    expect(levelFromPeak(0)).toBe(0);
    expect(levelFromPeak(0.0001)).toBe(0);
    expect(levelFromPeak(1.7)).toBe(1);
    expect(levelFromPeak(Number.NaN)).toBe(0);
    expect(levelFromPeak(-0.5)).toBe(0);
  });
});

describe('litSegments', () => {
  it('lights all segments at full scale and none in silence', () => {
    expect(litSegments(1)).toBe(METER_SEGMENTS);
    expect(litSegments(0)).toBe(0);
  });

  it('rounds to the nearest segment', () => {
    expect(litSegments(10 ** (-30 / 20))).toBe(10);
    expect(litSegments(10 ** (-30 / 20), 4)).toBe(2);
  });
});
