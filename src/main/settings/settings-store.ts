import { promises as fsp } from 'node:fs';
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '../../shared/settings';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';

export type SettingsUpdate = Partial<Omit<Settings, 'schemaVersion'>>;

export interface SettingsStore {
  get(): Settings;
  /** Проверяет, сохраняет на диск и только потом меняет значение в памяти. */
  update(patch: SettingsUpdate): Promise<Settings>;
}

/** Нет файла — настройки по умолчанию. Файл повреждён — откладываем его в сторону и тоже берём умолчания. */
export async function loadSettings(file: string, logger: Logger, now: () => Date = () => new Date()): Promise<Settings> {
  const result = await readJsonFile(file, SettingsSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return DEFAULT_SETTINGS;
  const backup = `${file}.broken-${now().getTime()}`;
  try {
    await fsp.rename(file, backup);
    logger.warn(`Настройки повреждены (${result.reason}), копия: ${backup}. Используются значения по умолчанию.`);
  } catch (err) {
    logger.error('Настройки повреждены, и не удалось отложить файл в сторону', err);
  }
  return DEFAULT_SETTINGS;
}

export async function createSettingsStore(file: string, logger: Logger): Promise<SettingsStore> {
  let current = await loadSettings(file, logger);
  let queue: Promise<unknown> = Promise.resolve();

  return {
    get: () => current,
    update: (patch) => {
      const run = queue.then(async () => {
        const next = SettingsSchema.parse({ ...current, ...patch });
        await writeJsonAtomic(file, next);
        current = next;
        return next;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
