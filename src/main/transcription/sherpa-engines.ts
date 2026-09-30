// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { ModelPaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import type { Engines, SpeechDetector } from './engines';
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

/** Движки sherpa-onnx; разделение по голосам и отпечатки кешируются по числу потоков. */
export function sherpaEngines(paths: ModelPaths): Engines {
  const diarizers = new Map<number, sherpa.OfflineSpeakerDiarization>();
  const extractors = new Map<number, sherpa.SpeakerEmbeddingExtractor>();
  return {
    detector: () => detector(paths),
    recognizer: (threads) => {
      const recognizer = new sherpa.OfflineRecognizer({
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
          const stream = recognizer.createStream();
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
          recognizer.decode(stream);
          return String(recognizer.getResult(stream).text ?? '');
        },
      };
    },
    diarizer: (threads) => ({
      diarize(samples: Float32Array, speakers: number) {
        let sd = diarizers.get(threads);
        if (!sd) {
          sd = new sherpa.OfflineSpeakerDiarization({
            segmentation: { pyannote: { model: paths.segmentation }, numThreads: threads, provider: 'cpu', debug: 0 },
            embedding: { model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 },
            clustering: { numClusters: speakers, threshold: AUTO_THRESHOLD },
            minDurationOn: 0.2,
            minDurationOff: 0.5,
          });
          diarizers.set(threads, sd);
        }
        sd.setConfig({ clustering: { numClusters: speakers, threshold: AUTO_THRESHOLD } });
        return sd.process(samples).map((s) => ({ start: s.start, end: s.end, speaker: s.speaker }));
      },
    }),
    voiceprints: (threads) => {
      let extractor = extractors.get(threads);
      if (!extractor) {
        extractor = new sherpa.SpeakerEmbeddingExtractor({ model: paths.embedding, numThreads: threads, provider: 'cpu', debug: 0 });
        extractors.set(threads, extractor);
      }
      const ready = extractor;
      return {
        extract(samples: Float32Array): Float32Array | null {
          const stream = ready.createStream();
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
          stream.inputFinished();
          return ready.isReady(stream) ? ready.compute(stream, false) : null;
        },
      };
    },
  };
}
