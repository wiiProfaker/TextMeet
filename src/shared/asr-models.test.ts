import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS, ASR_MODELS, DEFAULT_ASR_MODEL, asrModel, isAsrModelId, slowdown, speedLevel } from './asr-models';

describe('ASR model catalog', () => {
  it('lists every id once, in the order of the ids', () => {
    expect(ASR_MODELS.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
  });

  it('describes every model for its card', () => {
    for (const model of ASR_MODELS) {
      expect(model.title.length).toBeGreaterThan(0);
      expect(model.author.length).toBeGreaterThan(0);
      expect(model.description.length).toBeGreaterThan(0);
      expect(model.languages.length).toBeGreaterThan(0);
      expect(model.accuracy).toBeGreaterThanOrEqual(1);
      expect(model.accuracy).toBeLessThanOrEqual(5);
      expect(model.rtf).toBeGreaterThan(0);
    }
  });

  it('Whisper is the default model (the user chose it on 2026-10-18), the catalog starts with it', () => {
    expect(DEFAULT_ASR_MODEL).toBe('whisper-large-v3-turbo');
  });

  it('starts with the default model and keeps the English-only models last', () => {
    expect(ASR_MODELS[0]!.id).toBe(DEFAULT_ASR_MODEL);
    const groups = ASR_MODELS.map((m) => m.group);
    expect(groups.indexOf('en')).toBeGreaterThan(groups.lastIndexOf('ru'));
  });

  it('filters the text only of the models that make things up', () => {
    expect(ASR_MODELS.filter((m) => m.hallucinates).map((m) => m.id)).toEqual(['whisper-large-v3-turbo', 'qwen3-asr-0.6b']);
  });

  it('recognizes catalog ids', () => {
    expect(isAsrModelId('t-one')).toBe(true);
    expect(isAsrModelId('whisper-tiny')).toBe(false);
    expect(isAsrModelId(null)).toBe(false);
  });

  it('falls back to the default model for an unknown id', () => {
    expect(asrModel('canary-180m-flash').title).toBe('Canary 180M Flash');
    expect(asrModel('whisper-tiny').id).toBe(DEFAULT_ASR_MODEL);
    expect(asrModel(undefined).id).toBe(DEFAULT_ASR_MODEL);
  });

  it('turns the measured speed into a five-step bar', () => {
    expect(speedLevel(0.035)).toBe(5);
    expect(speedLevel(0.05)).toBe(5);
    expect(speedLevel(0.063)).toBe(4);
    expect(speedLevel(0.19)).toBe(3);
    expect(speedLevel(0.21)).toBe(2);
    expect(speedLevel(0.55)).toBe(1);
  });

  it('tells how much slower than GigaAM (the model progress is measured on) a model is, never less than once', () => {
    expect(slowdown('gigaam-v3-e2e-rnnt')).toBe(1);
    expect(slowdown('whisper-large-v3-turbo')).toBeCloseTo(0.55 / 0.035);
  });
});
