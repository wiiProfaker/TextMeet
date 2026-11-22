// Системные ошибки файлов → понятная причина по-русски. Код и подробности остаются в журнале.
export const FILE_BUSY_REASON = 'файл занят другой программой';

const REASONS: Record<string, string> = {
  EACCES: 'нет прав на эту папку',
  EPERM: 'нет прав на эту папку',
  ENOSPC: 'на диске закончилось место',
  EDQUOT: 'на диске закончилось место',
  EBUSY: FILE_BUSY_REASON,
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

/** Причина для человека: знакомый код — понятным текстом, незнакомый — общими словами, без текста системы и путей. */
export function humanFsReason(err: unknown): string {
  return knownFsReason(err) ?? 'файл занят или недоступен';
}

/**
 * Ошибка для показа человеку: «Не удалось открыть папку: нет прав на эту папку». Незнакомый код — без текста системы
 * и путей: они остаются в cause (и в журнале).
 */
export function humanFsError(action: string, err: unknown): Error {
  return new Error(`${action}: ${humanFsReason(err)}`, { cause: err });
}
