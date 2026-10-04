// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import { asrFilePath, voicePaths, type VoicePaths } from '../models/registry';
import { SAMPLE_RATE } from './decode';
import { latestByThreads, type Diarizer, type Engines, type Recognizer, type SpeechDetector, type VoiceprintExtractor } from './engines';
import type { Interval } from './turns';

/** Порог кластеризации библиотеки в авто-режиме: намеренно дробит — группирует clustering.ts (§4.4). */
const AUTO_THRESHOLD = 0.5;
const VAD_WINDOW = 512;
/** Буфер детектора речи, с: больше самого длинного участка (maxSpeechDuration). */
const VAD_BUFFER_SEC = 60;

export const sherpaVersion = (): string => `sherpa-onnx ${sherpa.version}`;

function detector(paths: VoicePaths): SpeechDetector {
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

function recognizer(root: string, threads: number): Recognizer {
  const file = (name: string): string => asrFilePath(root, 'gigaam-v3-e2e-rnnt', name);
  const native = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 64 },
    modelConfig: {
      transducer: {
        encoder: file('gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
        decoder: file('gigaam_v3_e2e_rnnt_decoder.onnx'),
        joiner: file('gigaam_v3_e2e_rnnt_joint.onnx'),
      },
      tokens: file('gigaam_v3_e2e_rnnt_tokens.txt'),
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
function diarizer(paths: VoicePaths, threads: number): Diarizer {
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

function voiceprints(paths: VoicePaths, threads: number): VoiceprintExtractor {
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

/**
 * Движки sherpa-onnx. Распознаватель, разделение по голосам и отпечатки живут, пока жив этот объект, и переиспользуются
 * встречами (загрузка GigaAM — секунды); каждого вида — одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(root: string): Engines {
  const paths = voicePaths(root);
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(root, threads)),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
}
