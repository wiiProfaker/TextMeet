import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { LLM_MODEL_IDS } from '../../shared/llm-models';
import { buildAiModelsState, buildModelsState } from './models-state';
import { groupSize } from './registry';

describe('buildModelsState', () => {
  it('lists every catalog model in order, the shared voice models apart, and what is going on', () => {
    const state = buildModelsState(
      [
        { id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true },
        { id: 'voices', sizeBytes: 3, installed: true },
      ],
      't-one',
      { download: { id: 't-one', done: 1, total: 2, remainingSec: null }, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
    expect(state.models.find((m) => m.id === 'gigaam-v3-e2e-rnnt')).toEqual({ id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true });
    expect(state.models.find((m) => m.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: false });
    expect(state.voices).toEqual({ sizeBytes: 3, installed: true });
    expect(state).toMatchObject({
      selected: 't-one',
      download: { id: 't-one', done: 1, total: 2, remainingSec: null },
      downloadError: null,
      busy: true,
    });
  });

  it('shows a failed download only while the model is still missing', () => {
    const failed = (id: 't-one' | 'gigaam-v3-e2e-rnnt') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    const groups = [{ id: 'gigaam-v3-e2e-rnnt' as const, sizeBytes: 10, installed: true }];
    expect(buildModelsState(groups, 't-one', failed('t-one'), false).downloadError).toEqual({ id: 't-one', message: 'нет связи' });
    expect(buildModelsState(groups, 't-one', failed('gigaam-v3-e2e-rnnt'), false).downloadError).toBeNull();
  });

  it('leaves a failed download of a model for summaries to the AI catalog', () => {
    const failed = { download: null, downloadError: { id: 'qwen3.5-9b' as const, message: 'нет связи' } };
    expect(buildModelsState([], 't-one', failed, false).downloadError).toBeNull();
  });
});

describe('buildAiModelsState', () => {
  it('lists the models for summaries in catalog order with the download of any catalog', () => {
    const download = { id: 't-one' as const, done: 1, total: 2, remainingSec: 40 };
    const state = buildAiModelsState(
      [{ id: 'qwen3.5-4b', sizeBytes: 7, installed: true }],
      'qwen3.5-4b',
      { download, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...LLM_MODEL_IDS]);
    expect(state.models.find((m) => m.id === 'qwen3.5-4b')).toEqual({ id: 'qwen3.5-4b', sizeBytes: 7, installed: true });
    expect(state.models[0]).toEqual({ id: 'qwen3.5-9b', sizeBytes: groupSize('qwen3.5-9b'), installed: false });
    expect(state).toMatchObject({ selected: 'qwen3.5-4b', download, downloadError: null, busy: true });
  });

  it('shows only its own failed download, and only while the model is missing', () => {
    const failed = (id: 't-one' | 'qwen3.5-9b') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    expect(buildAiModelsState([], null, failed('qwen3.5-9b'), false).downloadError).toEqual({ id: 'qwen3.5-9b', message: 'нет связи' });
    expect(buildAiModelsState([], null, failed('t-one'), false).downloadError).toBeNull();
    const installed = [{ id: 'qwen3.5-9b' as const, sizeBytes: 1, installed: true }];
    expect(buildAiModelsState(installed, 'qwen3.5-9b', failed('qwen3.5-9b'), false).downloadError).toBeNull();
  });
});
