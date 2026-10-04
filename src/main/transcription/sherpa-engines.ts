// Настоящие движки на sherpa-onnx (проверяются интеграционными тестами на реальных моделях).
import * as sherpa from 'sherpa-onnx-node';
import type { AsrModelId } from '../../shared/asr-models';
import { voicePaths, type VoicePaths } from '../models/registry';
import { recognizerSpec, type RecognizerSpec } from './asr-config';
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

/** Кусок с тишиной до и после (spec.leadSec / tailSec); без неё — тот же буфер. */
function padded(samples: Float32Array, spec: RecognizerSpec): Float32Array {
  if (spec.leadSec === 0 && spec.tailSec === 0) return samples;
  const lead = Math.round(spec.leadSec * SAMPLE_RATE);
  const result = new Float32Array(lead + samples.length + Math.round(spec.tailSec * SAMPLE_RATE));
  result.set(samples, lead);
  return result;
}

/** Ошибка загрузки модели: процесс расшифровки сообщает о ней отдельно («Не удалось загрузить модель …»). */
export class ModelLoadError extends Error {}

function recognizer(spec: RecognizerSpec): Recognizer {
  try {
    if (spec.online) {
      const native = new sherpa.OnlineRecognizer(spec.config);
      return {
        recognize(samples: Float32Array): string {
          const stream = native.createStream();
          if (spec.language) stream.setOption('language', spec.language);
          stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: padded(samples, spec) });
          stream.inputFinished();
          while (native.isReady(stream)) native.decode(stream);
          return String(native.getResult(stream).text ?? '');
        },
      };
    }
    const native = new sherpa.OfflineRecognizer(spec.config);
    return {
      recognize(samples: Float32Array): string {
        const stream = native.createStream();
        if (spec.language) stream.setOption('language', spec.language);
        stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: padded(samples, spec) });
        native.decode(stream);
        return String(native.getResult(stream).text ?? '');
      },
    };
  } catch (err) {
    throw new ModelLoadError(err instanceof Error ? err.message : String(err), { cause: err });
  }
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
 * Движки sherpa-onnx с моделью расшифровки model из папки моделей root. Распознаватель, разделение по голосам и
 * отпечатки живут, пока жив этот объект, и переиспользуются встречами (загрузка модели — секунды); каждого вида —
 * одна копия, для последнего числа потоков (latestByThreads).
 */
export function sherpaEngines(root: string, model: AsrModelId): Engines {
  const paths = voicePaths(root);
  return {
    detector: () => detector(paths),
    recognizer: latestByThreads((threads) => recognizer(recognizerSpec(model, root, threads))),
    diarizer: latestByThreads((threads) => diarizer(paths, threads)),
    voiceprints: latestByThreads((threads) => voiceprints(paths, threads)),
  };
}
