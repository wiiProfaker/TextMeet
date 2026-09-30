import { join } from 'node:path';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь видит и удаляет в настройках одной строкой.
export type { ModelGroupId };

export interface ModelFile {
  group: ModelGroupId;
  /** Путь внутри папки моделей, через «/». */
  path: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ModelGroup {
  id: ModelGroupId;
  title: string;
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/main';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

export const MODEL_GROUPS: readonly ModelGroup[] = [
  { id: 'gigaam', title: 'GigaAM v3' },
  { id: 'voices', title: 'Разделение по голосам и поиск речи' },
];

// Размеры и SHA-256 сверены 2026-09-29 с Hugging Face (LFS oid, git-хэш tokens.txt) и релизами sherpa-onnx на GitHub.
export const MODEL_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`,
    size: 318_995_997,
    sha256: '2cac62d0c270bd128f898f2be1a2d34780d524a6e9483888ebac7b00f97410f1',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_decoder.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`,
    size: 4_600_058,
    sha256: '781971998e6a355d6a714f6932a30eab295e7ba0d14fd7e0f78c83b87e811860',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_joint.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`,
    size: 2_712_896,
    sha256: '602ff7017a93311aad34df1437c8d7f49911353c13d6eae7a6ee7b041339465c',
  },
  {
    group: 'gigaam',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_tokens.txt',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`,
    size: 13_353,
    sha256: '7ddf22514c42c531358182c81446a8159771e9921019f09ae743ea622d40221d',
  },
  {
    group: 'voices',
    path: 'pyannote-segmentation-3-0/model.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx',
    size: 5_992_913,
    sha256: '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079',
  },
  {
    group: 'voices',
    path: 'speaker-embedding/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx',
    url: `${SHERPA_RELEASES}/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`,
    size: 26_485_263,
    sha256: 'c59158379255ad66e161679cca6af8d52d51e389e3224ab7d7a7baae295c2db5',
  },
  {
    group: 'voices',
    path: 'silero-vad/silero_vad.onnx',
    url: `${SHERPA_RELEASES}/asr-models/silero_vad.onnx`,
    size: 643_854,
    sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
  },
];

/** Модель расшифровки — пишется в meeting.json и transcript.json. */
export const ASR_MODEL_ID = 'gigaam-v3-e2e-rnnt';

/** Пути к файлам моделей для процесса расшифровки. */
export interface ModelPaths {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  segmentation: string;
  embedding: string;
  vad: string;
}

/** Абсолютный путь к файлу модели. */
export const modelFilePath = (root: string, file: Pick<ModelFile, 'path'>): string =>
  join(root, ...file.path.split('/'));

function pathOf(root: string, suffix: string): string {
  const file = MODEL_FILES.find((f) => f.path.endsWith(suffix));
  if (!file) throw new Error(`В реестре нет модели ${suffix}`);
  return modelFilePath(root, file);
}

export function modelPaths(root: string): ModelPaths {
  return {
    encoder: pathOf(root, '_encoder_int8.onnx'),
    decoder: pathOf(root, '_decoder.onnx'),
    joiner: pathOf(root, '_joint.onnx'),
    tokens: pathOf(root, '_tokens.txt'),
    segmentation: pathOf(root, 'pyannote-segmentation-3-0/model.onnx'),
    embedding: pathOf(root, 'eres2net_sv_en_voxceleb_16k.onnx'),
    vad: pathOf(root, 'silero_vad.onnx'),
  };
}

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
export const TOTAL_MODELS_SIZE = MODEL_FILES.reduce((sum, f) => sum + f.size, 0);
