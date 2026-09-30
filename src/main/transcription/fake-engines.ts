// Поддельные движки — только для автотестов (TEXTMEET_TEST_ASR=fake): мгновенно и без моделей.
// Речь — всё, что громче порога; «текст» — длина куска. Сквозные тесты проверяют склейку программы, а не качество.
import { SAMPLE_RATE } from './decode';
import type { Engines } from './engines';
import type { Interval } from './turns';

const FRAME_SEC = 0.1;
const LOUD_RMS = 0.005;
const JOIN_GAP_SEC = 0.3;

/** Участки громче порога (кадры по 0,1 с), паузы короче 0,3 с не разрывают участок. */
export function loudIntervals(samples: Float32Array, sampleRate = SAMPLE_RATE): Interval[] {
  const frame = Math.round(FRAME_SEC * sampleRate);
  const result: Interval[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let energy = 0;
    for (let j = i; j < i + frame; j++) energy += (samples[j] ?? 0) ** 2;
    if (Math.sqrt(energy / frame) < LOUD_RMS) continue;
    const start = i / sampleRate;
    const end = (i + frame) / sampleRate;
    const last = result.at(-1);
    if (last && start - last.end <= JOIN_GAP_SEC) result[result.length - 1] = { start: last.start, end };
    else result.push({ start, end });
  }
  return result;
}

export function fakeEngines(): Engines {
  return {
    detector: () => ({ detect: (samples) => loudIntervals(samples) }),
    recognizer: () => ({
      recognize: (samples) => `Проверка расшифровки, ${(samples.length / SAMPLE_RATE).toFixed(1).replace('.', ',')} с.`,
    }),
    diarizer: () => ({ diarize: (samples) => loudIntervals(samples).map((i) => ({ ...i, speaker: 0 })) }),
    voiceprints: () => ({ extract: () => Float32Array.from([1, 0, 0]) }),
  };
}
