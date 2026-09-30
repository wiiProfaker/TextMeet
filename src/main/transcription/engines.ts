// Тонкие интерфейсы над нативными движками: конвейер проверяется без sherpa-onnx (поддельные движки в тестах).
import type { Interval, Turn } from './turns';

/** Детектор речи: участки речи на дорожке. */
export interface SpeechDetector {
  detect(samples: Float32Array): Interval[];
}

/** Распознавание куска речи (≤ 20 с) в текст. */
export interface Recognizer {
  recognize(samples: Float32Array): string;
}

/** Разделение по голосам: ходы спикеров; speakers = −1 — число определяет сама библиотека. */
export interface Diarizer {
  diarize(samples: Float32Array, speakers: number): Turn[];
}

/** «Отпечаток голоса» куска; null — кусок слишком короткий. */
export interface VoiceprintExtractor {
  extract(samples: Float32Array): Float32Array | null;
}

/** Фабрика движков. Тяжёлые создаются с числом потоков — его меняют во время записи (§5.3). */
export interface Engines {
  detector(): SpeechDetector;
  recognizer(threads: number): Recognizer;
  diarizer(threads: number): Diarizer;
  voiceprints(threads: number): VoiceprintExtractor;
}

/**
 * Движки процесса расшифровки: один объект на папку моделей, общий для всех встреч, — модели загружаются один раз
 * на процесс, а не для каждой встречи. Другая папка — новые движки.
 */
export function enginesByModelsDir(create: (modelsDir: string) => Engines): (modelsDir: string) => Engines {
  let last: { modelsDir: string; engines: Engines } | null = null;
  return (modelsDir) => {
    if (last?.modelsDir !== modelsDir) last = { modelsDir, engines: create(modelsDir) };
    return last.engines;
  };
}
