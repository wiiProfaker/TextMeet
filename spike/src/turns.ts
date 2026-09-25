export interface Turn {
  readonly start: number; // секунды
  readonly end: number;
  readonly speaker: number; // номер кластера, с нуля
}

export function mergeTurns(turns: readonly Turn[], maxGapSec: number): Turn[] {
  const sorted = [...turns].sort((a, b) => a.start - b.start);
  return sorted.reduce<Turn[]>((acc, turn) => {
    const last = acc[acc.length - 1];
    if (last && last.speaker === turn.speaker && turn.start - last.end <= maxGapSec) {
      return [...acc.slice(0, -1), { ...last, end: Math.max(last.end, turn.end) }];
    }
    return [...acc, turn];
  }, []);
}

/** Ожидает реплики, отсортированные по времени. */
export function renumberByFirstAppearance(turns: readonly Turn[]): Turn[] {
  const order = turns.reduce<number[]>(
    (acc, t) => (acc.includes(t.speaker) ? acc : [...acc, t.speaker]),
    [],
  );
  return turns.map((t) => ({ ...t, speaker: order.indexOf(t.speaker) }));
}

/**
 * Число кластеров для диаризации по подсказке «сколько человек было, включая вас».
 * -1 означает «определить автоматически».
 */
export function clustersFor(participants: number | undefined, hasSeparateMicTrack: boolean): number {
  if (participants === undefined || !Number.isInteger(participants) || participants < 1) {
    return -1;
  }
  const others = hasSeparateMicTrack ? participants - 1 : participants;
  return others >= 1 ? others : -1;
}
