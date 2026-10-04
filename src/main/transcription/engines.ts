// Тонкие интерфейсы над нативными движками: конвейер проверяется без sherpa-onnx (поддельные движки в тестах).
import type { AsrModelId } from '../../shared/asr-models';
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
 * Движок одного вида по числу потоков: пока число то же — один и тот же (встречи его переиспользуют). Хранится только
 * последний: при смене числа (началась или кончилась запись) ссылка на прежний отпускается, чтобы он не держал
 * вторую копию GigaAM (ещё 350–450 МБ) всё время записи. Нативную память освобождает сборщик мусора — не сразу,
 * так что какое-то время обе копии всё же могут быть в памяти.
 */
export function latestByThreads<T>(create: (threads: number) => T): (threads: number) => T {
  let last: { threads: number; engine: T } | null = null;
  return (threads) => {
    if (last?.threads !== threads) {
      last = null; // Ссылка на прежний движок отпускается до загрузки нового.
      last = { threads, engine: create(threads) };
    }
    return last.engine;
  };
}

/**
 * Движки процесса расшифровки: один объект на папку моделей и модель расшифровки, общий для встреч подряд, — модели
 * загружаются один раз, а не для каждой встречи. Другая папка или модель — новые движки; прежние отпускаются
 * (две модели расшифровки в памяти разом не держим). Нативную память прежних освобождает сборщик мусора — не сразу,
 * поэтому при смене модели очередь вдобавок запускает процесс заново.
 */
export function enginesByModel(
  create: (modelsDir: string, model: AsrModelId) => Engines,
): (modelsDir: string, model: AsrModelId) => Engines {
  let last: { modelsDir: string; model: AsrModelId; engines: Engines } | null = null;
  return (modelsDir, model) => {
    if (last?.modelsDir !== modelsDir || last.model !== model) {
      last = null;
      last = { modelsDir, model, engines: create(modelsDir, model) };
    }
    return last.engines;
  };
}
