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
    // Третий «голос» сказал 5 с за 20-минутную встречу — скорее обрывок одного из двух. С обоими голосами
    // сходство ниже порога (0,5 и 0,3), так что он остаётся отдельной группой до растворения.
    const prints = [print(0, 600, 1), print(1, 600, 2), { durationSec: 5, embedding: Float32Array.from([0.5, 0.3, 0.8, 0]) }];
    const labels = clusterVoiceprints(prints);
    expect(new Set(labels).size).toBe(2);
    expect(labels[2]).toBe(labels[0]);
    // Без растворения (порог размера нулевой) это третий собеседник.
    expect(new Set(clusterVoiceprints(prints, { ...AUTO_CLUSTERING, minGroupSec: 0 })).size).toBe(3);
  });

  it('does not seed groups from very short turns but still labels them', () => {
    const prints = [print(0, 30, 1), print(1, 30, 2), print(1, 0.2, 3)];
    const labels = clusterVoiceprints(prints);
    expect(labels[2]).toBe(labels[1]);
  });

  it('marks turns without a voiceprint', () => {
    expect(clusterVoiceprints([print(0, 30, 1), { durationSec: 0.1, embedding: null }])).toEqual([0, -1]);
  });

  it('treats a zero or broken voiceprint as missing', () => {
    const zero = { durationSec: 30, embedding: new Float32Array(4) };
    const broken = { durationSec: 30, embedding: Float32Array.from([Number.NaN, 1, 0, 0]) };
    const labels = clusterVoiceprints([print(0, 30, 1), print(1, 30, 2), zero, broken, print(0, 30, 3)]);
    expect(labels.slice(2, 4)).toEqual([-1, -1]);
    expect(labels[0]).toBe(labels[4]);
    expect(labels[1]).not.toBe(labels[0]);
    expect(clusterVoiceprints([zero, broken])).toEqual([-1, -1]);
  });

  it('keeps a voice whose turns are all short on a long interview', () => {
    // 600 вопросов по 5 с (голос 1) и 600 ответов по 12 с (голос 0): вопросов нет среди 400 самых длинных ходов.
    const truth = Array.from({ length: 1200 }, (_, n) => (n % 2 === 0 ? 1 : 0));
    const prints = truth.map((voice, n) => print(voice, voice === 1 ? 5 : 12, n));
    const labels = clusterVoiceprints(prints);
    expect(samePartition(labels, truth)).toBe(true);
  });

  it('does not grow false speakers on a long meeting of two voices', () => {
    // Как опыт ревью: отпечатки 233 ходов записи на двоих, повторённые 15 раз с небольшим шумом (≈ 3–4 часа).
    // У части ходов отпечаток сильно зашумлён: такие становятся «самыми непохожими» группами, и если считать речью
    // группы все ближайшие к ней ходы, копии этих отпечатков набирают 20 с и превращаются в лишних собеседников.
    // mulberry32: простой, но честный генератор — тест одинаков от запуска к запуску (со старым правилом — 8 «собеседников»).
    let seed = 19;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    };
    const gauss = (): number => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    const DIM = 64;
    const voices = [0, 1].map((v) => Float32Array.from({ length: DIM }, (_, k) => (k % 2 === v ? 1 : 0) / Math.sqrt(DIM / 2)));
    const base = Array.from({ length: 233 }, () => {
      const voice = random() < 0.5 ? 0 : 1;
      const noise = 0.3 + 0.8 * random() ** 3;
      const embedding = voices[voice]!.map((x) => x + (noise * gauss()) / Math.sqrt(DIM));
      return { voice, durationSec: 1 + 14 * random(), embedding };
    });
    const truth: number[] = [];
    const prints: Voiceprint[] = [];
    for (let copy = 0; copy < 15; copy++) {
      for (const b of base) {
        truth.push(b.voice);
        prints.push({ durationSec: b.durationSec, embedding: b.embedding.map((x) => x + (0.1 * gauss()) / Math.sqrt(DIM)) });
      }
    }
    const labels = clusterVoiceprints(prints);
    expect(new Set(labels).size).toBe(2);
    // Метка голоса — та, что у большинства его ходов; у двух голосов метки разные.
    const labelOf = (voice: number): number => {
      const own = labels.filter((_, i) => truth[i] === voice);
      return own.filter((l) => l === 0).length * 2 > own.length ? 0 : 1;
    };
    const voiceLabels = [labelOf(0), labelOf(1)];
    expect(voiceLabels[0]).not.toBe(voiceLabels[1]);
    const agree = labels.filter((label, i) => label === voiceLabels[truth[i]!]).length;
    expect(agree / labels.length).toBeGreaterThan(0.95);
  });

  it('takes all turns as seeds when there are few of them', () => {
    // Порядок ходов не меняет итог, пока кандидатов не больше 400.
    const truth = [0, 1, 0, 2, 1, 0, 2, 2, 1, 0];
    const prints = truth.map((v, n) => print(v, 3 + (n % 4), n));
    const labels = clusterVoiceprints(prints);
    expect(samePartition(labels, truth)).toBe(true);
    const reversed = clusterVoiceprints([...prints].reverse()).reverse();
    expect(samePartition(reversed, truth)).toBe(true);
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

  it('groups a multi-hour meeting in time that grows no faster than the number of turns', () => {
    // Отпечатки по 192 числа (как у eres2net), три голоса. Мерим не секунды (под покрытием и в CI машина медленнее),
    // а рост: вчетверо больше ходов — не больше чем в 8 раз дольше (обычно в 2–4). Без предела на число групп
    // объединение росло бы как квадрат-куб числа ходов (в 16–64 раза), и многочасовая встреча группировалась бы минутами.
    const meeting = (turns: number): Voiceprint[] =>
      Array.from({ length: turns }, (_, n) => {
        const voice = n % 3;
        const embedding = Float32Array.from({ length: 192 }, (_, k) => (k % 3 === voice ? 1 : 0) + 0.05 * Math.sin(n * 7 + k));
        return { durationSec: 2 + (n % 5), embedding };
      });
    // Лучшее из двух прогонов: сборка мусора и соседние процессы делают отдельный замер шумным.
    const timed = (prints: Voiceprint[]): { ms: number; labels: number[] } => {
      let best = { ms: Number.POSITIVE_INFINITY, labels: [] as number[] };
      for (let run = 0; run < 2; run++) {
        const started = performance.now();
        const labels = clusterVoiceprints(prints);
        best = { ms: Math.min(best.ms, performance.now() - started), labels };
      }
      return best;
    };
    clusterVoiceprints(meeting(300)); // разогрев JIT
    const small = timed(meeting(500));
    const large = timed(meeting(2000));
    expect(large.ms).toBeLessThan(8 * small.ms + 100);
    expect(large.ms).toBeLessThan(30_000);
    expect(new Set(large.labels).size).toBe(3);
    expect(large.labels[3]).toBe(large.labels[0]);
  }, 120_000);
});
