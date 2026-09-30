// Число собеседников, если его не указали: своя группировка «отпечатков голоса» (спецификация Плана 3, §4.4).
// Опыты 2026-09-29: запись на двоих → 2 (совпадение с одобренным разделением 96–98 %), один голос → 1,
// открытая запись четырёх человек → 4; встроенный порог библиотеки давал от 1 до 72.

export interface Voiceprint {
  /** Длительность хода, с — вес его отпечатка. */
  durationSec: number;
  /** Отпечаток голоса; null — ход слишком короткий, отпечатка нет. */
  embedding: Float32Array | null;
}

export interface ClusteringOptions {
  /** Группы объединяются, пока косинусное сходство их центров не ниже этого. */
  similarity: number;
  /** Ходы короче не создают групп (их отпечатки ненадёжны), но получают ближайшую. */
  minSeedSec: number;
  /** Группа, у которой речи меньше min(этого, доли всей речи), растворяется в ближайшей крупной. */
  minGroupSec: number;
  minGroupShare: number;
}

export const AUTO_CLUSTERING: ClusteringOptions = {
  similarity: 0.6,
  minSeedSec: 0.5,
  minGroupSec: 20,
  minGroupShare: 0.1,
};

/**
 * Больше стольких ходов группы не создают: самые длинные создают, остальные получают ближайшую группу в конце.
 * Иначе на многочасовой встрече (тысячи ходов) объединение шло бы минутами (сложность — куб числа групп).
 */
export const MAX_SEED_TURNS = 400;

function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function nearest(centroids: readonly Float32Array[], v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < centroids.length; i++) {
    if (dot(centroids[i]!, v) > dot(centroids[best]!, v)) best = i;
  }
  return best;
}

/**
 * Номер собеседника для каждого хода (по порядку входа). Ходы без отпечатка получают −1 —
 * их спикера решает время (соседний ход), см. pipeline.
 */
export function clusterVoiceprints(prints: readonly Voiceprint[], opts: ClusteringOptions = AUTO_CLUSTERING): number[] {
  const unit = prints.map((p) => (p.embedding ? normalize(p.embedding) : null));
  const seeds = prints
    .map((p, i) => ({ i, durationSec: p.durationSec }))
    .filter(({ i, durationSec }) => unit[i] && durationSec >= opts.minSeedSec)
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, MAX_SEED_TURNS);
  if (seeds.length === 0) return prints.map((p) => (p.embedding ? 0 : -1));

  // Группы: сумма нормированных отпечатков с весом длительности, её центр и длительность речи.
  const sums = seeds.map(({ i, durationSec }) => unit[i]!.map((x) => x * durationSec));
  const centers = sums.map(normalize);
  const durations = seeds.map((s) => s.durationSec);
  const alive = seeds.map(() => true);
  const n = seeds.length;
  // Таблица сходств центров и ближайший сосед каждой группы: после объединения пересчитываются одна строка и соседи
  // тех групп, чьим ближайшим была одна из объединённых, а не все пары заново.
  const sim = new Float64Array(n * n);
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const s = dot(centers[a]!, centers[b]!);
      sim[a * n + b] = s;
      sim[b * n + a] = s;
    }
  }
  const nearestOf = new Int32Array(n).fill(-1);
  const nearestSim = new Float64Array(n).fill(-Infinity);
  const findNearest = (a: number): void => {
    nearestOf[a] = -1;
    nearestSim[a] = -Infinity;
    for (let b = 0; b < n; b++) {
      if (b !== a && alive[b] && sim[a * n + b]! > nearestSim[a]!) {
        nearestSim[a] = sim[a * n + b]!;
        nearestOf[a] = b;
      }
    }
  };
  for (let a = 0; a < n; a++) findNearest(a);

  // Объединяем самые похожие группы, пока сходство не ниже порога.
  for (;;) {
    let pa = -1;
    for (let a = 0; a < n; a++) {
      if (alive[a] && nearestOf[a]! >= 0 && (pa < 0 || nearestSim[a]! > nearestSim[pa]!)) pa = a;
    }
    if (pa < 0 || nearestSim[pa]! < opts.similarity) break;
    const pb = nearestOf[pa]!;
    sums[pa] = sums[pa]!.map((x, k) => x + (sums[pb]![k] ?? 0));
    centers[pa] = normalize(sums[pa]!);
    durations[pa] = durations[pa]! + durations[pb]!;
    alive[pb] = false;
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === pa) continue;
      const s = dot(centers[pa]!, centers[c]!);
      sim[pa * n + c] = s;
      sim[c * n + pa] = s;
    }
    findNearest(pa);
    for (let c = 0; c < n; c++) {
      if (!alive[c] || c === pa) continue;
      if (nearestOf[c] === pa || nearestOf[c] === pb) findNearest(c);
      else if (sim[c * n + pa]! > nearestSim[c]!) {
        nearestSim[c] = sim[c * n + pa]!;
        nearestOf[c] = pa;
      }
    }
  }

  // Мелкие группы — почти всегда обрывки одного из крупных голосов.
  const groups = centers.map((center, g) => ({ center, durationSec: durations[g]! })).filter((_, g) => alive[g]);
  const totalSec = groups.reduce((sum, g) => sum + g.durationSec, 0);
  const minSec = Math.min(opts.minGroupSec, opts.minGroupShare * totalSec);
  const big = groups.filter((g) => g.durationSec >= minSec);
  const kept = big.length > 0 ? big : [groups.reduce((a, b) => (b.durationSec > a.durationSec ? b : a))];
  const keptCenters = kept.map((g) => g.center);
  return unit.map((e) => (e ? nearest(keptCenters, e) : -1));
}
