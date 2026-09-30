// Расшифровка: что main сообщает окну. Только типы и константы — файл подключает и preload.

/** Этап расшифровки встречи, как его видит человек. */
export type TranscriptionStage = 'queued' | 'download' | 'prepare' | 'me' | 'diarize' | 'others';

export interface TranscriptionProgress {
  meetingId: string;
  stage: TranscriptionStage;
  /** Доля всей работы по встрече, 0…1 (скачивание моделей не входит — у него свои байты). */
  fraction: number;
  /** Этап «download»: сколько байт моделей скачано из скольких. */
  download: { done: number; total: number } | null;
}

export type ModelGroupId = 'gigaam' | 'voices';

export interface ModelGroupState {
  id: ModelGroupId;
  title: string;
  sizeBytes: number;
  /** Все файлы группы на месте и проверены. */
  installed: boolean;
}

export interface ModelsState {
  groups: ModelGroupState[];
  /** Идёт расшифровка — удалять модели нельзя. */
  busy: boolean;
}

/** «Расшифровать», «Расшифровать заново», «Повторить»: число участников, включая владельца; null — определить самим. */
export interface TranscribeRequest {
  meetingId: string;
  participantsHint: number | null;
}
