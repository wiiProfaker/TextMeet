import { describe, it, expect } from 'vitest';
import { clustersFor, mergeTurns, renumberByFirstAppearance, type Turn } from './turns.ts';

describe('mergeTurns', () => {
  it('merges consecutive turns of one speaker separated by a short gap', () => {
    const turns: Turn[] = [
      { start: 0, end: 2, speaker: 0 },
      { start: 2.5, end: 4, speaker: 0 },
    ];
    expect(mergeTurns(turns, 1)).toEqual([{ start: 0, end: 4, speaker: 0 }]);
  });

  it('keeps turns apart when the gap is long or the speaker changes', () => {
    const turns: Turn[] = [
      { start: 0, end: 2, speaker: 0 },
      { start: 5, end: 6, speaker: 0 },
      { start: 6.2, end: 7, speaker: 1 },
    ];
    expect(mergeTurns(turns, 1)).toEqual(turns);
  });

  it('sorts by start time and does not mutate the input', () => {
    const input: Turn[] = [
      { start: 5, end: 6, speaker: 1 },
      { start: 0, end: 1, speaker: 0 },
    ];
    const snapshot = structuredClone(input);
    const out = mergeTurns(input, 1);
    expect(out.map((t) => t.start)).toEqual([0, 5]);
    expect(input).toEqual(snapshot);
  });
});

describe('renumberByFirstAppearance', () => {
  it('relabels speakers in order of first appearance', () => {
    const out = renumberByFirstAppearance([
      { start: 0, end: 1, speaker: 3 },
      { start: 1, end: 2, speaker: 1 },
      { start: 2, end: 3, speaker: 3 },
    ]);
    expect(out.map((t) => t.speaker)).toEqual([0, 1, 0]);
  });
});

describe('clustersFor', () => {
  it('returns -1 (auto) when the number of participants is unknown', () => {
    expect(clustersFor(undefined, false)).toBe(-1);
  });

  it('uses all participants for a single-track recording', () => {
    expect(clustersFor(4, false)).toBe(4);
  });

  it('excludes the user when the microphone is a separate track', () => {
    expect(clustersFor(4, true)).toBe(3);
  });

  it('falls back to auto for invalid or degenerate input', () => {
    expect(clustersFor(0, false)).toBe(-1);
    expect(clustersFor(2.5, false)).toBe(-1);
    expect(clustersFor(1, true)).toBe(-1);
  });
});
