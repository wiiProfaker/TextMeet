// Расшифровка: что main сообщает окну. Только типы и константы — файл подключает и preload.
import type { AsrModelId } from './asr-models';

/** Этап расшифровки встречи, как его видит человек. */
export type TranscriptionStage = 'queued' | 'download' | 'prepare' | 'me' | 'diarize' | 'others';

export interface TranscriptionProgress {
  meetingId: string;
  stage: TranscriptionStage;
  /** Доля всей работы по встрече, 0…1 (скачивание моделей не входит — у него свои байты). */
  fraction: number;
  /** Этап «download»: сколько байт моделей скачано из скольких; title — модель расшифровки этой встречи. */
  download: { done: number; total: number; title: string } | null;
}

/** Группа файлов моделей: модель расшифровки или общая — «разделение по голосам и поиск речи». */
export type ModelGroupId = AsrModelId | 'voices';

export interface ModelGroupState {
  sizeBytes: number;
  /** Все файлы группы на месте и проверены. */
  installed: boolean;
}

/** Скачивание из каталога (кнопка «Скачать» в карточке модели). */
export interface CatalogDownload {
  id: AsrModelId;
  done: number;
  total: number;
}

export interface ModelsState {
  /** Модель из настроек — для новых встреч. */
  selected: AsrModelId;
  /** Модели расшифровки в порядке каталога. */
  models: (ModelGroupState & { id: AsrModelId })[];
  /** Разделение по голосам и поиск речи — общие для всех моделей. */
  voices: ModelGroupState;
  /** Идёт скачивание из каталога. */
  download: CatalogDownload | null;
  /** Последнее скачивание из каталога не удалось — причина для человека. */
  downloadError: { id: AsrModelId; message: string } | null;
  /** Идёт расшифровка — удалять модели нельзя. */
  busy: boolean;
}

/**
 * «Расшифровать», «Расшифровать заново», «Повторить»: число участников, включая владельца (null — определить самим),
 * и модель (null — из настроек).
 */
export interface TranscribeRequest {
  meetingId: string;
  participantsHint: number | null;
  model: AsrModelId | null;
}
