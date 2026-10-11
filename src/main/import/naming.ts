// Дата и название встречи из файла (решения Плана 5, §4.2).
import { defaultMeetingTitle } from '../library/naming';

/** Даты раньше этой — заведомо мусор (у MP4 без даты бывает 1904 или 1970 год). */
const EARLIEST = Date.UTC(2000, 0, 1);
/** Часы компьютера или телефона могут немного спешить. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE_CHARS = 200;

const plausible = (time: number, now: Date): boolean =>
  Number.isFinite(time) && time >= EARLIEST && time <= now.getTime() + FUTURE_SLACK_MS;

/**
 * Когда записан файл: creation_time из самого файла (его пишут телефон и Zoom), иначе время изменения файла, иначе
 * сейчас. Неправдоподобная дата (до 2000 года, в будущем) пропускается.
 */
export function pickRecordedAt(creationTime: string | null, modifiedAt: Date | null, now: Date): Date {
  const created = creationTime === null ? Number.NaN : Date.parse(creationTime);
  if (plausible(created, now)) return new Date(created);
  if (modifiedAt && plausible(modifiedAt.getTime(), now)) return new Date(modifiedAt.getTime());
  return new Date(now.getTime());
}

/** «Созвон с Ириной.mp4» → «Созвон с Ириной»; пустое — «Встреча ДД.ММ.ГГГГ ЧЧ:ММ» по дате записи. */
export function titleFromFileName(fileName: string, recordedAt: Date): string {
  const base = fileName.replace(/\.[^.]*$/, '').trim();
  // По символам, а не по UTF-16: эмодзи не режется пополам.
  const title = Array.from(base).slice(0, MAX_TITLE_CHARS).join('').trim();
  return title === '' ? defaultMeetingTitle(recordedAt) : title;
}
