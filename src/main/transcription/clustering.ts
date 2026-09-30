// Число собеседников, если его не указали: своя группировка «отпечатков голоса» (спецификация Плана 3, §4.4).
// Опыты 2026-09-29: запись на двоих → 2 (совпадение с одобренным разделением 96–98 %), один голос → 1,
// открытая запись четырёх человек → 4; встроенный порог библиотеки давал от 1 до 72.

export interface Voiceprint {
  /** Длительность хода, с — вес его отпечатка. */
  durationSec: number;
  /** Отпечаток голоса; null — ход слишком короткий, отпечатка нет. Нулевой или с NaN считается отсутствующим. */
  embedding: Float32Array | null;
}

export interface ClusteringOptions {
  /** Группы объединяются, пока косинусное сходство их центров не ниже этого. */
  similarity: number;
  /** Ходы короче не создают групп (их отпечатки ненадёжны), но получают ближайшую. */
  minSeedSec: number;
  /**
   * Группа, у которой речи меньше min(этого, доли всей речи), растворяется в ближайшей крупной.
   * Речь группы — все ходы, которым она ближайшая; вся речь — все ходы дорожки.
   */
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
 * Больше стольких ходов группы не создают, остальные получают ближайшую группу в конце.
 * Иначе на многочасовой встрече (тысячи ходов) объединение шло бы минутами (сложность — куб числа групп).
 */
export const MAX_SEED_TURNS = 400;
/**
 * Из них столько выбираются как самые непохожие на уже выбранные: самые длинные ходы на интервью — почти все
 * ответы, и голос, который только коротко спрашивает, иначе не создал бы группы и исчез.
 */
const DIVERSE_SEED_TURNS = MAX_SEED_TURNS / 4;

function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/** Нормированный отпечаток; null — отпечатка нет или он испорчен (нулевой, NaN, бесконечность). */
function unitOrNull(v: Float32Array | null): Float32Array | null {
  if (!v) return null;
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (!(norm > 0 && Number.isFinite(norm))) return null;
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

interface Candidate {
  i: number;
  durationSec: number;
}

/**
 * Ходы, создающие группы (кандидаты — по времени). Если их не больше MAX_SEED_TURNS — все. Иначе встреча делится
 * на равные по числу ходов окна и из каждого берётся самый длинный ход (голоса со всей встречи, а не с одного
 * её края), а остальные места занимают ходы, самые непохожие на уже выбранные: так группу получит и голос,
 * чьи ходы все короткие. Порядок — как раньше: от длинных к коротким.
 */
function chooseSeeds(candidates: readonly Candidate[], unit: readonly (Float32Array | null)[]): Candidate[] {
  const byLength = (list: Candidate[]): Candidate[] => list.sort((a, b) => b.durationSec - a.durationSec);
  const n = candidates.length;
  if (n <= MAX_SEED_TURNS) return byLength([...candidates]);
  const chosen = new Set<number>();
  const windows = MAX_SEED_TURNS - DIVERSE_SEED_TURNS;
  for (let w = 0; w < windows; w++) {
    const from = Math.floor((w * n) / windows);
    const to = Math.floor(((w + 1) * n) / windows);
    let longest = from;
    for (let k = from + 1; k < to; k++) if (candidates[k]!.durationSec > candidates[longest]!.durationSec) longest = k;
    chosen.add(longest);
  }
  // Сходство каждого кандидата с самым похожим из выбранных; следующим берётся наименее похожий.
  const closest = new Float64Array(n).fill(-Infinity);
  const take = (k: number): void => {
    const v = unit[candidates[k]!.i]!;
    for (let c = 0; c < n; c++) closest[c] = Math.max(closest[c]!, dot(v, unit[candidates[c]!.i]!));
  };
  for (const k of chosen) take(k);
  while (chosen.size < MAX_SEED_TURNS) {
    let pick = -1;
    for (let c = 0; c < n; c++) if (!chosen.has(c) && (pick < 0 || closest[c]! < closest[pick]!)) pick = c;
    chosen.add(pick);
    take(pick);
  }
  return byLength([...chosen].map((k) => candidates[k]!));
}

/**
 * Номер собеседника для каждого хода (по порядку входа). Ходы без отпечатка получают −1 —
 * их спикера решает время (соседний ход), см. pipeline.
 */
export function clusterVoiceprints(prints: readonly Voiceprint[], opts: ClusteringOptions = AUTO_CLUSTERING): number[] {
  const unit = prints.map((p) => unitOrNull(p.embedding));
  const candidates = prints
    .map((p, i) => ({ i, durationSec: p.durationSec }))
    .filter(({ i, durationSec }) => unit[i] && durationSec >= opts.minSeedSec);
  const seeds = chooseSeeds(candidates, unit);
  if (seeds.length === 0) return unit.map((e) => (e ? 0 : -1));

  // Группы: сумма нормированных отпечатков с весом длительности и её центр.
  const sums = seeds.map(({ i, durationSec }) => unit[i]!.map((x) => x * durationSec));
  const centers = sums.map(normalize);
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

  // Мелкие группы — почти всегда обрывки одного из крупных голосов. Речь группы — все её ходы, а не только
  // создавшие её: иначе голос, от которого в группы попала лишь пара ходов, растворился бы.
  const aliveCenters = centers.filter((_, g) => alive[g]);
  const groups = aliveCenters.map((center) => ({ center, durationSec: 0 }));
  unit.forEach((e, i) => {
    if (e) groups[nearest(aliveCenters, e)]!.durationSec += prints[i]!.durationSec;
  });
  const totalSec = prints.reduce((sum, p) => sum + p.durationSec, 0);
  const minSec = Math.min(opts.minGroupSec, opts.minGroupShare * totalSec);
  const big = groups.filter((g) => g.durationSec >= minSec);
  const kept = big.length > 0 ? big : [groups.reduce((a, b) => (b.durationSec > a.durationSec ? b : a))];
  const keptCenters = kept.map((g) => g.center);
  return unit.map((e) => (e ? nearest(keptCenters, e) : -1));
}
