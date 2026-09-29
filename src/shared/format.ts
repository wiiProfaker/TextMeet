// Форматирование для людей, общее для main (уведомления, диалоги) и окон.
const pad = (n: number): string => String(n).padStart(2, '0');

/** Длительность для списка и уведомлений: «меньше минуты», «42 мин», «1 ч 04 мин». */
export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return 'меньше минуты';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} ч ${pad(m)} мин` : `${m} мин`;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 100 * MB) return `${Math.round(bytes / MB)} МБ`;
  const gb = bytes / GB;
  const text = gb < 10 ? gb.toFixed(1) : String(Math.round(gb));
  return `${text.replace('.', ',')} ГБ`;
}
