import { describe, expect, it } from 'vitest';
import { effectiveAiModel, isLlmModelId, LLM_MODEL_IDS, LLM_MODELS, llmModel, RECOMMENDED_LLM_MODEL } from './llm-models';

describe('LLM catalog', () => {
  it('describes every model once, in the order of the ids', () => {
    expect(LLM_MODELS.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(LLM_MODEL_IDS[0]).toBe(RECOMMENDED_LLM_MODEL);
  });

  it('gives every model bars from 1 to 5 and a window big enough for a meeting', () => {
    for (const model of LLM_MODELS) {
      for (const bar of [model.quality, model.speed]) {
        expect(bar).toBeGreaterThanOrEqual(1);
        expect(bar).toBeLessThanOrEqual(5);
      }
      // Час разговора ≈ 14 000 «кусочков» (решения Плана 9, §3): в окно помещается больше двух часов.
      expect(model.contextTokens).toBeGreaterThanOrEqual(40_960);
    }
  });

  it('warns about the shorter window of T-lite only, and marks only the measured model as measured', () => {
    expect(LLM_MODELS.filter((m) => m.warning).map((m) => m.id)).toEqual(['t-lite-it-2.1']);
    expect(llmModel('t-lite-it-2.1').contextTokens).toBe(40_960);
    expect(LLM_MODELS.filter((m) => m.measured).map((m) => m.id)).toEqual(['qwen3.5-9b']);
  });

  it('recognizes catalog ids only', () => {
    expect(isLlmModelId('qwen3.5-4b')).toBe(true);
    expect(isLlmModelId('gigaam-v3-e2e-rnnt')).toBe(false);
    expect(isLlmModelId(null)).toBe(false);
  });
});

describe('effectiveAiModel', () => {
  it('keeps the chosen model while it is downloaded', () => {
    expect(effectiveAiModel('qwen3.5-4b', ['qwen3.5-9b', 'qwen3.5-4b'])).toBe('qwen3.5-4b');
  });

  it('picks the first downloaded model in catalog order when none is chosen or the chosen one is gone', () => {
    expect(effectiveAiModel(null, ['qwen3.5-4b', 't-lite-it-2.1'])).toBe('t-lite-it-2.1');
    expect(effectiveAiModel('qwen3.5-9b', ['qwen3.5-4b'])).toBe('qwen3.5-4b');
  });

  it('has nothing to pick when nothing is downloaded', () => {
    expect(effectiveAiModel('qwen3.5-9b', [])).toBeNull();
    expect(effectiveAiModel(null, [])).toBeNull();
  });
});
