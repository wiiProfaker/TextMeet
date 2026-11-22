// Дата и название встречи из файла (решения Плана 5, §4.2).
import { defaultMeetingTitle } from '../library/naming';

/**
 * Даты раньше этой — заведомо мусор: у MP4 без даты бывает 1904 или 1970 год, а устройство со сброшенными часами
 * пишет 1 января 2000 года (или несколько минут после).
 */
const EARLIEST = Date.UTC(2000, 0, 2);
/** Часы компьютера или телефона могут немного спешить. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;
/** Как в проверке meeting.json. */
const MAX_TITLE_LENGTH = 200;

const plausible = (time: number, now: Date): boolean =>
  Number.isFinite(time) && time >= EARLIEST && time <= now.getTime() + FUTURE_SLACK_MS;

/**
 * Когда записан файл: creation_time из самого файла (его пишут телефон и Zoom), иначе время изменения файла, иначе
 * сейчас. Неправдоподобная дата (до 2 января 2000 года, в будущем) пропускается.
 */
export function pickRecordedAt(creationTime: string | null, modifiedAt: Date | null, now: Date): Date {
  const created = creationTime === null ? Number.NaN : Date.parse(creationTime);
  if (plausible(created, now)) return new Date(created);
  if (modifiedAt && plausible(modifiedAt.getTime(), now)) return new Date(modifiedAt.getTime());
  return new Date(now.getTime());
}

/**
 * Начало текста не длиннее max (длина — как её считают JavaScript и проверка meeting.json: в UTF-16). Режется между
 * символами: эмодзи не разрывается пополам.
 */
export function fitLength(text: string, max: number): string {
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out;
}

/** Расширение файла: после последней точки 1–5 букв и цифр, среди них хоть одна буква («.m4a», «.mp3»; не «.05»). */
const EXTENSION = /\.([\p{L}\d]{1,5})$/u;
/** Пробелы и невидимые знаки (\p{Cf}: нулевой ширины и т. п.) по краям названия. */
const EDGES = /^[\s\p{Cf}]+|[\s\p{Cf}]+$/gu;

/**
 * «Созвон с Ириной.mp4» → «Созвон с Ириной»; «Встреча 2026.10.05» — точки не расширение, название целиком; пустое или
 * из одних невидимых знаков — «Встреча ДД.ММ.ГГГГ ЧЧ:ММ» по дате записи.
 */
export function titleFromFileName(fileName: string, recordedAt: Date): string {
  const name = fileName.trim();
  const extension = EXTENSION.exec(name);
  const base = extension && /\p{L}/u.test(extension[1]!) ? name.slice(0, extension.index) : name;
  const title = fitLength(base.replace(EDGES, ''), MAX_TITLE_LENGTH).replace(EDGES, '');
  return title === '' ? defaultMeetingTitle(recordedAt) : title;
}
