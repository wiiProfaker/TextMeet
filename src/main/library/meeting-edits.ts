// Правки встречи из окна: название, имена спикеров, текст. Всё пишется по очереди с другими изменениями встречи.
import { z } from 'zod';
import type { Meeting } from '../../shared/meeting';
import { ME, SpeakerIdSchema, TranscriptSegmentSchema, type SpeakerId, type Transcript } from '../../shared/transcript';
import { applyEdit, type TranscriptEdit } from '../../shared/transcript-edit';
import { readMeeting, updateMeeting } from './library';
import { updateTranscript } from './transcript-store';

export const meetingEditTexts = {
  emptyTitle: 'Название не может быть пустым.',
  transcribing: 'Сейчас идёт расшифровка заново — править текст можно после неё.',
} as const;

/** Правка из окна — проверяется на входе в main. */
export const TranscriptEditSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), segmentId: z.string().min(1).max(40), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('restore'), segment: TranscriptSegmentSchema }),
  z.object({
    kind: z.literal('speaker'),
    segmentId: z.string().min(1).max(40),
    speakerId: z.union([SpeakerIdSchema, z.literal('new')]),
  }),
  z.object({ kind: z.literal('merge'), from: SpeakerIdSchema, into: SpeakerIdSchema }),
]);

export async function renameMeeting(libraryDir: string, meetingId: string, title: string): Promise<Meeting> {
  const next = title.trim();
  if (next === '') throw new Error(meetingEditTexts.emptyTitle);
  return updateMeeting(libraryDir, meetingId, (m) => ({ ...m, title: next }));
}

/** Имя спикера во всей встрече; пустое или null — вернуть «Спикер N» / «Я». */
export function renameSpeaker(
  libraryDir: string,
  meetingId: string,
  speakerId: SpeakerId,
  name: string | null,
): Promise<Meeting> {
  const next = name?.trim() ?? '';
  return updateMeeting(libraryDir, meetingId, (m) => {
    const { [speakerId]: _old, ...rest } = m.speakerNames;
    return { ...m, speakerNames: next === '' ? rest : { ...rest, [speakerId]: next } };
  });
}

/** Имена спикеров, которых в тексте больше нет, забываются: иначе новый собеседник с тем же номером получил бы чужое имя. */
function namesOfPresent(names: Readonly<Record<string, string>>, transcript: Transcript): Record<string, string> | null {
  const present = new Set<string>([ME, ...transcript.speakers.map((s) => s.id)]);
  const kept = Object.fromEntries(Object.entries(names).filter(([id]) => present.has(id)));
  return Object.keys(kept).length === Object.keys(names).length ? null : kept;
}

/**
 * Правка текста. Пока встреча ждёт расшифровки заново или расшифровывается, правка всё равно пропала бы —
 * отказываем. Ответ — встреча, новый текст и поменялась ли встреча (забыты имена спикеров без реплик).
 */
export async function editTranscript(
  libraryDir: string,
  meetingId: string,
  edit: TranscriptEdit,
  now: Date,
): Promise<{ meeting: Meeting; transcript: Transcript; meetingChanged: boolean }> {
  const before = await readMeeting(libraryDir, meetingId);
  if (before.status === 'queued' || before.status === 'transcribing') throw new Error(meetingEditTexts.transcribing);
  const transcript = await updateTranscript(libraryDir, meetingId, (t) => applyEdit(t, edit, now));
  if (!namesOfPresent(before.speakerNames, transcript)) return { meeting: before, transcript, meetingChanged: false };
  const meeting = await updateMeeting(libraryDir, meetingId, (m) => ({
    ...m,
    speakerNames: namesOfPresent(m.speakerNames, transcript) ?? m.speakerNames,
  }));
  return { meeting, transcript, meetingChanged: true };
}
