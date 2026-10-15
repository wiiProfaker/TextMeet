import { describe, expect, it } from 'vitest';
import { LLM_MODEL_IDS, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import { aiCatalogSections, aiDownloadText, aiModelState, aiModelTag, aiSizeText } from './ai-catalog';

const GB = 1024 ** 3;

function state(selected: LlmModelId | null, installed: LlmModelId[]): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, sizeBytes: 5 * GB, installed: installed.includes(id) })),
    download: null,
    downloadError: null,
    busy: false,
  };
}

describe('aiCatalogSections', () => {
  it('puts the chosen model first, then the downloaded ones, then the ones to download', () => {
    expect(aiCatalogSections(state('qwen3.5-4b', ['qwen3.5-4b', 't-lite-it-2.1']))).toEqual({
      selected: 'qwen3.5-4b',
      downloaded: ['t-lite-it-2.1'],
      available: ['qwen3.5-9b', 'gigachat-3.1-lightning'],
    });
  });

  it('has no chosen model while nothing is downloaded', () => {
    expect(aiCatalogSections(state(null, []))).toEqual({ selected: null, downloaded: [], available: [...LLM_MODEL_IDS] });
  });
});

describe('AI catalog labels', () => {
  it('tags the recommended model and the models nobody measured', () => {
    expect(aiModelTag('qwen3.5-9b')).toEqual({ text: 'Рекомендуется', estimate: false });
    expect(aiModelTag('gigachat-3.1-lightning')).toEqual({ text: 'оценка', estimate: true });
  });

  it('shows the size in gigabytes, and that the model is downloaded', () => {
    expect(aiSizeText({ sizeBytes: 5_680_522_464, installed: false })).toBe('5,3 ГБ');
    expect(aiSizeText({ sizeBytes: 5_680_522_464, installed: true })).toBe('скачана · 5,3 ГБ');
    expect(aiModelState(state(null, ['qwen3.5-4b']), 'qwen3.5-4b')).toMatchObject({ sizeBytes: 5 * GB, installed: true });
  });

  it('tells the bytes and, once known, how long is left', () => {
    const download = { id: 'qwen3.5-9b' as const, done: 2.7 * GB, total: 6 * GB, remainingSec: null };
    expect(aiDownloadText({ ...download, total: 0 })).toBe('Скачиваем…');
    expect(aiDownloadText(download)).toBe('2,7 из 6,0 ГБ');
    expect(aiDownloadText({ ...download, remainingSec: 230 })).toBe('2,7 из 6,0 ГБ · осталось около 4 мин');
  });
});
