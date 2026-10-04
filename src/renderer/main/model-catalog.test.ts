import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelsState } from '../../shared/transcription';
import { catalogSections, downloadText, modelBars, modelChoiceLabel } from './model-catalog';

const MB = 1024 * 1024;

function state(selected: AsrModelId, installed: AsrModelId[]): ModelsState {
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, sizeBytes: 464 * MB, installed: installed.includes(id) })),
    voices: { sizeBytes: 33 * MB, installed: true },
    download: null,
    downloadError: null,
    busy: false,
  };
}

describe('catalogSections', () => {
  it('puts the chosen model first, then the downloaded ones, then the rest by language', () => {
    const sections = catalogSections(state('parakeet-tdt-0.6b-v3', ['gigaam-v3-e2e-rnnt', 'parakeet-tdt-0.6b-v3', 'canary-180m-flash']));
    expect(sections).toEqual({
      selected: 'parakeet-tdt-0.6b-v3',
      downloaded: ['gigaam-v3-e2e-rnnt', 'canary-180m-flash'],
      russian: ['qwen3-asr-0.6b', 'whisper-large-v3-turbo', 'nemotron-3.5-asr', 't-one'],
      english: ['parakeet-unified-en-0.6b'],
    });
  });

  it('keeps the chosen model on top even when it is not downloaded yet', () => {
    const sections = catalogSections(state('gigaam-v3-e2e-rnnt', []));
    expect(sections.selected).toBe('gigaam-v3-e2e-rnnt');
    expect(sections.downloaded).toEqual([]);
    expect(sections.russian).not.toContain('gigaam-v3-e2e-rnnt');
    expect([sections.selected, ...sections.russian, ...sections.english]).toHaveLength(ASR_MODEL_IDS.length);
  });
});

describe('model card texts', () => {
  it('shows the bars of a model', () => {
    expect(modelBars('gigaam-v3-e2e-rnnt')).toEqual({ accuracy: 5, speed: 5 });
    expect(modelBars('whisper-large-v3-turbo')).toEqual({ accuracy: 3, speed: 1 });
  });

  it('names a model in the transcribe window with what choosing it means', () => {
    const s = state('gigaam-v3-e2e-rnnt', ['gigaam-v3-e2e-rnnt']);
    expect(modelChoiceLabel(s, 'gigaam-v3-e2e-rnnt')).toBe('GigaAM v3');
    expect(modelChoiceLabel(s, 't-one')).toBe('T-one — скачается, 464 МБ');
    expect(modelChoiceLabel(s, 'canary-180m-flash')).toBe('Canary 180M Flash — только английский — скачается, 464 МБ');
  });

  it('shows the downloaded bytes', () => {
    expect(downloadText(120 * MB, 464 * MB)).toBe('Скачиваем — 120 из 464 МБ');
    expect(downloadText(0, 0)).toBe('Скачиваем…');
  });
});
