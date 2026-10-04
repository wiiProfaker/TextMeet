// Каталог моделей в настройках (решения Плана 7, §2): разделы карточек и подписи. Чистые функции — проверяются
// модульными тестами.
import { ASR_MODELS, asrModel, speedLevel, type AsrModelId, type AsrModelInfo } from '../../shared/asr-models';
import { formatDownloaded, formatMegabytes } from '../../shared/format';
import type { ModelGroupState, ModelsState } from '../../shared/transcription';

export interface CatalogSections {
  selected: AsrModelId;
  /** Скачанные, кроме выбранной. */
  downloaded: AsrModelId[];
  /** Не скачанные, понимают русский. */
  russian: AsrModelId[];
  /** Не скачанные, только английский. */
  english: AsrModelId[];
}

/** Раскладка карточек: выбранная сверху, затем скачанные, затем доступные для загрузки по группам. */
export function catalogSections(state: ModelsState): CatalogSections {
  const installed = new Set(state.models.filter((m) => m.installed).map((m) => m.id));
  const rest = ASR_MODELS.filter((m) => m.id !== state.selected);
  const available = (group: AsrModelInfo['group']): AsrModelId[] =>
    rest.filter((m) => m.group === group && !installed.has(m.id)).map((m) => m.id);
  return {
    selected: state.selected,
    downloaded: rest.filter((m) => installed.has(m.id)).map((m) => m.id),
    russian: available('ru'),
    english: available('en'),
  };
}

export const modelState = (state: ModelsState, id: AsrModelId): ModelGroupState =>
  state.models.find((m) => m.id === id) ?? { sizeBytes: 0, installed: false };

/** Полоски карточки: точность и скорость, 1–5. */
export function modelBars(id: AsrModelId): { accuracy: number; speed: number } {
  const info = asrModel(id);
  return { accuracy: info.accuracy, speed: speedLevel(info.rtf) };
}

/** Строка модели в окне «Расшифровать»: название и что будет, если её выбрать. */
export function modelChoiceLabel(state: ModelsState, id: AsrModelId): string {
  const info = asrModel(id);
  const { installed, sizeBytes } = modelState(state, id);
  const parts = [info.title];
  if (info.group === 'en') parts.push('только английский');
  if (!installed) parts.push(`скачается, ${formatMegabytes(sizeBytes)}`);
  return parts.join(' — ');
}

/** Кнопка скачивания: после сбоя — «Повторить»; имя для экранного диктора начинается с того же слова, что видно. */
export function downloadButton(title: string, failed: boolean): { text: string; label: string } {
  const text = failed ? 'Повторить' : 'Скачать';
  return { text, label: `${text}: ${title}` };
}

/** Подпись скачивания в карточке. */
export const downloadText = (done: number, total: number): string =>
  total > 0 ? `Скачиваем — ${formatDownloaded(done, total)}` : 'Скачиваем…';
