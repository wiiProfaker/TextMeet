import { describe, expect, it } from 'vitest';
import { interpolateDiarize, overallFraction, planSteps } from './progress';
import { planTracks, type TrackInput } from './routing';

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.3 };

describe('progress', () => {
  const plans = planTracks([mic, system], true, 3);
  const steps = planSteps(plans, [100, 100]);

  it('lists the steps in order', () => {
    expect(steps.map((s) => s.stage)).toEqual(['prepare', 'me', 'prepare', 'diarize', 'others']);
  });

  it('grows from 0 to 1 across the steps', () => {
    expect(overallFraction(steps, 0, 0)).toBe(0);
    const middle = overallFraction(steps, 3, 0.5);
    expect(middle).toBeGreaterThan(overallFraction(steps, 3, 0));
    expect(middle).toBeLessThan(overallFraction(steps, 4, 0));
    expect(overallFraction(steps, 4, 1)).toBeCloseTo(1, 10);
    expect(overallFraction(steps, 4, 7)).toBeCloseTo(1, 10);
  });

  it('is zero without steps', () => {
    expect(overallFraction([], 0, 0.5)).toBe(0);
  });

  it('moves the diarization bar by time and stops short of the end', () => {
    const clock = { from: 0.4, to: 0.6, expectedMs: 1000 };
    expect(interpolateDiarize(clock, 0)).toBe(0.4);
    expect(interpolateDiarize(clock, 500)).toBeCloseTo(0.5, 10);
    expect(interpolateDiarize(clock, 10_000)).toBeCloseTo(0.59, 10);
    expect(interpolateDiarize({ ...clock, expectedMs: 0 }, 0)).toBeCloseTo(0.59, 10);
  });
});
