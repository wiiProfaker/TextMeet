// Настройки sherpa-onnx для каждой модели каталога (решения Плана 7, §4.1–4.2). Чистые данные: проверяются без
// нативного кода; распознаватель по ним строит sherpa-engines.ts. Числа — из прототипа Плана 7 на записи пользователя.
import { dirname } from 'node:path';
import type { AsrModelId } from '../../shared/asr-models';
import { asrFilePath } from '../models/registry';
import { SAMPLE_RATE } from './decode';

export interface RecognizerSpec {
  /** Потоковая модель (OnlineRecognizer): кусок подаётся целиком, затем «конец ввода» и декодирование до конца. */
  online: boolean;
  /** Конфиг конструктора sherpa-onnx (OfflineRecognizer / OnlineRecognizer). */
  config: { featConfig: { sampleRate: number; featureDim: number }; modelConfig: Record<string, unknown> };
  /** Язык, закреплённый в потоке (stream.setOption('language', …)); null — модель его не спрашивает. */
  language: string | null;
  /** Тишина перед куском и после него, с: потоковые модели иначе теряют начало и конец, Whisper — конец фразы. */
  leadSec: number;
  tailSec: number;
}

type Build = (file: (name: string) => string) => Omit<RecognizerSpec, 'config'> & {
  featureDim: number;
  sampleRate?: number;
  model: Record<string, unknown>;
};

const transducer = (file: (name: string) => string, prefix = '') => ({
  transducer: {
    encoder: file(`${prefix}encoder.int8.onnx`),
    decoder: file(`${prefix}decoder.int8.onnx`),
    joiner: file(`${prefix}joiner.int8.onnx`),
  },
  tokens: file('tokens.txt'),
});

const plain = { online: false, language: null, leadSec: 0, tailSec: 0 } as const;

const BUILDS: Record<AsrModelId, Build> = {
  'gigaam-v3-e2e-rnnt': (file) => ({
    ...plain,
    featureDim: 64,
    model: {
      transducer: {
        encoder: file('gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
        decoder: file('gigaam_v3_e2e_rnnt_decoder.onnx'),
        joiner: file('gigaam_v3_e2e_rnnt_joint.onnx'),
      },
      tokens: file('gigaam_v3_e2e_rnnt_tokens.txt'),
      modelType: 'nemo_transducer',
    },
  }),
  'parakeet-tdt-0.6b-v3': (file) => ({
    ...plain,
    featureDim: 80,
    model: { ...transducer(file), modelType: 'nemo_transducer' },
  }),
  // Без закреплённого языка Qwen3 на коротких репликах уходила в китайский (прототип Плана 7).
  'qwen3-asr-0.6b': (file) => ({
    ...plain,
    language: 'Russian',
    featureDim: 80,
    model: {
      qwen3Asr: {
        convFrontend: file('conv_frontend.onnx'),
        encoder: file('encoder.int8.onnx'),
        decoder: file('decoder.int8.onnx'),
        // Папка токенизатора — та, где лежат его файлы.
        tokenizer: dirname(file('tokenizer/vocab.json')),
        hotwords: '',
      },
      tokens: '',
    },
  }),
  // Язык — в настройках модели (автоопределение путало русский с английским); секунда тишины в конце — иначе
  // Whisper обрывал последнее слово куска.
  'whisper-large-v3-turbo': (file) => ({
    ...plain,
    tailSec: 1,
    featureDim: 128,
    model: {
      whisper: { encoder: file('turbo-encoder.int8.onnx'), decoder: file('turbo-decoder.int8.onnx'), language: 'ru', task: 'transcribe' },
      tokens: file('turbo-tokens.txt'),
    },
  }),
  'nemotron-3.5-asr': (file) => ({
    online: true,
    language: 'ru',
    leadSec: 0.5,
    tailSec: 2.5,
    featureDim: 128,
    model: transducer(file),
  }),
  // T-one обучена на телефонном звуке 8 кГц: признаки считаются на 8 кГц, sherpa-onnx сам понижает частоту.
  't-one': (file) => ({
    online: true,
    language: null,
    leadSec: 0.3,
    tailSec: 1.5,
    featureDim: 80,
    sampleRate: 8000,
    model: { toneCtc: { model: file('model.onnx') }, tokens: file('tokens.txt') },
  }),
  'parakeet-unified-en-0.6b': (file) => ({
    ...plain,
    featureDim: 80,
    model: { ...transducer(file), modelType: 'nemo_transducer' },
  }),
  'canary-180m-flash': (file) => ({
    ...plain,
    featureDim: 80,
    model: {
      canary: { encoder: file('encoder.int8.onnx'), decoder: file('decoder.int8.onnx'), srcLang: 'en', tgtLang: 'en', usePnc: 1 },
      tokens: file('tokens.txt'),
    },
  }),
};

/** Настройки распознавателя модели с файлами из папки моделей root. */
export function recognizerSpec(model: AsrModelId, root: string, threads: number): RecognizerSpec {
  const file = (name: string): string => asrFilePath(root, model, name);
  const { featureDim, sampleRate, model: modelConfig, ...rest } = BUILDS[model](file);
  return {
    ...rest,
    config: {
      featConfig: { sampleRate: sampleRate ?? SAMPLE_RATE, featureDim },
      modelConfig: { ...modelConfig, numThreads: threads, provider: 'cpu', debug: 0 },
    },
  };
}
