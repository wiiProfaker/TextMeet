// Каталог «Модель для итогов» на вкладке настроек «ИИ» (решения Плана 9, §2.1): разделы карточек и подписи. Чистые
// функции — проверяются модульными тестами.
import { formatBytes, formatDownloadedGb, formatRemaining } from '../../shared/format';
import {
  LLM_MODEL_IDS,
  llmModel,
  RECOMMENDED_LLM_MODEL,
  type AiModelsState,
  type LlmModelId,
} from '../../shared/llm-models';
import type { CatalogDownload, ModelGroupState } from '../../shared/transcription';

export interface AiCatalogSections {
  selected: LlmModelId | null;
  /** Скачанные, кроме выбранной. */
  downloaded: LlmModelId[];
  /** Ещё не скачанные. */
  available: LlmModelId[];
}

/** Раскладка карточек: выбранная сверху, затем скачанные, затем те, что можно скачать, — по порядку каталога. */
export function aiCatalogSections(state: AiModelsState): AiCatalogSections {
  const installed = new Set(state.models.filter((m) => m.installed).map((m) => m.id));
  const rest = LLM_MODEL_IDS.filter((id) => id !== state.selected);
  return {
    selected: state.selected,
    downloaded: rest.filter((id) => installed.has(id)),
    available: rest.filter((id) => !installed.has(id)),
  };
}

export const aiModelState = (state: AiModelsState, id: LlmModelId): ModelGroupState =>
  state.models.find((m) => m.id === id) ?? { sizeBytes: 0, installed: false };

/** Пометка у названия: «Рекомендуется» или «оценка» — модель не замеряли, полоски примерные. */
export function aiModelTag(id: LlmModelId): { text: string; estimate: boolean } | null {
  if (id === RECOMMENDED_LLM_MODEL) return { text: 'Рекомендуется', estimate: false };
  return llmModel(id).measured ? null : { text: 'оценка', estimate: true };
}

/** Подпись скачивания: «2,7 из 6,0 ГБ · осталось около 4 мин». */
export function aiDownloadText(download: CatalogDownload): string {
  if (download.total <= 0) return 'Скачиваем…';
  const bytes = formatDownloadedGb(download.done, download.total);
  return download.remainingSec === null ? bytes : `${bytes} · ${formatRemaining(download.remainingSec)}`;
}

/** Размер на карточке: «5,3 ГБ», у скачанной — «скачана · 5,3 ГБ». */
export const aiSizeText = (state: ModelGroupState): string =>
  state.installed ? `скачана · ${formatBytes(state.sizeBytes)}` : formatBytes(state.sizeBytes);
