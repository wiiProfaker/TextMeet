// Поддельное хранилище моделей — только для автотестов (TEXTMEET_TEST_ASR=fake): «скачивание» без сети за пять шагов
// по stepMs (TEXTMEET_TEST_DOWNLOAD_MS), отмена, удаление. Сквозные тесты проверяют каталог в окне, а не загрузку.
import type { ModelGroupState } from '../../shared/transcription';
import { DownloadError } from './download';
import type { EnsureOptions, ModelStore } from './model-manager';
import { groupSize, MODEL_GROUP_IDS, type ModelGroupId } from './registry';

const STEPS = 5;

export class FakeModelStore implements ModelStore {
  private readonly installed: Set<ModelGroupId>;

  /** installed — модели, «скачанные» с самого начала (TEXTMEET_TEST_INSTALLED). */
  constructor(
    readonly root: string,
    private readonly stepMs: number,
    installed: readonly ModelGroupId[] = [],
  ) {
    this.installed = new Set(installed);
  }

  async ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    const missing = groups.filter((g) => !this.installed.has(g));
    if (missing.length === 0) return;
    const total = missing.reduce((sum, g) => sum + groupSize(g), 0);
    for (let step = 1; step <= STEPS; step++) {
      if (options.signal?.aborted) throw new DownloadError('cancelled', 'скачивание отменено');
      await new Promise((resolve) => setTimeout(resolve, this.stepMs));
      options.onProgress?.({ done: Math.round((total * step) / STEPS), total });
    }
    if (options.signal?.aborted) throw new DownloadError('cancelled', 'скачивание отменено');
    for (const group of missing) this.installed.add(group);
  }

  async state(): Promise<(ModelGroupState & { id: ModelGroupId })[]> {
    return MODEL_GROUP_IDS.map((id) => ({ id, sizeBytes: groupSize(id), installed: this.installed.has(id) }));
  }

  async remove(group: ModelGroupId): Promise<void> {
    this.installed.delete(group);
  }
}
