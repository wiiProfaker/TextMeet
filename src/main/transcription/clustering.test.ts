import { describe, expect, it } from 'vitest';
import { AUTO_CLUSTERING, clusterVoiceprints, type Voiceprint } from './clustering';

/** «Голос» — направление в пространстве отпечатков; шум — небольшой сдвиг, детерминированный по номеру. */
const VOICES = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];
function print(voice: number, durationSec: number, n: number): Voiceprint {
  const base = VOICES[voice]!;
  const noise = [0.1, -0.05, 0.08, -0.02].map((x, i) => x * Math.sin(n + i));
  return { durationSec, embedding: Float32Array.from(base.map((x, i) => x + noise[i]!)) };
}

/** Одинаковые номера — один человек (сами номера групп могут отличаться). */
function samePartition(labels: number[], truth: number[]): boolean {
  const map = new Map<number, number>();
  return labels.every((label, i) => {
    const expected = map.get(label);
    if (expected === undefined) map.set(label, truth[i]!);
    return (map.get(label) ?? -1) === truth[i];
  }) && new Set(labels).size === new Set(truth).size;
}

describe('clusterVoiceprints', () => {
  it('finds two speakers of a dialogue', () => {
    const truth = [0, 1, 0, 1, 0, 1, 1, 0];
    const labels = clusterVoiceprints(truth.map((v, n) => print(v, 30, n)));
    expect(samePartition(labels, truth)).toBe(true);
  });

  it('finds one speaker when there is one voice', () => {
    const labels = clusterVoiceprints([0, 0, 0, 0, 0].map((v, n) => print(v, 40, n)));
    expect(new Set(labels)).toEqual(new Set([0]));
  });

  it('finds four speakers of a short recording (small absolute amount of speech)', () => {
    const truth = [0, 1, 2, 3, 0, 1, 2, 3];
    const labels = clusterVoiceprints(truth.map((v, n) => print(v, 3, n)));
    expect(samePartition(labels, truth)).toBe(true);
  });

  it('dissolves a group with too little speech into the nearest big one', () => {
    // Третий «голос» сказал 5 с за 20-минутную встречу — скорее обрывок одного из двух.
    const prints = [print(0, 600, 1), print(1, 600, 2), { durationSec: 5, embedding: Float32Array.from([0.8, 0.2, 0.6, 0]) }];
    const labels = clusterVoiceprints(prints);
    expect(new Set(labels).size).toBe(2);
    expect(labels[2]).toBe(labels[0]);
  });

  it('does not seed groups from very short turns but still labels them', () => {
    const prints = [print(0, 30, 1), print(1, 30, 2), print(1, 0.2, 3)];
    const labels = clusterVoiceprints(prints);
    expect(labels[2]).toBe(labels[1]);
  });

  it('marks turns without a voiceprint', () => {
    expect(clusterVoiceprints([print(0, 30, 1), { durationSec: 0.1, embedding: null }])).toEqual([0, -1]);
  });

  it('copes with no usable voiceprints at all', () => {
    expect(clusterVoiceprints([{ durationSec: 0.2, embedding: Float32Array.from([1, 0]) }])).toEqual([0]);
    expect(clusterVoiceprints([{ durationSec: 3, embedding: null }])).toEqual([-1]);
    expect(clusterVoiceprints([])).toEqual([]);
  });

  it('keeps the largest group when all groups are small', () => {
    const labels = clusterVoiceprints([print(0, 1, 1), print(1, 1, 2)], { ...AUTO_CLUSTERING, minGroupShare: 0.9 });
    expect(new Set(labels).size).toBe(1);
  });

  it('groups a multi-hour meeting quickly', () => {
    // 2000 ходов трёх голосов, отпечатки по 192 числа (как у eres2net).
    const prints = Array.from({ length: 2000 }, (_, n) => {
      const voice = n % 3;
      const embedding = Float32Array.from({ length: 192 }, (_, k) => (k % 3 === voice ? 1 : 0) + 0.05 * Math.sin(n * 7 + k));
      return { durationSec: 2 + (n % 5), embedding };
    });
    const started = performance.now();
    const labels = clusterVoiceprints(prints);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(new Set(labels).size).toBe(3);
    expect(labels[3]).toBe(labels[0]);
  });
});
