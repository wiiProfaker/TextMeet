// Типы импорта, общие для main и окна. Без zod и пакетов: модуль попадает в preload.

/** Сколько файлов можно добавить за раз (кнопкой или перетаскиванием). */
export const MAX_IMPORT_FILES = 100;

/** Расширения для фильтра «Аудио и видео» в окне выбора файлов (остальное — через «Все файлы»). */
export const IMPORT_EXTENSIONS = [
  'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'wma', 'amr', '3gp',
  'mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi',
];

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

/** Звук файла не скопировался уже после того, как его встреча появилась: main её убрал (или оставил с ошибкой). */
export interface ImportFailedEvent extends ImportFailure {
  meetingId: string;
}

export interface ImportResult {
  /** id созданных встреч — по порядку файлов. */
  added: string[];
  failed: ImportFailure[];
}
