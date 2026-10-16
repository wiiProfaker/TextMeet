import { describe, expect, it } from 'vitest';
import { FakeModelStore } from './fake-model-store';
import { groupSize } from './registry';

describe('FakeModelStore', () => {
  it('«downloads» in steps and then shows the groups as installed', async () => {
    const store = new FakeModelStore('M', 0);
    const progress: number[] = [];
    await store.ensure(['t-one', 'voices'], { onProgress: (p) => progress.push(p.done) });
    const total = groupSize('t-one') + groupSize('voices');
    expect(progress).toHaveLength(5);
    expect(progress.at(-1)).toBe(total);
    const state = await store.state();
    expect(state.find((g) => g.id === 't-one')).toEqual({ id: 't-one', sizeBytes: groupSize('t-one'), installed: true });
    expect(state.find((g) => g.id === 'gigaam-v3-e2e-rnnt')?.installed).toBe(false);
    expect(store.root).toBe('M');
  });

  it('stops when cancelled and can remove a group', async () => {
    const store = new FakeModelStore('M', 0);
    const controller = new AbortController();
    controller.abort();
    await expect(store.ensure(['t-one'], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    await store.ensure(['t-one']);
    await store.remove('t-one');
    expect((await store.state()).find((g) => g.id === 't-one')?.installed).toBe(false);
    // Уже скачанное — без «скачивания».
    await store.ensure([]);
  });

  it('can start with models already «downloaded»', async () => {
    const store = new FakeModelStore('M', 0, ['qwen3.5-9b']);
    expect((await store.state()).filter((g) => g.installed).map((g) => g.id)).toEqual(['qwen3.5-9b']);
  });
});
