// Тексты и форматы расшифровки для окна (чистые функции — проверяются модульными тестами).
import { formatDownloaded } from '../../shared/format';
import type { MeetingStatus } from '../../shared/meeting';
import type { TranscriptionProgress } from '../../shared/transcription';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Время реплики: «1:05», «12:04», «1:02:05». */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Доля → целые проценты 0–100 (и для NaN — 0). */
export const percent = (fraction: number): number =>
  Number.isNaN(fraction) ? 0 : Math.round(Math.min(1, Math.max(0, fraction)) * 100);

/** Этап расшифровки для блока во встрече. */
export function stageText(progress: TranscriptionProgress): string {
  switch (progress.stage) {
    case 'queued':
      return 'В очереди на расшифровку';
    case 'download':
      if (!progress.download) return 'Скачиваем модель расшифровки';
      // Байтов нет — модель проверяется по суммам или ждёт, пока скачается другая.
      if (progress.download.total === 0) return `Готовим модель ${progress.download.title}`;
      return `Скачиваем модель ${progress.download.title} — ${formatDownloaded(progress.download.done, progress.download.total)}`;
    case 'prepare':
      return 'Готовим звук';
    case 'me':
      return 'Расшифровываем вашу речь';
    case 'diarize':
      return 'Разделяем собеседников по голосам';
    case 'others':
      return 'Расшифровываем собеседников';
  }
}

/** Доля для полоски: у скачивания — байты, у остального — вся работа по встрече. */
export function barFraction(progress: TranscriptionProgress): number {
  if (progress.stage === 'download' && progress.download && progress.download.total > 0) {
    return progress.download.done / progress.download.total;
  }
  return progress.fraction;
}

export interface ProgressView {
  /** Этап (его объявляет экранный диктор). */
  text: string;
  /** Проценты для полоски; null — полоски нет. */
  value: number | null;
  /** Строка под этапом: проценты или когда начнётся. */
  note: string | null;
}

const QUEUED_VIEW: ProgressView = {
  text: 'В очереди на расшифровку',
  value: 0,
  note: 'Начнётся, когда закончатся встречи перед ней.',
};

/**
 * Что показать о встрече в очереди или в работе. Хода от main может не быть: встреча только что поставлена в очередь
 * или работа уже закончилась, а статус встречи в окне ещё прежний — тогда «в очереди» было бы неправдой.
 */
export function progressView(status: 'queued' | 'transcribing', progress: TranscriptionProgress | null): ProgressView {
  if (progress === null) return status === 'queued' ? QUEUED_VIEW : { text: 'Расшифровываем…', value: null, note: null };
  if (progress.stage === 'queued') return QUEUED_VIEW;
  const value = percent(barFraction(progress));
  return { text: stageText(progress), value, note: `${value}%` };
}

export interface TranscribeActions {
  /** Кнопка в заголовке встречи; null — её нет. */
  header: 'Расшифровать' | 'Расшифровать заново' | null;
  /** «Расшифровать» под «Текста пока нет» — только когда в заголовке кнопки нет: две одинаковые ни к чему. */
  body: boolean;
}

/**
 * Какие кнопки расшифровки показать во встрече. «Заново» — если текст уже есть или встреча в очереди/в работе:
 * нажатие тогда перезапускает работу. Пока текст читается, кнопок нет — неизвестно, «заново» или нет.
 * text — что с текстом встречи (как TranscriptLoad['kind'] в hooks.ts).
 */
export function transcribeActions(
  status: MeetingStatus,
  hasAudio: boolean,
  text: 'loading' | 'none' | 'ready' | 'error',
): TranscribeActions {
  if (!hasAudio || text === 'loading') return { header: null, body: false };
  if (status === 'queued' || status === 'transcribing') return { header: 'Расшифровать заново', body: false };
  // После ошибки тоже: так можно указать другое число участников («Повторить» в плашке — с прежним).
  if (status === 'done' || status === 'error') {
    return { header: text === 'ready' ? 'Расшифровать заново' : 'Расшифровать', body: false };
  }
  return { header: null, body: text === 'none' };
}

/** Цвет спикера: «Я» — sp0, собеседники — sp1…sp4 по кругу. */
export function speakerTone(id: string): string {
  if (id === 'me') return 'sp0';
  const n = Number(/^s(\d+)$/.exec(id)?.[1] ?? 1);
  return `sp${((n - 1) % 4) + 1}`;
}
