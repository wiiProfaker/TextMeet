import { z } from 'zod';

/** Имя папки встречи = её id: дата и время создания (местные) + 6 случайных hex-символов. */
export const MEETING_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}_[0-9a-f]{6}$/;

export const MeetingIdSchema = z.string().regex(MEETING_ID_PATTERN);
export const MeetingSourceSchema = z.enum(['recording', 'import']);
export const MeetingStatusSchema = z.enum(['recording', 'recorded', 'queued', 'transcribing', 'done', 'error']);

export const MeetingSchema = z.object({
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
});

export type Meeting = z.infer<typeof MeetingSchema>;
export type MeetingSource = z.infer<typeof MeetingSourceSchema>;
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export type MeetingListEntry = { kind: 'ok'; meeting: Meeting } | { kind: 'broken'; id: string; reason: string };
