// Скачивание моделей, начатое очередью расшифровки (решения Плана 8, §5.2): «Расшифровать» с нескачанной моделью
// качает её сам — карточка каталога показывает этот ход, а не молчит. Обёртка над хранилищем, которое получает очередь.
import { isAsrModelId } from '../../shared/asr-models';
import { isLlmModelId } from '../../shared/llm-models';
import type { CatalogModelId } from '../../shared/transcription';
import { DOWNLOAD_REPORT_MS } from './catalog-downloads';
import type { ModelStore } from './model-manager';
import type { ModelGroupId } from './registry';

/** Что качает очередь: модель каталога (карточка) и ход в байтах. */
export interface QueueDownload {
  group: CatalogModelId;
  done: number;
  total: number;
}

const catalogGroup = (groups: readonly ModelGroupId[]): CatalogModelId | null =>
  groups.find((g): g is CatalogModelId => isAsrModelId(g) || isLlmModelId(g)) ?? null;

/** Хранилище для очереди расшифровки: то же самое, но знает, что сейчас качается; changed — окну пора обновить каталог. */
export function trackQueueDownloads(
  store: ModelStore,
  changed: () => void,
  now: () => number = Date.now,
): ModelStore & { active(): QueueDownload | null } {
  let active: QueueDownload | null = null;
  let lastReport = 0;
  const report = (force: boolean): void => {
    if (!force && now() - lastReport < DOWNLOAD_REPORT_MS) return;
    lastReport = now();
    changed();
  };
  return {
    get root() {
      return store.root;
    },
    state: () => store.state(),
    remove: (group) => store.remove(group),
    active: () => active,
    ensure: async (groups, options = {}) => {
      const group = catalogGroup(groups);
      try {
        await store.ensure(groups, {
          ...options,
          onProgress: (progress) => {
            options.onProgress?.(progress);
            if (group === null) return;
            const first = active === null;
            active = { group, done: progress.done, total: progress.total };
            report(first);
          },
        });
      } finally {
        if (active !== null) {
          active = null;
          report(true);
        }
      }
    },
  };
}
