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

export const percent = (fraction: number): number => Math.round(Math.min(1, Math.max(0, fraction)) * 100);

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

/** Цвет спикера: «Я» — sp0, собеседники — sp1…sp4 по кругу. */
export function speakerTone(id: string): string {
  if (id === 'me') return 'sp0';
  const n = Number(/^s(\d+)$/.exec(id)?.[1] ?? 1);
  return `sp${((n - 1) % 4) + 1}`;
}
