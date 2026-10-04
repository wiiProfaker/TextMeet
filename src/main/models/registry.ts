import { join } from 'node:path';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelGroupId } from '../../shared/transcription';

// Группа моделей — то, что пользователь скачивает и удаляет одной кнопкой: модель расшифровки или «voices».
export type { ModelGroupId };

export interface ModelFile {
  group: ModelGroupId;
  /** Путь внутри папки моделей, через «/». */
  path: string;
  url: string;
  size: number;
  sha256: string;
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/6888903da215c7735f51101d939f3bfa679fb2b8';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/** Все группы: модели расшифровки в порядке каталога, затем общая группа. */
export const MODEL_GROUP_IDS = [...ASR_MODEL_IDS, 'voices'] as const satisfies readonly ModelGroupId[];

/** Папка модели расшифровки внутри папки моделей. */
export const ASR_FOLDERS: Record<AsrModelId, string> = {
  'gigaam-v3-e2e-rnnt': 'gigaam-v3-e2e-rnnt',
  'parakeet-tdt-0.6b-v3': 'parakeet-tdt-0.6b-v3-int8',
  'qwen3-asr-0.6b': 'qwen3-asr-0.6b-int8',
  'whisper-large-v3-turbo': 'whisper-large-v3-turbo-int8',
  'nemotron-3.5-asr': 'nemotron-3.5-asr-streaming-1120ms-int8',
  't-one': 't-one-ru',
  'parakeet-unified-en-0.6b': 'parakeet-unified-en-0.6b-int8',
  'canary-180m-flash': 'canary-180m-flash-int8',
};

/**
 * Файлы модели из репозитория Hugging Face, закреплённого на коммите: файлы по адресу не подменятся.
 * files: [имя в репозитории, размер, SHA-256]; в папке моделей файл лежит под тем же именем в папке модели.
 */
function huggingFace(group: AsrModelId, repo: string, commit: string, files: [string, number, string][]): ModelFile[] {
  return files.map(([name, size, sha256]) => ({
    group,
    path: `${ASR_FOLDERS[group]}/${name}`,
    url: `https://huggingface.co/${repo}/resolve/${commit}/${name}`,
    size,
    sha256,
  }));
}

// Размеры и SHA-256 сверены 2026-09-29 (GigaAM, голоса) и 2026-10-02 (остальные модели) с Hugging Face (LFS oid;
// у небольших файлов в git — сумма скачанного файла) и релизами sherpa-onnx на GitHub. Адреса Hugging Face закреплены
// на коммитах (2026-10-02): файл по адресу не подменится, а сумма не разойдётся с реестром.
export const MODEL_FILES: readonly ModelFile[] = [
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_encoder_int8.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`,
    size: 318_995_997,
    sha256: '2cac62d0c270bd128f898f2be1a2d34780d524a6e9483888ebac7b00f97410f1',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_decoder.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`,
    size: 4_600_058,
    sha256: '781971998e6a355d6a714f6932a30eab295e7ba0d14fd7e0f78c83b87e811860',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_joint.onnx',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`,
    size: 2_712_896,
    sha256: '602ff7017a93311aad34df1437c8d7f49911353c13d6eae7a6ee7b041339465c',
  },
  {
    group: 'gigaam-v3-e2e-rnnt',
    path: 'gigaam-v3-e2e-rnnt/gigaam_v3_e2e_rnnt_tokens.txt',
    url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`,
    size: 13_353,
    sha256: '7ddf22514c42c531358182c81446a8159771e9921019f09ae743ea622d40221d',
  },
  ...huggingFace('parakeet-tdt-0.6b-v3', 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', '2bda32ec70b097a55adaa07d9a7173915b43cc78', [
    ['encoder.int8.onnx', 652_184_281, 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247'],
    ['decoder.int8.onnx', 11_845_275, '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e'],
    ['joiner.int8.onnx', 6_355_277, '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3'],
    ['tokens.txt', 93_939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'],
  ]),
  ...huggingFace('qwen3-asr-0.6b', 'csukuangfj2/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25', '68818b2313fe77bd06f6a7c5068ff3ef59d02b8a', [
    ['conv_frontend.onnx', 44_148_281, 'd22dc4423e0940e49884e903d2ea2f7e5567c14fc1aed97e4e26d6b8f208ef9e'],
    ['encoder.int8.onnx', 182_491_662, '60748d3e6744a57c9c91e1b17424a6c2990567e8adceb0783940c03ed98fa9d9'],
    ['decoder.int8.onnx', 755_914_231, '4f6885be5959ae26af3089d38ee7972c5fafbeeb1cf8d5e76eab6d8b61ca5771'],
    ['tokenizer/merges.txt', 1_671_853, '8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5'],
    ['tokenizer/tokenizer_config.json', 12_487, '4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c'],
    ['tokenizer/vocab.json', 2_776_833, 'ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910'],
  ]),
  ...huggingFace('whisper-large-v3-turbo', 'csukuangfj/sherpa-onnx-whisper-turbo', '2ca6ff69fc878651b770880507669577ac41c2ff', [
    ['turbo-encoder.int8.onnx', 674_716_297, 'b02dcdf54f348741e93fe732b67d933c8dcb6735655f710640143081db38878b'],
    ['turbo-decoder.int8.onnx', 361_080_764, '20accd02388482eb3a46bd615631adfdc85e1eb2c7db9ea3f02a40ffe6b81547'],
    ['turbo-tokens.txt', 816_730, 'b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126'],
  ]),
  ...huggingFace('nemotron-3.5-asr', 'csukuangfj2/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11', 'cba1c96ca5ef0e8393b50584ae153a79145dc492', [
    ['encoder.int8.onnx', 657_601_521, '2fff2166acaa535bd969fb223c1f0783d71029f143cb298bc54c2afe85abf772'],
    ['decoder.int8.onnx', 14_978_075, '19f9c98fc6d0a2c33a65a43b36fdb2e914c26c0aa9764be3aebc502a1e982fb0'],
    ['joiner.int8.onnx', 9_504_438, '4101c7c679a0bc30483794b27a059e34e79232aa2068d78d51231a22c8b0d7ce'],
    ['tokens.txt', 131_440, '729cc103155bafa785f9cd45746cd41cabe97eab7182fc04d594129587958f8a'],
  ]),
  ...huggingFace('t-one', 'csukuangfj/sherpa-onnx-streaming-t-one-russian-2025-09-08', '9d63341e0f2d8a8b2edaa825aa1fcfe3c5283b47', [
    ['model.onnx', 144_193_702, '5ded080e2a6c86ecc11bcb0902d77524eb3e8b0844cb0c0754347f5aafb4dabc'],
    ['tokens.txt', 202, '27f7b3ba2096c572375fba1a6b29af1f80d86e08a329940612908112695f97e0'],
  ]),
  ...huggingFace('parakeet-unified-en-0.6b', 'csukuangfj2/sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming', '8c3a10fb13408c7a7054f6898958bf1c64a8d6c7', [
    ['encoder.int8.onnx', 654_040_552, '6716910b7a0833997fec7a410494c995d70124001a0e9b66d6370d6aced577e0'],
    ['decoder.int8.onnx', 7_257_753, 'a5e223392c90e75f8144cdb5eb95af7625db389e39edef2bd1a9c872b3298fe6'],
    ['joiner.int8.onnx', 1_735_860, '869f43f7d24595c55581ad3bf249a935fb8a71389fbdaa7504b9f46f93140f8a'],
    ['tokens.txt', 8_952, 'dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff'],
  ]),
  ...huggingFace('canary-180m-flash', 'csukuangfj/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8', '9077164e0d3dd1d5353743e89ceaa1d3a770838c', [
    ['encoder.int8.onnx', 132_678_643, '7a75b4e2a5857a6dcc0819503bbe3fad66943db4a3ccf21d3f27c633667d303f'],
    ['decoder.int8.onnx', 74_437_848, 'e41a2ab9c0c2fe81a1e8ade5a45fb02a74bc4db7d1f91b89a54a25e2cf79cba2'],
    ['tokens.txt', 53_555, '2dae6fc7815f9640645e0c765522b278ee0cef49b482d91f6913e334628d3e77'],
  ]),
  {
    group: 'voices',
    path: 'pyannote-segmentation-3-0/model.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/9403a6902bb58e3d5ae8c7e77c3422de279db2e0/model.onnx',
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

/** Пути к общим моделям (разделение по голосам, поиск речи) для процесса расшифровки. */
export interface VoicePaths {
  segmentation: string;
  embedding: string;
  vad: string;
}

/** Абсолютный путь к файлу модели. */
export const modelFilePath = (root: string, file: Pick<ModelFile, 'path'>): string =>
  join(root, ...file.path.split('/'));

function pathOf(root: string, path: string): string {
  const file = MODEL_FILES.find((f) => f.path === path);
  if (!file) throw new Error(`В реестре нет модели ${path}`);
  return modelFilePath(root, file);
}

export function voicePaths(root: string): VoicePaths {
  return {
    segmentation: pathOf(root, 'pyannote-segmentation-3-0/model.onnx'),
    embedding: pathOf(root, 'speaker-embedding/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'),
    vad: pathOf(root, 'silero-vad/silero_vad.onnx'),
  };
}

/** Путь к файлу модели расшифровки по имени внутри её папки; файла нет в реестре — ошибка (опечатка в коде). */
export const asrFilePath = (root: string, model: AsrModelId, name: string): string =>
  pathOf(root, `${ASR_FOLDERS[model]}/${name}`);

export const groupFiles = (group: ModelGroupId): ModelFile[] => MODEL_FILES.filter((f) => f.group === group);
export const groupSize = (group: ModelGroupId): number => groupFiles(group).reduce((sum, f) => sum + f.size, 0);
