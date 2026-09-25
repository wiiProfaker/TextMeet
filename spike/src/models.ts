import os from 'node:os';
import path from 'node:path';

export interface ModelFile {
  readonly name: string;
  readonly url: string;
  readonly size: number; // байт; проверяется после скачивания
}

export interface ModelEntry {
  readonly id: string;
  readonly dir: string;
  readonly files: readonly ModelFile[];
}

export function modelsRoot(): string {
  if (process.env.TEXTMEET_MODELS_DIR) return process.env.TEXTMEET_MODELS_DIR;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'TextMeet', 'models');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'TextMeet', 'models');
  }
  return path.join(os.homedir(), '.local', 'share', 'TextMeet', 'models');
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/main';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

export const MODELS = {
  gigaamRnnt: {
    id: 'gigaam-v3-e2e-rnnt',
    dir: 'gigaam-v3-e2e-rnnt',
    files: [
      { name: 'gigaam_v3_e2e_rnnt_encoder_int8.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`, size: 318995997 },
      { name: 'gigaam_v3_e2e_rnnt_decoder.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`, size: 4600058 },
      { name: 'gigaam_v3_e2e_rnnt_joint.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`, size: 2712896 },
      { name: 'gigaam_v3_e2e_rnnt_tokens.txt', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`, size: 13353 },
    ],
  },
  gigaamCtc: {
    id: 'gigaam-v3-e2e-ctc',
    dir: 'gigaam-v3-e2e-ctc',
    files: [
      { name: 'gigaam_v3_e2e_ctc_int8.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_int8.onnx`, size: 319869121 },
      { name: 'gigaam_v3_e2e_ctc_tokens.txt', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_tokens.txt`, size: 2006 },
    ],
  },
  segmentation: {
    id: 'pyannote-segmentation-3-0',
    dir: 'pyannote-segmentation-3-0',
    files: [
      { name: 'model.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx', size: 5992913 },
    ],
  },
  titanet: {
    id: 'titanet-small',
    dir: 'speaker-embedding',
    files: [
      { name: 'nemo_en_titanet_small.onnx', url: `${SHERPA_RELEASES}/speaker-recongition-models/nemo_en_titanet_small.onnx`, size: 40257283 },
    ],
  },
  eres2net: {
    id: 'eres2net-en',
    dir: 'speaker-embedding',
    files: [
      { name: '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx', url: `${SHERPA_RELEASES}/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`, size: 26485263 },
    ],
  },
  silero: {
    id: 'silero-vad',
    dir: 'silero-vad',
    files: [
      { name: 'silero_vad.onnx', url: `${SHERPA_RELEASES}/asr-models/silero_vad.onnx`, size: 643854 },
    ],
  },
  example: {
    id: 'gigaam-example',
    dir: 'examples',
    files: [
      { name: 'gigaam-example.wav', url: 'https://huggingface.co/csukuangfj/tmp-files/resolve/main/GigaAM/example.wav', size: 361324 },
    ],
  },
} as const satisfies Record<string, ModelEntry>;

export function modelFile(entry: ModelEntry, name: string): string {
  return path.join(modelsRoot(), entry.dir, name);
}
