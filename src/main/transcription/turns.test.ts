import { describe, expect, it } from 'vitest';
import { exclusiveTurns, fillGaps, mergeTurns, renumberByFirstAppearance, type Turn } from './turns';

const t = (start: number, end: number, speaker: number): Turn => ({ start, end, speaker });

describe('exclusiveTurns', () => {
  it('keeps turns that do not overlap', () => {
    expect(exclusiveTurns([t(5, 6, 1), t(0, 2, 0)])).toEqual([t(0, 2, 0), t(5, 6, 1)]);
  });

  it('drops a short interjection inside another speaker', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(4, 5, 1)])).toEqual([t(0, 10, 0)]);
  });

  it('cuts a long turn around a long one inside it', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(3, 6, 1)])).toEqual([t(0, 3, 0), t(3, 6, 1), t(6, 10, 0)]);
  });

  it('does not leave an empty piece when both start together', () => {
    expect(exclusiveTurns([t(0, 10, 0), t(0, 4, 1)])).toEqual([t(0, 4, 1), t(4, 10, 0)]);
  });

  it('splits a partial overlap in the middle', () => {
    expect(exclusiveTurns([t(0, 4, 0), t(3, 8, 1)])).toEqual([t(0, 3.5, 0), t(3.5, 8, 1)]);
  });

  it('joins overlapping turns of the same speaker', () => {
    expect(exclusiveTurns([t(0, 4, 0), t(3, 8, 0)])).toEqual([t(0, 8, 0)]);
    expect(exclusiveTurns([t(0, 8, 0), t(3, 4, 0)])).toEqual([t(0, 8, 0)]);
  });

  it('handles a chain of overlaps', () => {
    const out = exclusiveTurns([t(0, 4, 0), t(3, 7, 1), t(6, 9, 2)]);
    expect(out).toEqual([t(0, 3.5, 0), t(3.5, 6.5, 1), t(6.5, 9, 2)]);
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.end);
  });

  it('shares a stretch where several nested turns overlap', () => {
    // Внутри хода 0–10 сначала 2–6, затем 4–8 другого голоса: 4–6 не должно распознаваться дважды.
    const out = exclusiveTurns([t(0, 10, 0), t(2, 6, 1), t(4, 8, 2)]);
    expect(out).toEqual([t(0, 2, 0), t(2, 5, 1), t(5, 8, 2), t(8, 10, 0)]);
  });

  it('skips empty turns', () => {
    expect(exclusiveTurns([t(2, 2, 0), t(3, 4, 1)])).toEqual([t(3, 4, 1)]);
  });

  it('never leaves overlaps, whatever the input', () => {
    // Детерминированные «случайные» ходы: 300 наборов по 12 ходов трёх спикеров.
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 300; round++) {
      const input = Array.from({ length: 12 }, () => {
        const start = Math.round(random() * 600) / 10;
        return t(start, start + Math.round(random() * 150) / 10, Math.floor(random() * 3));
      });
      const out = exclusiveTurns(input);
      for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.end);
      for (const turn of out) expect(turn.end).toBeGreaterThan(turn.start);
    }
  });
});

describe('fillGaps', () => {
  it('gives uncovered speech to the nearest speaker', () => {
    const turns = [t(0, 2, 0), t(10, 12, 1)];
    expect(fillGaps(turns, [{ start: 2.5, end: 4 }, { start: 8, end: 9.5 }])).toEqual([
      t(0, 2, 0),
      t(2.5, 4, 0),
      t(8, 9.5, 1),
      t(10, 12, 1),
    ]);
  });

  it('adds only the uncovered part of speech', () => {
    expect(fillGaps([t(1, 3, 0), t(4, 5, 1)], [{ start: 0, end: 6 }])).toEqual([
      t(0, 1, 0),
      t(1, 3, 0),
      t(3, 4, 0),
      t(4, 5, 1),
      t(5, 6, 1),
    ]);
  });

  it('ignores very short leftovers', () => {
    expect(fillGaps([t(0, 2, 0)], [{ start: 1.5, end: 2.3 }])).toEqual([t(0, 2, 0)]);
  });

  it('ignores speech that is already covered', () => {
    expect(fillGaps([t(0, 5, 0)], [{ start: 1, end: 4 }])).toEqual([t(0, 5, 0)]);
  });

  it('assigns speaker 0 when diarization found nothing', () => {
    expect(fillGaps([], [{ start: 1, end: 3 }])).toEqual([t(1, 3, 0)]);
  });
});

describe('mergeTurns', () => {
  it('joins close turns of the same speaker', () => {
    expect(mergeTurns([t(0, 2, 0), t(2.5, 4, 0), t(6, 7, 0)])).toEqual([t(0, 4, 0), t(6, 7, 0)]);
  });

  it('does not join different speakers', () => {
    expect(mergeTurns([t(0, 2, 0), t(2.1, 4, 1)])).toEqual([t(0, 2, 0), t(2.1, 4, 1)]);
  });

  it('stops growing a turn past the length limit', () => {
    expect(mergeTurns([t(0, 50, 0), t(50.5, 70, 0)])).toEqual([t(0, 50, 0), t(50.5, 70, 0)]);
    expect(mergeTurns([t(0, 5, 0), t(5.5, 9, 0)], 1, 8)).toEqual([t(0, 5, 0), t(5.5, 9, 0)]);
  });
});

describe('renumberByFirstAppearance', () => {
  it('numbers speakers in the order they first speak', () => {
    expect(renumberByFirstAppearance([t(0, 1, 3), t(1, 2, 1), t(2, 3, 3)])).toEqual([
      t(0, 1, 0),
      t(1, 2, 1),
      t(2, 3, 0),
    ]);
  });
});
