import { describe, expect, it } from 'vitest';
import { MANUAL_SCROLL_PAUSE_MS, nextSpeed, segmentAt, shouldFollow, speedLabel } from './playback';

describe('segmentAt', () => {
  const starts = [0.5, 3, 3, 10];

  it('finds the last segment that has started', () => {
    expect(segmentAt(starts, 0.5)).toBe(0);
    expect(segmentAt(starts, 2.9)).toBe(0);
    expect(segmentAt(starts, 3)).toBe(2);
    expect(segmentAt(starts, 9.99)).toBe(2);
    expect(segmentAt(starts, 600)).toBe(3);
  });

  it('is -1 before the first segment and for no segments', () => {
    expect(segmentAt(starts, 0)).toBe(-1);
    expect(segmentAt([], 5)).toBe(-1);
  });
});

describe('speeds', () => {
  it('goes round 1× → 1,5× → 2× → 1×', () => {
    expect(nextSpeed(1)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
    expect(nextSpeed(3)).toBe(1);
  });

  it('labels a speed the Russian way', () => {
    expect(speedLabel(1.5)).toBe('1,5×');
    expect(speedLabel(2)).toBe('2×');
  });
});

describe('shouldFollow', () => {
  const base = { playing: true, editing: false, now: 100_000, lastManualScroll: 0 };

  it('follows the sound while it plays', () => {
    expect(shouldFollow(base)).toBe(true);
  });

  it('does not follow when paused, while a segment is edited or right after a manual scroll', () => {
    expect(shouldFollow({ ...base, playing: false })).toBe(false);
    expect(shouldFollow({ ...base, editing: true })).toBe(false);
    expect(shouldFollow({ ...base, lastManualScroll: base.now - MANUAL_SCROLL_PAUSE_MS + 1 })).toBe(false);
    expect(shouldFollow({ ...base, lastManualScroll: base.now - MANUAL_SCROLL_PAUSE_MS })).toBe(true);
  });
});
