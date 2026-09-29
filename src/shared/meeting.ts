import { z } from 'zod';

/** Имя папки встречи = её id: дата и время создания (местные) + 6 случайных hex-символов. */
export const MEETING_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}_[0-9a-f]{6}$/;

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
export const MeetingStatusSchema = z.enum(['recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);
export const TrackKindSchema = z.enum(['mic', 'system']);

/** Дорожка записи: файл в папке audio/ и сдвиг её начала от начала самой ранней дорожки. */
export const TrackSchema = z.object({
  kind: TrackKindSchema,
  file: z.string().regex(/^[a-z0-9-]+\.[a-z0-9]+$/),
  startOffsetMs: z.number().int().nonnegative(),
});

// Новые поля добавляются с .default(...) — иначе все уже записанные встречи станут «повреждёнными».
// looseObject: незнакомые поля (их может записать более новая версия программы — библиотека бывает общей
// через OneDrive) не отбрасываются, а сохраняются при перезаписи файла.
export const MeetingSchema = z.looseObject({
  schemaVersion: z.literal(1),
  id: MeetingIdSchema,
  title: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(),
  durationSec: z.number().nonnegative().nullable(),
  source: MeetingSourceSchema,
  /** Сколько человек было на встрече, включая владельца; null — не указано. */
  participantsHint: z.number().int().min(1).max(50).nullable(),
  /** Модель расшифровки; null — ещё не расшифровывалась. */
  model: z.string().min(1).nullable(),
  status: MeetingStatusSchema,
  errorMessage: z.string().nullable(),
  /** Переименованные спикеры: id спикера → имя. */
  speakerNames: z.record(z.string(), z.string().trim().min(1).max(100)),
  tracks: z.array(TrackSchema).default([]),
  /** Запись прервалась (сбой программы или окна записи) и была восстановлена. */
  recovered: z.boolean().default(false),
});

export type Meeting = z.infer<typeof MeetingSchema>;
export type MeetingSource = z.infer<typeof MeetingSourceSchema>;
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;
export type TrackKind = z.infer<typeof TrackKindSchema>;
export type Track = z.infer<typeof TrackSchema>;

export type MeetingListEntry =
  | {
      kind: 'ok';
      meeting: Meeting;
      /** Готово ли сведение для прослушивания (audio/mix.opus). */
      mixReady: boolean;
      /** Сведение в этом запуске программы не удалось: ждать «Готовим…» бесполезно. */
      mixFailed: boolean;
    }
  /** Папка есть, meeting.json ещё нет: встреча только что создаётся (или создание прервалось). */
  | { kind: 'creating'; id: string }
  | { kind: 'broken'; id: string; reason: string };

export const entryId = (entry: MeetingListEntry): string => (entry.kind === 'ok' ? entry.meeting.id : entry.id);
