import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { groupFiles, modelFilePath } from '../models/registry';
import { recognizerSpec } from './asr-config';

const ROOT = join('M', 'models');

/** Все строки-пути внутри конфига (рекурсивно). */
function pathsIn(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith(ROOT) ? [value] : [];
  if (value && typeof value === 'object') return Object.values(value).flatMap(pathsIn);
  return [];
}

describe('recognizerSpec', () => {
  /** Путь в конфиге — сам файл модели или папка (токенизатор Qwen3), в которой он лежит. */
  const covers = (path: string, file: string): boolean => file === path || file.startsWith(path + sep);

  it('points every model only at files of that model in the registry', () => {
    for (const id of ASR_MODEL_IDS) {
      const files = groupFiles(id).map((f) => modelFilePath(ROOT, f));
      for (const path of pathsIn(recognizerSpec(id, ROOT, 4).config)) {
        expect(files.some((file) => covers(path, file))).toBe(true);
      }
    }
  });

  it('uses every file a model downloads', () => {
    for (const id of ASR_MODEL_IDS) {
      const used = pathsIn(recognizerSpec(id, ROOT, 4).config);
      for (const file of groupFiles(id).map((f) => modelFilePath(ROOT, f))) {
        expect(used.some((path) => covers(path, file))).toBe(true);
      }
    }
  });

  it('passes the number of threads and keeps everything on the processor', () => {
    for (const id of ASR_MODEL_IDS) {
      expect(recognizerSpec(id, ROOT, 3).config.modelConfig).toMatchObject({ numThreads: 3, provider: 'cpu', debug: 0 });
    }
  });

  it('keeps GigaAM exactly as in plan 3', () => {
    expect(recognizerSpec('gigaam-v3-e2e-rnnt', ROOT, 4)).toEqual({
      online: false,
      language: null,
      leadSec: 0,
      tailSec: 0,
      config: {
        featConfig: { sampleRate: 16_000, featureDim: 64 },
        modelConfig: {
          transducer: {
            encoder: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
            decoder: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_decoder.onnx'),
            joiner: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_joint.onnx'),
          },
          tokens: join(ROOT, 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_tokens.txt'),
          modelType: 'nemo_transducer',
          numThreads: 4,
          provider: 'cpu',
          debug: 0,
        },
      },
    });
  });

  it('pins Russian for the multilingual models that guessed the language wrong', () => {
    expect(recognizerSpec('qwen3-asr-0.6b', ROOT, 4).language).toBe('Russian');
    expect(recognizerSpec('nemotron-3.5-asr', ROOT, 4).language).toBe('ru');
    expect(recognizerSpec('whisper-large-v3-turbo', ROOT, 4).config.modelConfig).toMatchObject({
      whisper: { language: 'ru', task: 'transcribe' },
    });
    expect(recognizerSpec('canary-180m-flash', ROOT, 4).config.modelConfig).toMatchObject({
      canary: { srcLang: 'en', tgtLang: 'en', usePnc: 1 },
    });
    expect(recognizerSpec('parakeet-tdt-0.6b-v3', ROOT, 4).language).toBeNull();
  });

  it('feeds the streaming models whole pieces with silence around them', () => {
    expect(recognizerSpec('nemotron-3.5-asr', ROOT, 4)).toMatchObject({ online: true, leadSec: 0.5, tailSec: 2.5 });
    expect(recognizerSpec('t-one', ROOT, 4)).toMatchObject({ online: true, leadSec: 0.3, tailSec: 1.5 });
    expect(recognizerSpec('t-one', ROOT, 4).config.featConfig).toEqual({ sampleRate: 8000, featureDim: 80 });
    expect(recognizerSpec('whisper-large-v3-turbo', ROOT, 4)).toMatchObject({ online: false, leadSec: 0, tailSec: 1 });
  });

  it('gives Qwen3 the folder of its tokenizer', () => {
    const spec = recognizerSpec('qwen3-asr-0.6b', ROOT, 4).config.modelConfig as { qwen3Asr: { tokenizer: string } };
    expect(spec.qwen3Asr.tokenizer).toBe(join(ROOT, 'qwen3-asr-0.6b-int8', 'tokenizer'));
  });
});
