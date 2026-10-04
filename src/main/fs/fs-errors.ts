// Системные ошибки файлов → понятная причина по-русски. Код и подробности остаются в журнале.
const REASONS: Record<string, string> = {
  EACCES: 'нет прав на эту папку',
  EPERM: 'нет прав на эту папку',
  ENOSPC: 'на диске закончилось место',
  EDQUOT: 'на диске закончилось место',
  EBUSY: 'файл занят другой программой',
  ENOENT: 'папка не найдена',
  ENOTDIR: 'папка не найдена',
  EROFS: 'диск доступен только для чтения',
  EIO: 'ошибка чтения или записи диска',
};

/** Понятная причина по коду системной ошибки; null — код незнакомый (или его нет). */
export function knownFsReason(err: unknown): string | null {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return (code && REASONS[code]) || null;
}

/** «нет прав на эту папку» для EACCES; иначе — текст самой ошибки. */
export function fsErrorReason(err: unknown): string {
  return knownFsReason(err) ?? (err instanceof Error ? err.message : String(err));
}

/**
 * Ошибка для показа человеку: «Не удалось открыть папку: нет прав на эту папку». Незнакомый код — без текста системы
 * и путей: они остаются в cause (и в журнале).
 */
export function humanFsError(action: string, err: unknown): Error {
  return new Error(`${action}: ${knownFsReason(err) ?? 'файл занят или недоступен'}`, { cause: err });
}
