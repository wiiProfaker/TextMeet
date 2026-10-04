import { describe, expect, it } from 'vitest';
import { ASR_MODEL_IDS } from '../../shared/asr-models';
import { buildModelsState } from './models-state';
import { groupSize } from './registry';

describe('buildModelsState', () => {
  it('lists every catalog model in order, the shared voice models apart, and what is going on', () => {
    const state = buildModelsState(
      [
        { id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true },
        { id: 'voices', sizeBytes: 3, installed: true },
      ],
      't-one',
      { download: { id: 't-one', done: 1, total: 2 }, downloadError: null },
      true,
    );
    expect(state.models.map((m) => m.id)).toEqual([...ASR_MODEL_IDS]);
    expect(state.models[0]).toEqual({ id: 'gigaam-v3-e2e-rnnt', sizeBytes: 10, installed: true });
    expect(state.models.find((m) => m.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: false });
    expect(state.voices).toEqual({ sizeBytes: 3, installed: true });
    expect(state).toMatchObject({ selected: 't-one', download: { id: 't-one', done: 1, total: 2 }, downloadError: null, busy: true });
  });

  it('shows a failed download only while the model is still missing', () => {
    const failed = (id: 't-one' | 'gigaam-v3-e2e-rnnt') => ({ download: null, downloadError: { id, message: 'нет связи' } });
    const groups = [{ id: 'gigaam-v3-e2e-rnnt' as const, sizeBytes: 10, installed: true }];
    expect(buildModelsState(groups, 't-one', failed('t-one'), false).downloadError).toEqual({ id: 't-one', message: 'нет связи' });
    expect(buildModelsState(groups, 't-one', failed('gigaam-v3-e2e-rnnt'), false).downloadError).toBeNull();
  });
});
