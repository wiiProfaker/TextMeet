import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logger';
import { transcriptionTexts } from '../texts';
import { CatalogDownloads, DOWNLOAD_REPORT_MS, DOWNLOAD_RUNNING } from './catalog-downloads';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { ModelGroupId } from './registry';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };

/** Скачивание, которым управляет тест: прогресс, конец, ошибка; отмена отклоняет его, как настоящее. */
function controllableModels() {
  const calls: { groups: readonly ModelGroupId[]; options: EnsureOptions; resolve(): void; reject(err: unknown): void }[] = [];
  const removed: ModelGroupId[] = [];
  const models = {
    ensure: (groups: readonly ModelGroupId[], options: EnsureOptions) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ groups, options, resolve, reject });
        options.signal?.addEventListener('abort', () => reject(new DownloadError('cancelled', 'скачивание отменено')));
      }),
    remove: vi.fn(async (group: ModelGroupId) => {
      removed.push(group);
    }),
  };
  return { models, calls, removed };
}

function setup() {
  const { models, calls, removed } = controllableModels();
  let now = 0;
  const changed = vi.fn();
  const downloads = new CatalogDownloads({ models, logger, changed, now: () => now });
  return {
    downloads,
    calls,
    removed,
    models,
    changed,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe('CatalogDownloads', () => {
  it('downloads a model together with the shared voice models and shows the bytes', async () => {
    const t = setup();
    t.downloads.start('t-one');
    expect(t.calls[0]?.groups).toEqual(['t-one', 'voices']);
    expect(t.downloads.snapshot()).toEqual({ download: { id: 't-one', done: 0, total: 0 }, downloadError: null });
    expect(t.downloads.isBusy()).toBe(true);
    t.tick(DOWNLOAD_REPORT_MS);
    t.calls[0]!.options.onProgress?.({ done: 50, total: 200 });
    expect(t.downloads.snapshot().download).toEqual({ id: 't-one', done: 50, total: 200 });
    t.calls[0]!.resolve();
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot()).toEqual({ download: null, downloadError: null });
  });

  it('tells the window at most twice a second, but always at the start and the end', async () => {
    const t = setup();
    t.downloads.start('t-one');
    expect(t.changed).toHaveBeenCalledTimes(1);
    t.calls[0]!.options.onProgress?.({ done: 1, total: 10 });
    t.calls[0]!.options.onProgress?.({ done: 2, total: 10 });
    expect(t.changed).toHaveBeenCalledTimes(1);
    t.tick(DOWNLOAD_REPORT_MS);
    t.calls[0]!.options.onProgress?.({ done: 3, total: 10 });
    expect(t.changed).toHaveBeenCalledTimes(2);
    t.calls[0]!.resolve();
    await vi.waitFor(() => expect(t.changed).toHaveBeenCalledTimes(3));
  });

  it('downloads one model at a time and ignores a second press on the same one', () => {
    const t = setup();
    t.downloads.start('t-one');
    t.downloads.start('t-one');
    expect(t.calls).toHaveLength(1);
    expect(() => t.downloads.start('canary-180m-flash')).toThrow(DOWNLOAD_RUNNING);
  });

  it('cancels: stops the download and erases what was downloaded, without an error', async () => {
    const t = setup();
    t.downloads.start('qwen3-asr-0.6b');
    await t.downloads.cancel('qwen3-asr-0.6b');
    expect(t.calls[0]!.options.signal?.aborted).toBe(true);
    expect(t.removed).toEqual(['qwen3-asr-0.6b']);
    expect(t.downloads.snapshot()).toEqual({ download: null, downloadError: null });
  });

  it('keeps a model that finished downloading right before the cancel', async () => {
    const t = setup();
    t.downloads.start('t-one');
    t.calls[0]!.resolve();
    await t.downloads.cancel('t-one');
    expect(t.removed).toEqual([]);
  });

  it('cancelling another model does nothing', async () => {
    const t = setup();
    t.downloads.start('t-one');
    await t.downloads.cancel('canary-180m-flash');
    expect(t.calls[0]!.options.signal?.aborted).toBe(false);
    expect(t.removed).toEqual([]);
  });

  it('keeps the reason of a failed download for the card and clears it on a new try', async () => {
    const t = setup();
    t.downloads.start('t-one');
    t.calls[0]!.reject(new DownloadError('network', 'нет связи с сервером'));
    await vi.waitFor(() => expect(t.downloads.isBusy()).toBe(false));
    expect(t.downloads.snapshot().downloadError).toEqual({
      id: 't-one',
      message: transcriptionTexts.download(new DownloadError('network', 'x')),
    });
    t.downloads.start('t-one');
    expect(t.downloads.snapshot().downloadError).toBeNull();
  });

  it('keeps the partial files when they cannot be removed right now', async () => {
    const t = setup();
    t.models.remove.mockRejectedValueOnce(new Error('модели сейчас проверяются или скачиваются'));
    t.downloads.start('t-one');
    await t.downloads.cancel('t-one');
    expect(logger.warn).toHaveBeenCalled();
    expect(t.downloads.isBusy()).toBe(false);
  });
});
