// Что окно видит в каталоге моделей: модели расшифровки по порядку, общие модели голосов, выбор, скачивание.
import { ASR_MODEL_IDS, type AsrModelId } from '../../shared/asr-models';
import type { ModelGroupState, ModelsState } from '../../shared/transcription';
import { groupSize, type ModelGroupId } from './registry';

/** Скачивание из каталога глазами окна: что качается и чем кончилась последняя неудача. */
export interface CatalogDownloadsSnapshot {
  download: ModelsState['download'];
  downloadError: ModelsState['downloadError'];
}

export function buildModelsState(
  groups: readonly (ModelGroupState & { id: ModelGroupId })[],
  selected: AsrModelId,
  downloads: CatalogDownloadsSnapshot,
  busy: boolean,
): ModelsState {
  // Группы, которых нет в ответе хранилища, — не скачаны (размер — из реестра).
  const stateOf = (id: ModelGroupId): ModelGroupState =>
    groups.find((g) => g.id === id) ?? { sizeBytes: groupSize(id), installed: false };
  const plain = (state: ModelGroupState): ModelGroupState => ({ sizeBytes: state.sizeBytes, installed: state.installed });
  return {
    selected,
    models: ASR_MODEL_IDS.map((id) => ({ id, ...plain(stateOf(id)) })),
    voices: plain(stateOf('voices')),
    download: downloads.download,
    // Модель всё же скачалась (например, расшифровкой) — прежняя неудача её карточке больше не нужна.
    downloadError:
      downloads.downloadError && !stateOf(downloads.downloadError.id).installed ? downloads.downloadError : null,
    busy,
  };
}
