import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { modelsRoot } from './models-dir';
import { ASR_FOLDERS, asrFilePath, groupFiles, groupSize, MODEL_FILES, MODEL_GROUP_IDS, modelFilePath, voicePaths } from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
    for (const file of MODEL_FILES) {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(MODEL_GROUP_IDS).toContain(file.group);
    }
  });

  it('keeps paths unique and inside the models folder', () => {
    const paths = MODEL_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).not.toMatch(/\.\.|^\/|\\/);
  });

  it('has files for every catalog model, each in its own folder', () => {
    for (const id of ASR_MODEL_IDS) {
      const files = groupFiles(id);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) expect(file.path.startsWith(`${ASR_FOLDERS[id]}/`)).toBe(true);
    }
    expect(new Set(Object.values(ASR_FOLDERS)).size).toBe(ASR_MODEL_IDS.length);
  });

  it('pins every Hugging Face file to a commit', () => {
    const fromHuggingFace = MODEL_FILES.filter((f) => f.url.startsWith('https://huggingface.co/'));
    expect(fromHuggingFace.length).toBeGreaterThan(30);
    for (const file of fromHuggingFace) expect(file.url).toMatch(/\/resolve\/[0-9a-f]{40}\//);
  });

  it('adds up the sizes shown in the settings', () => {
    expect(groupSize('gigaam-v3-e2e-rnnt')).toBe(326_322_304);
    expect(groupSize('voices')).toBe(33_122_030);
    expect(groupSize('t-one')).toBe(144_193_904);
  });

  it('builds the paths the transcription process loads', () => {
    const paths = voicePaths('M');
    expect(paths.segmentation).toBe(join('M', 'pyannote-segmentation-3-0', 'model.onnx'));
    expect(paths.embedding).toBe(join('M', 'speaker-embedding', '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'));
    expect(paths.vad).toBe(join('M', 'silero-vad', 'silero_vad.onnx'));
    expect(asrFilePath('M', 'qwen3-asr-0.6b', 'tokenizer/vocab.json')).toBe(join('M', 'qwen3-asr-0.6b-int8', 'tokenizer', 'vocab.json'));
  });

  it('refuses a file the registry does not know', () => {
    expect(() => asrFilePath('M', 't-one', 'encoder.onnx')).toThrow('В реестре нет модели t-one-ru/encoder.onnx');
  });

  it('turns a registry path into a path of this system', () => {
    expect(modelFilePath('M', { path: 'a/b.onnx' })).toBe(join('M', 'a', 'b.onnx'));
  });
});

describe('modelsRoot', () => {
  it('uses the service folders of each system', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', localAppData: 'L' })).toBe(join('L', 'TextMeet', 'models'));
    expect(modelsRoot({ platform: 'win32', homeDir: 'H' })).toBe(join('H', 'AppData', 'Local', 'TextMeet', 'models'));
    expect(modelsRoot({ platform: 'darwin', homeDir: 'H' })).toBe(
      join('H', 'Library', 'Application Support', 'TextMeet', 'models'),
    );
    expect(modelsRoot({ platform: 'linux', homeDir: 'H' })).toBe(join('H', '.local', 'share', 'TextMeet', 'models'));
  });

  it('treats an empty %LOCALAPPDATA% as missing', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', localAppData: '' })).toBe(join('H', 'AppData', 'Local', 'TextMeet', 'models'));
  });

  it('takes the folder from tests when given', () => {
    expect(modelsRoot({ platform: 'win32', homeDir: 'H', override: 'T' })).toBe('T');
  });
});
