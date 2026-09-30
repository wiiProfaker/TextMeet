import type { Interval } from './turns';

export interface SplitOptions {
  /** Самый длинный кусок для распознавания, с. */
  maxLen: number;
  /** Раньше этого места от начала куска не режем, с. */
  minLen: number;
  /** Длина кадра для оценки громкости, с. */
  frameSec: number;
}

/** GigaAM обучена на кусках до ~25 с: длинную реплику режем на куски ≤ 20 с по самому тихому месту. */
export const SPLIT: SplitOptions = { maxLen: 20, minLen: 10, frameSec: 0.05 };

/** Середина самого тихого кадра в промежутке [fromSec; toSec], в секундах. */
export function quietestPoint(
  samples: Float32Array,
  sampleRate: number,
  fromSec: number,
  toSec: number,
  frameSec: number,
): number {
  const frameLen = Math.max(1, Math.round(frameSec * sampleRate));
  const from = Math.max(0, Math.round(fromSec * sampleRate));
  const to = Math.min(samples.length, Math.round(toSec * sampleRate));
  let best = from;
  let bestEnergy = Number.POSITIVE_INFINITY;
  for (let i = from; i + frameLen <= to; i += frameLen) {
    let energy = 0;
    for (let j = i; j < i + frameLen; j++) energy += (samples[j] ?? 0) ** 2;
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = i;
    }
  }
  return (best + Math.floor(frameLen / 2)) / sampleRate;
}

/** Режет интервал на куски не длиннее maxLen по самым тихим местам; ни один кусок не короче minLen. */
export function splitAtQuietPoints(
  samples: Float32Array,
  sampleRate: number,
  interval: Interval,
  opts: SplitOptions = SPLIT,
): Interval[] {
  const pieces: Interval[] = [];
  let rest = interval;
  while (rest.end - rest.start > opts.maxLen) {
    const from = rest.start + opts.minLen;
    // Не ближе minLen к концу: иначе остаток (реплика 20,05 с) вышел бы обрывком, который не распознать.
    const to = Math.max(from, Math.min(rest.start + opts.maxLen, rest.end - opts.minLen));
    const cut = quietestPoint(samples, sampleRate, from, to, opts.frameSec);
    pieces.push({ start: rest.start, end: cut });
    rest = { start: cut, end: rest.end };
  }
  return [...pieces, rest];
}
