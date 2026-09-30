// Тексты и форматы расшифровки для окна (чистые функции — проверяются модульными тестами).
import { formatBytes } from '../../shared/format';
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
      return progress.download
        ? `Скачиваем модель расшифровки — ${formatBytes(progress.download.done)} из ${formatBytes(progress.download.total)}`
        : 'Скачиваем модель расшифровки';
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

/** Цвет спикера: «Я» — sp0, собеседники — sp1…sp4 по кругу. */
export function speakerTone(id: string): string {
  if (id === 'me') return 'sp0';
  const n = Number(/^s(\d+)$/.exec(id)?.[1] ?? 1);
  return `sp${((n - 1) % 4) + 1}`;
}
