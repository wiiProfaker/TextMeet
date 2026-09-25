import { createRequire } from 'node:module';
import { decodeToMono16k, SAMPLE_RATE } from './audio.ts';
import { MODELS, modelFile, type ModelEntry } from './models.ts';
import { ensureModel } from './download.ts';
import { clustersFor, mergeTurns, renumberByFirstAppearance, type Turn } from './turns.ts';
import { splitAtQuietPoints, type Interval } from './split.ts';
import { speakerLabel, type Utterance } from './format.ts';

const require = createRequire(import.meta.url);
// sherpa-onnx-node — CommonJS без типов; поверхность, которую мы используем, описана в Task 7 плана.
const sherpa = require('sherpa-onnx-node');

export type AsrVariant = 'rnnt' | 'ctc';
export type EmbeddingVariant = 'titanet' | 'eres2net';

export interface TranscribeOptions {
  readonly file: string;
  readonly participants?: number;
  readonly asr: AsrVariant;
  readonly embedding: EmbeddingVariant;
  readonly threshold: number;
  readonly numThreads: number;
  readonly onProgress?: (message: string) => void;
}

export interface TranscribeResult {
  readonly utterances: readonly Utterance[];
  readonly durationSec: number;
  readonly speakers: number;
  readonly timings: { readonly decodeSec: number; readonly diarizationSec: number; readonly asrSec: number };
}

interface DiarizationSegment {
  readonly start: number;
  readonly end: number;
  readonly speaker: number;
}

const MERGE_GAP_SEC = 1.0;
const SPLIT = { maxLen: 20, minLen: 10, frameSec: 0.05 } as const;
const MIN_PIECE_SEC = 0.1;

function asrEntry(variant: AsrVariant): ModelEntry {
  return variant === 'rnnt' ? MODELS.gigaamRnnt : MODELS.gigaamCtc;
}

function embeddingEntry(variant: EmbeddingVariant): ModelEntry {
  return variant === 'titanet' ? MODELS.titanet : MODELS.eres2net;
}

function createRecognizer(variant: AsrVariant, numThreads: number) {
  const featConfig = { sampleRate: SAMPLE_RATE, featureDim: 64 };
  if (variant === 'rnnt') {
    const e = MODELS.gigaamRnnt;
    return new sherpa.OfflineRecognizer({
      featConfig,
      modelConfig: {
        transducer: {
          encoder: modelFile(e, 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
          decoder: modelFile(e, 'gigaam_v3_e2e_rnnt_decoder.onnx'),
          joiner: modelFile(e, 'gigaam_v3_e2e_rnnt_joint.onnx'),
        },
        tokens: modelFile(e, 'gigaam_v3_e2e_rnnt_tokens.txt'),
        modelType: 'nemo_transducer',
        numThreads,
        provider: 'cpu',
        debug: 0,
      },
    });
  }
  const e = MODELS.gigaamCtc;
  return new sherpa.OfflineRecognizer({
    featConfig,
    modelConfig: {
      nemoCtc: { model: modelFile(e, 'gigaam_v3_e2e_ctc_int8.onnx') },
      tokens: modelFile(e, 'gigaam_v3_e2e_ctc_tokens.txt'),
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
  });
}

function createDiarizer(embedding: EmbeddingVariant, numClusters: number, threshold: number, numThreads: number) {
  const emb = embeddingEntry(embedding);
  return new sherpa.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: modelFile(MODELS.segmentation, 'model.onnx') },
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
    embedding: { model: modelFile(emb, emb.files[0].name), numThreads, provider: 'cpu', debug: 0 },
    clustering: { numClusters, threshold },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  });
}

function recognizePiece(recognizer: any, samples: Float32Array, piece: Interval): string {
  const from = Math.max(0, Math.floor(piece.start * SAMPLE_RATE));
  const to = Math.min(samples.length, Math.ceil(piece.end * SAMPLE_RATE));
  if (to - from < MIN_PIECE_SEC * SAMPLE_RATE) return '';
  const stream = recognizer.createStream();
  // slice, а не subarray: отдаём в нативный код отдельный буфер без смещения
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: samples.slice(from, to) });
  recognizer.decode(stream);
  return String(recognizer.getResult(stream).text ?? '').trim();
}

const seconds = (fromMs: number, toMs: number) => (toMs - fromMs) / 1000;

export async function transcribeFile(opts: TranscribeOptions): Promise<TranscribeResult> {
  const log = opts.onProgress ?? (() => {});
  for (const entry of [asrEntry(opts.asr), MODELS.segmentation, embeddingEntry(opts.embedding)]) {
    await ensureModel(entry, log);
  }

  const t0 = performance.now();
  const samples = await decodeToMono16k(opts.file);
  const t1 = performance.now();
  log(`Аудио: ${(samples.length / SAMPLE_RATE / 60).toFixed(1)} мин. Разделяю по голосам…`);

  const diarizer = createDiarizer(
    opts.embedding,
    clustersFor(opts.participants, false),
    opts.threshold,
    opts.numThreads,
  );
  const rawTurns: Turn[] = (diarizer.process(samples) as DiarizationSegment[]).map((s) => ({
    start: s.start,
    end: s.end,
    speaker: s.speaker,
  }));
  const turns = renumberByFirstAppearance(mergeTurns(rawTurns, MERGE_GAP_SEC));
  const speakers = new Set(turns.map((t) => t.speaker)).size;
  const t2 = performance.now();
  log(`Спикеров: ${speakers}, реплик: ${turns.length}. Распознаю…`);

  const recognizer = createRecognizer(opts.asr, opts.numThreads);
  const utterances: Utterance[] = turns.map((turn, index) => {
    const text = splitAtQuietPoints(samples, SAMPLE_RATE, turn, SPLIT)
      .map((piece) => recognizePiece(recognizer, samples, piece))
      .filter((t) => t.length > 0)
      .join(' ');
    log(`  реплика ${index + 1}/${turns.length}`);
    return { start: turn.start, end: turn.end, speaker: speakerLabel(turn.speaker), text };
  });
  const t3 = performance.now();

  return {
    utterances,
    durationSec: samples.length / SAMPLE_RATE,
    speakers,
    timings: { decodeSec: seconds(t0, t1), diarizationSec: seconds(t1, t2), asrSec: seconds(t2, t3) },
  };
}
