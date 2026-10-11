import type { LaunchAtLoginNotice } from '../../shared/ipc';
import { entryId, type Meeting, type MeetingListEntry } from '../../shared/meeting';
import { formatBytes, formatDurationShort, MONTHS_GENITIVE } from '../../shared/format';
import type { TranscriptionProgress } from '../../shared/transcription';
import { percent } from './transcription-format';

const pad = (n: number): string => String(n).padStart(2, '0');

/** 75 → «1:15», 3725 → «1:02:05», неизвестно → «—». Для таймера и плеера. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Таймер записи: всегда с часами — «00:23:41». */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** «42 мин 15 с», «1 ч 02 мин 05 с», «15 с» — для окна «Запись остановлена». */
export function formatDurationWithSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} ч ${pad(m)} мин ${pad(s)} с`;
  if (m > 0) return `${m} мин ${pad(s)} с`;
  return `${s} с`;
}

/** Время дня «14:30» по ISO-дате (местное). */
export function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 1 участник, 2 участника, 5 участников, 21 участник. */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «Другое» число участников: целое от 1 до 50; иначе null. */
export function parseParticipants(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= 50 ? n : null;
}

export function participantsText(n: number): string {
  return `${n} ${pluralize(n, 'участник', 'участника', 'участников')}`;
}

/** Местная дата встречи: из createdAt, а для «создаётся»/«не удалось прочитать» — из имени папки. */
function entryDate(entry: MeetingListEntry): Date | null {
  if (entry.kind === 'ok') {
    const d = new Date(entry.meeting.createdAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})_/.exec(entryId(entry));
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi);
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** «Сегодня», «Вчера», «25 сентября», «25 сентября 2025». */
export function dayLabel(date: Date, now: Date): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Сегодня';
  if (dayKey(date) === dayKey(yesterday)) return 'Вчера';
  const base = `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Встреча в найденном: «вчера, 16:20 · 2 совпадения»; совпало только название — без числа. */
export function searchMeetingMeta(createdAt: string, total: number, now: Date): string {
  const date = new Date(createdAt);
  const day = dayLabel(date, now);
  const when = `${day === 'Сегодня' || day === 'Вчера' ? day.toLowerCase() : day}, ${formatTimeOfDay(createdAt)}`;
  if (total === 0) return when;
  return `${when} · ${total} ${pluralize(total, 'совпадение', 'совпадения', 'совпадений')}`;
}

/** «Найдено в 1 встрече», «Найдено в 3 встречах»; truncated — показаны не все. */
export function searchFoundText(meetings: number, truncated: boolean): string {
  if (meetings === 0) return 'Ничего не найдено';
  const place = meetings % 10 === 1 && meetings % 100 !== 11 ? 'встрече' : 'встречах';
  return `Найдено в ${truncated ? 'первых ' : ''}${meetings} ${place}`;
}

export interface DayGroup {
  label: string;
  entries: MeetingListEntry[];
}

/** Встречи по дням в том порядке, в каком пришли (новые сверху). */
export function groupByDay(entries: readonly MeetingListEntry[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const date = entryDate(entry);
    const label = date ? dayLabel(date, now) : 'Без даты';
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export type NoteTone = 'accent' | 'warn' | 'error' | 'live';

export interface MeetingNote {
  text: string;
  tone: NoteTone;
}

/**
 * Пометка встречи в списке — только если есть о чём сказать. У готовой встречи пометки нет.
 * progress — ход расшифровки этой встречи (если она сейчас расшифровывается).
 */
export function meetingNote(meeting: Meeting, progress?: TranscriptionProgress): MeetingNote | null {
  switch (meeting.status) {
    case 'importing':
      return { text: 'импорт…', tone: 'accent' };
    case 'recording':
      return { text: 'идёт запись', tone: 'live' };
    case 'recorded':
      return meeting.recovered
        ? { text: 'восстановлена после сбоя', tone: 'warn' }
        : { text: 'записано', tone: 'accent' };
    case 'queued':
      return { text: 'в очереди на расшифровку', tone: 'accent' };
    case 'transcribing':
      if (progress?.stage === 'download') {
        // Байтов нет — модель проверяется или ждёт другого скачивания.
        return { text: progress.download?.total === 0 ? 'готовим модель…' : 'скачиваем модель…', tone: 'accent' };
      }
      return progress
        ? { text: `расшифровка ${percent(progress.fraction)}%`, tone: 'accent' }
        : { text: 'расшифровка…', tone: 'accent' };
    case 'error':
      // С дорожками ошибка — у расшифровки (запись сохранилась); без них — у самой записи.
      return { text: meeting.tracks.length > 0 ? 'ошибка расшифровки' : 'ошибка', tone: 'error' };
    case 'done':
      return null;
  }
}

/** Текст окна «Удалить аудио?»: «Запись (32 мин, 15 МБ) переместится в Корзину…»; размер — когда узнали. */
export function deleteAudioText(durationSec: number | null, bytes: number | null): string {
  const parts: string[] = [];
  if (durationSec !== null && durationSec >= 0) parts.push(formatDurationShort(durationSec));
  // 0 — папки с записью нет или она пуста: размер не называем.
  if (bytes !== null && bytes > 0) parts.push(bytes < 1024 * 1024 ? 'меньше 1 МБ' : formatBytes(bytes));
  const what = parts.length > 0 ? `Запись (${parts.join(', ')})` : 'Запись';
  return `${what} переместится в Корзину. Текст встречи останется, но слушать запись и расшифровывать её заново будет нельзя.`;
}

/** Убирает приставку «По умолчанию — » / «Default - » из названия устройства. */
export function cleanDeviceLabel(label: string): string {
  return label.replace(/^(default|по умолчанию|communications|связь)\s*[-–—]\s*/i, '').trim();
}

/** Клавиши комбинации для показа по отдельности: «Ctrl+Space» → [Ctrl, Space]; «⌃⌥ R» → [⌃, ⌥, R]. */
export function hotkeyKeys(label: string, platform: string): string[] {
  if (platform !== 'darwin') return label.split('+').filter(Boolean);
  const [symbols = '', ...rest] = label.split(' ');
  return rest.length === 0 ? [symbols] : [...symbols, rest.join(' ')];
}

const NOTICE_TEXT: Record<LaunchAtLoginNotice, string | null> = {
  none: null,
  'dev-build': 'Автозапуск работает только в установленной программе — сейчас открыта версия для разработки.',
  'needs-approval': 'macOS ждёт разрешения: Системные настройки → Основные → Объекты входа → включите TextMeet.',
  'blocked-by-system':
    'Автозапуск выключен в системе. Windows: Диспетчер задач → Автозагрузка. macOS: Системные настройки → Основные → Объекты входа.',
  unsupported: 'На этой системе автозапуск не поддерживается.',
};

export function launchAtLoginNoticeText(notice: LaunchAtLoginNotice): string | null {
  return NOTICE_TEXT[notice];
}
