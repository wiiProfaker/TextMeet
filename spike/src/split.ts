export interface Interval {
  readonly start: number; // секунды
  readonly end: number;
}

export interface SplitOptions {
  readonly maxLen: number; // максимальная длина куска, с
  readonly minLen: number; // раньше этого места от начала куска не режем, с
  readonly frameSec: number; // длина кадра для оценки громкости, с
}

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
    for (let j = i; j < i + frameLen; j++) energy += samples[j] * samples[j];
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = i;
    }
  }
  return (best + Math.floor(frameLen / 2)) / sampleRate;
}

export function splitAtQuietPoints(
  samples: Float32Array,
  sampleRate: number,
  interval: Interval,
  opts: SplitOptions,
): Interval[] {
  if (interval.end - interval.start <= opts.maxLen) return [interval];
  const cut = quietestPoint(
    samples,
    sampleRate,
    interval.start + opts.minLen,
    interval.start + opts.maxLen,
    opts.frameSec,
  );
  return [
    { start: interval.start, end: cut },
    ...splitAtQuietPoints(samples, sampleRate, { start: cut, end: interval.end }, opts),
  ];
}
