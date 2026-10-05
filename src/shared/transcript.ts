import { z } from 'zod';
import { asrModel, isAsrModelId } from './asr-models';

/** Спикер: «me» — владелец (дорожка микрофона), «s1», «s2»… — собеседники по порядку первого появления. */
export const SpeakerIdSchema = z.string().regex(/^(me|s[1-9]\d{0,2})$/);

// looseObject у реплик и спикеров: поля более новой версии программы не теряются при правке текста.
export const TranscriptSegmentSchema = z.looseObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** Секунды от начала встречи (начала самой ранней дорожки) — то же начало, что у mix.opus. */
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speakerId: SpeakerIdSchema,
  text: z.string().max(20_000),
  /** Текст или спикера реплики правили руками. */
  edited: z.boolean().default(false),
});

export const TranscriptSpeakerSchema = z.looseObject({ id: SpeakerIdSchema, kind: z.enum(['me', 'other']) });

// looseObject: как у meeting.json — поля более новой версии программы не теряются при перезаписи.
export const TranscriptSchema = z.looseObject({
  schemaVersion: z.literal(1),
  model: z.string().min(1),
  /** Название модели на момент расшифровки — для подписи во встрече (План 7); у текстов Плана 3 его нет. */
  modelTitle: z.string().min(1).max(200).optional(),
  createdAt: z.iso.datetime(),
  /** Последняя ручная правка (текст, удаление реплики, спикеры); нет — текст не правили. */
  editedAt: z.iso.datetime().optional(),
  speakers: z.array(TranscriptSpeakerSchema),
  segments: z.array(TranscriptSegmentSchema),
});

export type SpeakerId = z.infer<typeof SpeakerIdSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type TranscriptSpeaker = z.infer<typeof TranscriptSpeakerSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const ME: SpeakerId = 'me';

/** Подпись «Текст: …» во встрече: название из текста, иначе — по каталогу, неизвестная модель — её id. */
export function transcriptModelTitle(transcript: Pick<Transcript, 'model' | 'modelTitle'>): string {
  if (transcript.modelTitle) return transcript.modelTitle;
  return isAsrModelId(transcript.model) ? asrModel(transcript.model).title : transcript.model;
}

/** Номер собеседника → id: 0 → «s1». */
export const otherSpeakerId = (index: number): SpeakerId => `s${index + 1}`;

/** Подпись спикера: имя из meeting.json, иначе «Я» / «Спикер N». */
export function speakerLabel(id: string, names: Readonly<Record<string, string>> = {}): string {
  const name = names[id];
  if (name) return name;
  if (id === ME) return 'Я';
  const match = /^s(\d+)$/.exec(id);
  return match ? `Спикер ${match[1]}` : id;
}
