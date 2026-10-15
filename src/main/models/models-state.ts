// Что окно видит в каталогах моделей: расшифровки (модели по порядку, общие модели голосов, выбор, скачивание) и
// для итогов (вкладка «ИИ»).
import { ASR_MODEL_IDS, isAsrModelId, type AsrModelId } from '../../shared/asr-models';
import { isLlmModelId, LLM_MODEL_IDS, type AiModelsState, type LlmModelId } from '../../shared/llm-models';
import type { CatalogDownload, CatalogModelId, ModelGroupState, ModelsState } from '../../shared/transcription';
import { groupSize, type ModelGroupId } from './registry';

/** Скачивание из каталогов глазами окна: что качается и чем кончилась последняя неудача. */
export interface CatalogDownloadsSnapshot {
  download: CatalogDownload | null;
  downloadError: { id: CatalogModelId; message: string } | null;
}

type Groups = readonly (ModelGroupState & { id: ModelGroupId })[];

/** Группы, которых нет в ответе хранилища, — не скачаны (размер — из реестра). */
const stateOf = (groups: Groups, id: ModelGroupId): ModelGroupState => {
  const found = groups.find((g) => g.id === id);
  return found ? { sizeBytes: found.sizeBytes, installed: found.installed } : { sizeBytes: groupSize(id), installed: false };
};

/** Неудача скачивания — для карточки своего каталога, пока модель так и не скачана. */
function failureOf<T extends CatalogModelId>(
  groups: Groups,
  downloads: CatalogDownloadsSnapshot,
  ofCatalog: (id: CatalogModelId) => id is T,
): { id: T; message: string } | null {
  const error = downloads.downloadError;
  if (!error || !ofCatalog(error.id) || stateOf(groups, error.id).installed) return null;
  return { id: error.id, message: error.message };
}

export function buildModelsState(
  groups: Groups,
  selected: AsrModelId,
  downloads: CatalogDownloadsSnapshot,
  busy: boolean,
): ModelsState {
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    voices: stateOf(groups, 'voices'),
    download: downloads.download,
    // Модель всё же скачалась (например, расшифровкой) — прежняя неудача её карточке больше не нужна.
    downloadError: failureOf(groups, downloads, isAsrModelId),
    busy,
  };
}

/** Каталог «Модель для итогов»; selected — уже с учётом скачанных (effectiveAiModel). */
export function buildAiModelsState(
  groups: Groups,
  selected: LlmModelId | null,
  downloads: CatalogDownloadsSnapshot,
): AiModelsState {
  return {
    selected,
    models: LLM_MODEL_IDS.map((id) => ({ id, ...stateOf(groups, id) })),
    download: downloads.download,
    downloadError: failureOf(groups, downloads, isLlmModelId),
  };
}
