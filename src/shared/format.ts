// Форматирование для людей, общее для main (уведомления, диалоги) и окон.
const pad = (n: number): string => String(n).padStart(2, '0');

/** Месяцы в родительном падеже: «27 сентября». */
export const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** «27 сентября 2026, 16:20» (местное время). */
export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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

const megabytes = (bytes: number): number => Math.round(Math.max(0, bytes) / MB);

/** Размер модели: всегда в мегабайтах («671 МБ») — как и ход её скачивания. */
export const formatMegabytes = (bytes: number): string => `${megabytes(bytes)} МБ`;

/** Ход скачивания: «120 из 464 МБ» — мегабайты, чтобы число росло заметно и у больших моделей. */
export const formatDownloaded = (done: number, total: number): string => `${megabytes(done)} из ${megabytes(total)} МБ`;

const gigabytes = (bytes: number): string => (Math.max(0, bytes) / GB).toFixed(1).replace('.', ',');

/** Ход скачивания больших моделей (для итогов): «2,7 из 6,0 ГБ». */
export const formatDownloadedGb = (done: number, total: number): string => `${gigabytes(done)} из ${gigabytes(total)} ГБ`;

/** Сколько осталось скачивать: «осталось меньше минуты», «осталось около 4 мин», «осталось около 1 ч 05 мин». */
export function formatRemaining(seconds: number): string {
  if (seconds < 60) return 'осталось меньше минуты';
  return `осталось около ${formatDurationShort(Math.ceil(seconds / 60) * 60)}`;
}

/** Размер для людей: «50 МБ», «0,8 ГБ», «214 ГБ» (от 100 МБ — в гигабайтах). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 100 * MB) return `${Math.round(bytes / MB)} МБ`;
  const gb = bytes / GB;
  const text = gb < 10 ? gb.toFixed(1) : String(Math.round(gb));
  return `${text.replace('.', ',')} ГБ`;
}
