import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelsRoot } from './models-dir';
import { groupSize, MODEL_FILES, MODEL_GROUPS, modelFilePath, modelPaths, TOTAL_MODELS_SIZE } from './registry';

describe('model registry', () => {
  it('describes every file with a url, a size and a SHA-256', () => {
    for (const file of MODEL_FILES) {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(MODEL_GROUPS.map((g) => g.id)).toContain(file.group);
    }
  });

  it('keeps paths unique and inside the models folder', () => {
    const paths = MODEL_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).not.toMatch(/\.\.|^\/|\\/);
  });

  it('adds up the sizes shown in the settings', () => {
    expect(groupSize('gigaam')).toBe(326_322_304);
    expect(groupSize('voices')).toBe(33_122_030);
    expect(TOTAL_MODELS_SIZE).toBe(groupSize('gigaam') + groupSize('voices'));
  });

  it('builds the paths the transcription process loads', () => {
    const paths = modelPaths('M');
    expect(paths.encoder).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'));
    expect(paths.decoder).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_decoder.onnx'));
    expect(paths.joiner).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_joint.onnx'));
    expect(paths.tokens).toBe(join('M', 'gigaam-v3-e2e-rnnt', 'gigaam_v3_e2e_rnnt_tokens.txt'));
    expect(paths.segmentation).toBe(join('M', 'pyannote-segmentation-3-0', 'model.onnx'));
    expect(paths.embedding).toBe(join('M', 'speaker-embedding', '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx'));
    expect(paths.vad).toBe(join('M', 'silero-vad', 'silero_vad.onnx'));
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
