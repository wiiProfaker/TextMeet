// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { ModelPaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import type { Diarizer, Engines, Recognizer, SpeechDetector, VoiceprintExtractor } from './engines';
import type { Interval } from './turns';

/** Порог кластеризации библиотеки в авто-режиме: намеренно дробит — группирует clustering.ts (§4.4). */
const AUTO_THRESHOLD = 0.5;
const VAD_WINDOW = 512;
/** Буфер детектора речи, с: больше самого длинного участка (maxSpeechDuration). */
const VAD_BUFFER_SEC = 60;

export const sherpaVersion = (): string => `sherpa-onnx ${sherpa.version}`;

function detector(paths: ModelPaths): SpeechDetector {
  return {
    detect(samples: Float32Array): Interval[] {
      const vad = new sherpa.Vad(
        {
          sileroVad: {
            model: paths.vad,
            threshold: 0.5,
            minSpeechDuration: 0.25,
            minSilenceDuration: 0.5,
            maxSpeechDuration: 20,
            windowSize: VAD_WINDOW,
          },
          sampleRate: SAMPLE_RATE,
          numThreads: 1,
          provider: 'cpu',
          debug: 0,
        },
        VAD_BUFFER_SEC,
      );
      const found: Interval[] = [];
      const drain = (): void => {
        while (!vad.isEmpty()) {
          const segment = vad.front(false);
          found.push({
            start: segment.start / SAMPLE_RATE,
            end: (segment.start + segment.samples.length) / SAMPLE_RATE,
          });
          vad.pop();
        }
      };
      for (let i = 0; i < samples.length; i += VAD_WINDOW) {
        vad.acceptWaveform(samples.slice(i, i + VAD_WINDOW));
        drain();
      }
      vad.flush();
      drain();
      return found;
    },
  };
}

function recognizer(paths: ModelPaths, threads: number): Recognizer {
  const native = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
    modelConfig: {
      transducer: { encoder: paths.encoder, decoder: paths.decoder, joiner: paths.joiner },
      tokens: paths.tokens,
      modelType: 'nemo_transducer',
      numThreads: threads,
      provider: 'cpu',
      debug: 0,
    },
  });
  return {
    recognize(samples: Float32Array): string {
      const stream = native.createStream();
      stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
      native.decode(stream);
      return String(native.getResult(stream).text ?? '');
    },
  };
}

/** Модели разделения загружаются при первом разделении: встречам без «других» они не нужны. */
function diarizer(paths: ModelPaths, threads: number): Diarizer {
  let native: sherpa.OfflineSpeakerDiarization | null = null;
  return {
    diarize(samples: Float32Array, speakers: number) {
      const clustering = { numClusters: speakers, threshold: AUTO_THRESHOLD };
      native ??= new sherpa.OfflineSpeakerDiarization({
        segmentation: { pyannote: { model: paths.segmentation }, numThreads: threads, provider: 'cpu', debug: 0 },
        embedding: { model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 },
        clustering,
        minDurationOn: 0.2,
        minDurationOff: 0.5,
      });
      native.setConfig({ clustering });
      return native.process(samples).map((s) => ({ start: s.start, end: s.end, speaker: s.speaker }));
    },
  };
}

function voiceprints(paths: ModelPaths, threads: number): VoiceprintExtractor {
  const native = new sherpa.SpeakerEmbeddingExtractor({ model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 });
  return {
    extract(samples: Float32Array): Float32Array | null {
      const stream = native.createStream();
      stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
      stream.inputFinished();
      return native.isReady(stream) ? native.compute(stream, false) : null;
    },
  };
}

/** Один движок на число потоков: создаётся при первом вызове и дальше переиспользуется. */
function perThreads<T>(create: (threads: number) => T): (threads: number) => T {
  const cache = new Map<number, T>();
  return (threads) => {
    let engine = cache.get(threads);
    if (engine === undefined) {
      engine = create(threads);
      cache.set(threads, engine);
    }
    return engine;
  };
}

/**
 * Движки sherpa-onnx. Распознаватель, разделение по голосам и отпечатки создаются по одному на число потоков и
 * живут, пока жив этот объект: нативная память освобождается только сборщиком мусора, а загрузка GigaAM — секунды.
 * Чисел потоков два (запись идёт или нет), так что копий не больше двух.
 */
export function sherpaEngines(paths: ModelPaths): Engines {
  return {
    detector: () => detector(paths),
    recognizer: perThreads((threads) => recognizer(paths, threads)),
    diarizer: perThreads((threads) => diarizer(paths, threads)),
    voiceprints: perThreads((threads) => voiceprints(paths, threads)),
  };
}
