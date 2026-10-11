// Типы импорта, общие для main и окна. Без zod и пакетов: модуль попадает в preload.

/** Сколько файлов можно добавить за раз (кнопкой или перетаскиванием). */
export const MAX_IMPORT_FILES = 100;

/** Ход импорта встречи для списка и для самой встречи. */
export interface ImportProgress {
  meetingId: string;
  /** Доля скопированного 0–1; null — длительность файла неизвестна (полоска без процентов). */
  fraction: number | null;
  /** Ждёт очереди: копируется другой файл. */
  waiting: boolean;
}

/** Файл, который не удалось добавить: имя без пути и причина для человека. */
export interface ImportFailure {
  name: string;
  reason: string;
}

export interface ImportResult {
  /** id созданных встреч — по порядку файлов. */
  added: string[];
  failed: ImportFailure[];
}
