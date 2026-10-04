// Ручные правки текста встречи — чистые функции. main применяет их к только что прочитанному transcript.json
// (по очереди с записью расшифровки), окно — чтобы заранее узнать, не объединение ли это.
import { normalize } from './search-text';
import {
  ME,
  speakerLabel,
  type SpeakerId,
  type Transcript,
  type TranscriptSegment,
  type TranscriptSpeaker,
} from './transcript';

export type TranscriptEdit =
  /** Новый текст реплики; пустой — удалить реплику. */
  | { kind: 'text'; segmentId: string; text: string }
  /** «Вернуть» удалённую реплику. */
  | { kind: 'restore'; segment: TranscriptSegment }
  /** Кто говорит в реплике; 'new' — новый собеседник. */
  | { kind: 'speaker'; segmentId: string; speakerId: SpeakerId | 'new' }
  /** Все реплики from становятся репликами into. */
  | { kind: 'merge'; from: SpeakerId; into: SpeakerId };

export const editTexts = {
  /** Правка сделана к другому тексту: id реплик позиционные («seg-3»), после новой расшифровки они совпадают с прежними. */
  transcriptChanged: 'Текст встречи изменился — правка не сохранена. Текст перечитан.',
  segmentGone: 'Реплика не найдена — текст встречи изменился. Правка не сохранена.',
  speakerGone: 'Такого спикера во встрече уже нет — текст встречи изменился.',
  tooManySpeakers: 'Во встрече слишком много спикеров.',
} as const;

/** Отказ из-за того, что текст встречи уже другой: окно должно перечитать текст. */
export const isStaleEditMessage = (message: string): boolean =>
  [editTexts.transcriptChanged, editTexts.segmentGone, editTexts.speakerGone].some((text) => message.includes(text));

/** Наибольший номер собеседника: s999 (так в схеме). */
const MAX_OTHER = 999;

/** Следующий свободный номер собеседника: после s1, s3 — s4. */
export function nextSpeakerId(transcript: Pick<Transcript, 'speakers' | 'segments'>): SpeakerId {
  const ids = [...transcript.speakers.map((s) => s.id), ...transcript.segments.map((s) => s.speakerId)];
  const max = Math.max(0, ...ids.map((id) => Number(/^s(\d+)$/.exec(id)?.[1] ?? 0)));
  if (max >= MAX_OTHER) throw new Error(editTexts.tooManySpeakers);
  return `s${max + 1}`;
}

const speakerOf = (id: SpeakerId): TranscriptSpeaker => ({ id, kind: id === ME ? 'me' : 'other' });

/**
 * Спикеры = те, у кого есть реплики: прежние в прежнем порядке, недостающие — в конце.
 * Спикер без единой реплики из строки «Спикеры» исчезает.
 */
export function pruneSpeakers(speakers: readonly TranscriptSpeaker[], segments: readonly TranscriptSegment[]): TranscriptSpeaker[] {
  const used = new Set(segments.map((s) => s.speakerId));
  const kept = speakers.filter((s) => used.has(s.id));
  const known = new Set(kept.map((s) => s.id));
  for (const segment of segments) {
    if (known.has(segment.speakerId)) continue;
    known.add(segment.speakerId);
    kept.push(speakerOf(segment.speakerId));
  }
  return kept;
}

function findSegment(transcript: Transcript, segmentId: string): TranscriptSegment {
  const segment = transcript.segments.find((s) => s.id === segmentId);
  if (!segment) throw new Error(editTexts.segmentGone);
  return segment;
}

function requireSpeaker(transcript: Transcript, id: SpeakerId): void {
  if (!transcript.speakers.some((s) => s.id === id)) throw new Error(editTexts.speakerGone);
}

function changed(transcript: Transcript, segments: TranscriptSegment[], now: Date, extra: TranscriptSpeaker[] = []): Transcript {
  return {
    ...transcript,
    editedAt: now.toISOString(),
    speakers: pruneSpeakers([...transcript.speakers, ...extra], segments),
    segments,
  };
}

function editText(transcript: Transcript, segmentId: string, text: string, now: Date): Transcript {
  const segment = findSegment(transcript, segmentId);
  const next = text.trim();
  if (next === '') return changed(transcript, transcript.segments.filter((s) => s.id !== segmentId), now);
  if (next === segment.text) return transcript;
  const segments = transcript.segments.map((s) => (s.id === segmentId ? { ...s, text: next, edited: true } : s));
  return changed(transcript, segments, now);
}

/** Вставить на место по времени начала; реплика с таким id уже есть — ничего не делать. */
function restore(transcript: Transcript, segment: TranscriptSegment, now: Date): Transcript {
  if (transcript.segments.some((s) => s.id === segment.id)) return transcript;
  const at = transcript.segments.findIndex((s) => s.start > segment.start);
  const segments = [...transcript.segments];
  segments.splice(at === -1 ? segments.length : at, 0, segment);
  return changed(transcript, segments, now);
}

function changeSpeaker(transcript: Transcript, segmentId: string, target: SpeakerId | 'new', now: Date): Transcript {
  const segment = findSegment(transcript, segmentId);
  const speakerId = target === 'new' ? nextSpeakerId(transcript) : target;
  if (target !== 'new') {
    requireSpeaker(transcript, target);
    if (segment.speakerId === target) return transcript;
  }
  const segments = transcript.segments.map((s) => (s.id === segmentId ? { ...s, speakerId, edited: true } : s));
  return changed(transcript, segments, now, target === 'new' ? [speakerOf(speakerId)] : []);
}

function merge(transcript: Transcript, from: SpeakerId, into: SpeakerId, now: Date): Transcript {
  if (from === into) return transcript;
  requireSpeaker(transcript, from);
  requireSpeaker(transcript, into);
  const segments = transcript.segments.map((s) => (s.speakerId === from ? { ...s, speakerId: into, edited: true } : s));
  return changed(transcript, segments, now);
}

/** Применить правку. Ничего не изменилось — возвращается тот же объект (записывать нечего). */
export function applyEdit(transcript: Transcript, edit: TranscriptEdit, now: Date): Transcript {
  switch (edit.kind) {
    case 'text':
      return editText(transcript, edit.segmentId, edit.text, now);
    case 'restore':
      return restore(transcript, edit.segment, now);
    case 'speaker':
      return changeSpeaker(transcript, edit.segmentId, edit.speakerId, now);
    case 'merge':
      return merge(transcript, edit.from, edit.into, now);
  }
}

/** Имена совпадают без учёта регистра, «ё/е» и пробелов по краям. */
export const sameName = (a: string, b: string): boolean => normalize(a.trim()) === normalize(b.trim());

/**
 * Новое имя спикера совпадает с подписью другого спикера встречи (в том числе «Я» или «Спикер 2») — это просьба
 * объединить их: возвращается тот, с кем объединять. Пустое имя ни с кем не совпадает.
 */
export function mergeTarget(
  speakers: readonly TranscriptSpeaker[],
  names: Readonly<Record<string, string>>,
  speakerId: SpeakerId,
  name: string,
): SpeakerId | null {
  if (name.trim() === '') return null;
  const other = speakers.find((s) => s.id !== speakerId && sameName(speakerLabel(s.id, names), name));
  return other?.id ?? null;
}

/** Текст правили руками или собеседникам дали имена — «Расшифровать заново» их потеряет. */
export function hasManualChanges(transcript: Pick<Transcript, 'editedAt'> | null, names: Readonly<Record<string, string>>): boolean {
  return !!transcript?.editedAt || Object.keys(names).some((id) => id !== ME);
}
