import { describe, expect, it, vi } from 'vitest';
import type { EnsureOptions, ModelStore } from './model-manager';
import { withQueueDownload } from './models-state';
import { trackQueueDownloads } from './queue-downloads';

/** Хранилище, которым управляет тест: ensure ждёт, пока тест не скажет «готово». */
function fakeStore() {
  let options: EnsureOptions | undefined;
  let finish: () => void = () => undefined;
  let fail: (err: unknown) => void = () => undefined;
  const store: ModelStore = {
    root: 'M',
    ensure: vi.fn(async (_groups, opts) => {
      options = opts;
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    }),
    state: vi.fn(async () => []),
    remove: vi.fn(async () => undefined),
  };
  return { store, progress: (done: number, total: number) => options?.onProgress?.({ done, total }), finish: () => finish(), fail: (e: unknown) => fail(e) };
}

describe('trackQueueDownloads', () => {
  it('a download started by the transcription queue shows on the catalog card as queued', async () => {
    const f = fakeStore();
    const changed = vi.fn();
    const tracked = trackQueueDownloads(f.store, changed);
    const ensuring = tracked.ensure(['gigaam-v3-e2e-rnnt', 'voices']);
    expect(tracked.active()).toBeNull();
    f.progress(10, 100);
    expect(tracked.active()).toEqual({ group: 'gigaam-v3-e2e-rnnt', done: 10, total: 100 });
    expect(changed).toHaveBeenCalled();
    expect(withQueueDownload({ download: null, downloadError: null }, tracked.active())).toEqual({
      download: { id: 'gigaam-v3-e2e-rnnt', done: 10, total: 100, remainingSec: null, queued: true },
      downloadError: null,
    });
    f.finish();
    await ensuring;
    expect(tracked.active()).toBeNull();
    expect(tracked.root).toBe('M');
  });

  it('forgets the download when it fails and passes the error on', async () => {
    const f = fakeStore();
    const tracked = trackQueueDownloads(f.store, () => undefined);
    const ensuring = tracked.ensure(['t-one', 'voices']);
    f.progress(1, 2);
    f.fail(new Error('нет связи'));
    await expect(ensuring).rejects.toThrow('нет связи');
    expect(tracked.active()).toBeNull();
  });

  it('a catalog download wins over the queue in the snapshot', () => {
    const catalog = { download: { id: 't-one' as const, done: 1, total: 2, remainingSec: 5 }, downloadError: null };
    expect(withQueueDownload(catalog, { group: 'gigaam-v3-e2e-rnnt', done: 10, total: 100 })).toEqual(catalog);
  });

  it('only voice models being fetched are not a catalog card', () => {
    const f = fakeStore();
    const tracked = trackQueueDownloads(f.store, () => undefined);
    void tracked.ensure(['voices']);
    f.progress(1, 2);
    expect(tracked.active()).toBeNull();
    f.finish();
  });
});
