// Скачивание из каталога моделей (кнопки «Скачать» / «Отменить» в карточке, решения Плана 7, §2): одна модель за раз,
// прогресс в окно не чаще двух раз в секунду, отмена стирает недокачанное. Electron сюда не подключается.
import type { AsrModelId } from '../../shared/asr-models';
import type { Logger } from '../logger';
import { transcriptionTexts } from '../texts';
import { DownloadError } from './download';
import type { EnsureOptions } from './model-manager';
import type { CatalogDownloadsSnapshot } from './models-state';
import type { ModelGroupId } from './registry';

/** Прогресс в окно — не чаще. */
export const DOWNLOAD_REPORT_MS = 500;
export const DOWNLOAD_RUNNING = 'Сейчас скачивается другая модель — дождитесь конца или отмените её скачивание.';

export interface CatalogDownloadsDeps {
  models: {
    ensure(groups: readonly ModelGroupId[], options: EnsureOptions): Promise<void>;
    remove(group: ModelGroupId): Promise<void>;
  };
  logger: Logger;
  /** Состояние скачивания изменилось — окно перечитает модели. */
  changed(): void;
  now(): number;
}

interface Running {
  id: AsrModelId;
  done: number;
  total: number;
  controller: AbortController;
  /** Скачивание закончилось; true — его отменили (а не скачалось или сломалось). */
  finished: Promise<boolean>;
}

export class CatalogDownloads {
  private running: Running | null = null;
  private error: CatalogDownloadsSnapshot['downloadError'] = null;
  private lastReport = 0;

  constructor(private readonly deps: CatalogDownloadsDeps) {}

  snapshot(): CatalogDownloadsSnapshot {
    const running = this.running;
    return {
      download: running && { id: running.id, done: running.done, total: running.total },
      downloadError: this.error,
    };
  }

  isBusy(): boolean {
    return this.running !== null;
  }

  /**
   * Начать скачивание модели (и общих моделей голосов, если их нет). Та же модель уже качается — ничего не делает;
   * другая — отказ: две загрузки разом делили бы канал и место на диске.
   */
  start(id: AsrModelId): void {
    if (this.running?.id === id) return;
    if (this.running) throw new Error(DOWNLOAD_RUNNING);
    const controller = new AbortController();
    const running: Running = { id, done: 0, total: 0, controller, finished: Promise.resolve(false) };
    this.running = running;
    if (this.error?.id === id) this.error = null;
    running.finished = this.deps.models
      .ensure([id, 'voices'], {
        signal: controller.signal,
        onProgress: ({ done, total }) => {
          running.done = done;
          running.total = total;
          this.report(false);
        },
      })
      .then(
        () => {
          this.deps.logger.info(`Модель скачана: ${id}`);
          return false;
        },
        (err: unknown) => {
          if (err instanceof DownloadError && err.kind === 'cancelled') return true;
          this.deps.logger.error(`Модель не скачалась: ${id}`, err);
          this.error = { id, message: transcriptionTexts.download(err) };
          return false;
        },
      )
      .finally(() => {
        if (this.running === running) this.running = null;
        this.report(true);
      });
    this.report(true);
  }

  /**
   * Отменить скачивание модели id: загрузка обрывается, скачанные файлы этой модели стираются. Успела скачаться
   * целиком до отмены — остаётся.
   */
  async cancel(id: AsrModelId): Promise<void> {
    const running = this.running;
    if (running?.id !== id) return;
    running.controller.abort();
    if (!(await running.finished)) return;
    try {
      await this.deps.models.remove(id);
    } catch (err) {
      // Модель сейчас проверяет расшифровка — недокачанное останется и докачается при следующем скачивании.
      this.deps.logger.warn(`Недокачанная модель ${id} не удалена`, err);
    }
    this.report(true);
  }

  private report(force: boolean): void {
    const now = this.deps.now();
    if (!force && now - this.lastReport < DOWNLOAD_REPORT_MS) return;
    this.lastReport = now;
    try {
      this.deps.changed();
    } catch (err) {
      this.deps.logger.error('Скачивание моделей: сбой обработчика', err);
    }
  }
}
