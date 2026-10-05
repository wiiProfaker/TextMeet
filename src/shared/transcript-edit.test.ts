import { describe, expect, it } from 'vitest';
import type { Transcript, TranscriptSegment } from './transcript';
import { TranscriptSchema } from './transcript';
import {
  applyEdit,
  editTexts,
  hasManualChanges,
  isStaleEditMessage,
  mergeTarget,
  nextSpeakerId,
  pruneSpeakers,
  sameName,
} from './transcript-edit';

const NOW = new Date('2026-10-04T09:00:00.000Z');
const seg = (id: string, start: number, speakerId: string, text: string): TranscriptSegment => ({
  id,
  start,
  end: start + 1,
  speakerId,
  text,
  edited: false,
});

const base = (): Transcript => ({
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-01T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    seg('a', 0, 's1', 'Смотри, по бюджету.'),
    seg('b', 2, 'me', 'С подрядчиками?'),
    seg('c', 4, 's2', 'Без.'),
    seg('d', 6, 's1', 'Отлично.'),
  ],
});

const texts = (t: Transcript) => t.segments.map((s) => `${s.speakerId}:${s.text}`);

describe('applyEdit — text', () => {
  it('changes the text, trims it, marks the segment and the transcript as edited', () => {
    const next = applyEdit(base(), { kind: 'text', segmentId: 'c', text: '  Без подрядчиков. ' }, NOW);
    expect(next.segments[2]).toMatchObject({ text: 'Без подрядчиков.', edited: true });
    expect(next.editedAt).toBe(NOW.toISOString());
    expect(TranscriptSchema.parse(next)).toEqual(next);
  });

  it('returns the same transcript when the text did not change', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'text', segmentId: 'c', text: 'Без. ' }, NOW)).toBe(t);
  });

  it('deletes the segment when the text is emptied, and drops a speaker left without segments', () => {
    const next = applyEdit(base(), { kind: 'text', segmentId: 'c', text: '   ' }, NOW);
    expect(next.segments.map((s) => s.id)).toEqual(['a', 'b', 'd']);
    expect(next.speakers.map((s) => s.id)).toEqual(['me', 's1']);
    expect(next.editedAt).toBe(NOW.toISOString());
  });

  it('refuses a segment that is gone', () => {
    expect(() => applyEdit(base(), { kind: 'text', segmentId: 'x', text: 'а' }, NOW)).toThrow(editTexts.segmentGone);
  });

  it('tells the refusals that mean the text has changed from other errors', () => {
    expect(isStaleEditMessage(editTexts.transcriptChanged)).toBe(true);
    expect(isStaleEditMessage(editTexts.segmentGone)).toBe(true);
    expect(isStaleEditMessage(editTexts.speakerGone)).toBe(true);
    expect(isStaleEditMessage(editTexts.tooManySpeakers)).toBe(false);
    expect(isStaleEditMessage('Не удалось сохранить правку: файл занят другой программой')).toBe(false);
  });

  it('keeps unknown fields of the segment', () => {
    const t = base();
    t.segments[0] = { ...t.segments[0]!, words: [1, 2] };
    const next = applyEdit(t, { kind: 'text', segmentId: 'a', text: 'Новое.' }, NOW);
    expect(next.segments[0]).toMatchObject({ text: 'Новое.', words: [1, 2] });
  });
});

describe('applyEdit — restore', () => {
  it('puts a deleted segment back in its place by time and brings its speaker back', () => {
    const t = base();
    const removed = applyEdit(t, { kind: 'text', segmentId: 'c', text: '' }, NOW);
    const back = applyEdit(removed, { kind: 'restore', segment: t.segments[2]! }, NOW);
    expect(back.segments.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(back.speakers.map((s) => s.id)).toEqual(['me', 's1', 's2']);
  });

  it('appends a segment later than all others', () => {
    const next = applyEdit(base(), { kind: 'restore', segment: seg('z', 99, 'me', 'Пока.') }, NOW);
    expect(next.segments.at(-1)?.id).toBe('z');
  });

  it('does nothing when the segment is already there', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'restore', segment: t.segments[0]! }, NOW)).toBe(t);
  });
});

describe('applyEdit — speaker', () => {
  it('moves one segment to another speaker', () => {
    const next = applyEdit(base(), { kind: 'speaker', segmentId: 'd', speakerId: 's2' }, NOW);
    expect(texts(next)).toEqual(['s1:Смотри, по бюджету.', 'me:С подрядчиками?', 's2:Без.', 's2:Отлично.']);
    expect(next.segments[3]?.edited).toBe(true);
    expect(next.editedAt).toBe(NOW.toISOString());
  });

  it('gives a segment to a new speaker with the next free number', () => {
    const next = applyEdit(base(), { kind: 'speaker', segmentId: 'c', speakerId: 'new' }, NOW);
    expect(next.segments[2]?.speakerId).toBe('s3');
    // s2 остался без реплик и исчез, новый — в конце.
    expect(next.speakers).toEqual([
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
      { id: 's3', kind: 'other' },
    ]);
  });

  it('returns the same transcript when the speaker is the same', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'speaker', segmentId: 'a', speakerId: 's1' }, NOW)).toBe(t);
  });

  it('refuses a speaker that is not in the meeting', () => {
    expect(() => applyEdit(base(), { kind: 'speaker', segmentId: 'a', speakerId: 's7' }, NOW)).toThrow(editTexts.speakerGone);
  });
});

describe('applyEdit — merge', () => {
  it('gives every segment of one speaker to another and drops the first', () => {
    const next = applyEdit(base(), { kind: 'merge', from: 's2', into: 's1' }, NOW);
    expect(texts(next)).toEqual(['s1:Смотри, по бюджету.', 'me:С подрядчиками?', 's1:Без.', 's1:Отлично.']);
    expect(next.speakers.map((s) => s.id)).toEqual(['me', 's1']);
    expect(next.segments[2]?.edited).toBe(true);
    expect(next.segments[0]?.edited).toBe(false);
  });

  it('can merge into the owner', () => {
    const next = applyEdit(base(), { kind: 'merge', from: 's2', into: 'me' }, NOW);
    expect(next.segments[2]?.speakerId).toBe('me');
  });

  it('does nothing when both are the same speaker', () => {
    const t = base();
    expect(applyEdit(t, { kind: 'merge', from: 's1', into: 's1' }, NOW)).toBe(t);
  });

  it('refuses a speaker that is gone', () => {
    expect(() => applyEdit(base(), { kind: 'merge', from: 's9', into: 's1' }, NOW)).toThrow(editTexts.speakerGone);
    expect(() => applyEdit(base(), { kind: 'merge', from: 's1', into: 's9' }, NOW)).toThrow(editTexts.speakerGone);
  });
});

describe('nextSpeakerId', () => {
  it('takes the number after the biggest one in speakers and segments', () => {
    expect(nextSpeakerId(base())).toBe('s3');
    expect(nextSpeakerId({ speakers: [{ id: 'me', kind: 'me' }], segments: [seg('a', 0, 's7', 'x')] })).toBe('s8');
    expect(nextSpeakerId({ speakers: [{ id: 'me', kind: 'me' }], segments: [] })).toBe('s1');
  });

  it('refuses to go past the last allowed number', () => {
    expect(() => nextSpeakerId({ speakers: [{ id: 's999', kind: 'other' }], segments: [] })).toThrow(
      editTexts.tooManySpeakers,
    );
  });
});

describe('pruneSpeakers', () => {
  it('keeps the order of speakers with segments and adds missing ones at the end', () => {
    const speakers = pruneSpeakers(
      [
        { id: 's2', kind: 'other' },
        { id: 'me', kind: 'me', extra: true },
        { id: 's1', kind: 'other' },
      ],
      [seg('a', 0, 'me', 'x'), seg('b', 1, 's4', 'y'), seg('c', 2, 's2', 'z'), seg('d', 3, 's4', 'w')],
    );
    expect(speakers).toEqual([
      { id: 's2', kind: 'other' },
      { id: 'me', kind: 'me', extra: true },
      { id: 's4', kind: 'other' },
    ]);
  });
});

describe('sameName and mergeTarget', () => {
  const speakers = base().speakers;

  it('compares names without case, «ё» and spaces at the edges', () => {
    expect(sameName('  Семён ', 'семен')).toBe(true);
    expect(sameName('Семён', 'Семёна')).toBe(false);
  });

  it('finds another speaker with the same label, including the default ones', () => {
    expect(mergeTarget(speakers, { s1: 'Ирина' }, 's2', 'ирина')).toBe('s1');
    expect(mergeTarget(speakers, {}, 's2', 'Спикер 1')).toBe('s1');
    expect(mergeTarget(speakers, {}, 's2', 'я')).toBe('me');
  });

  it('does not merge with the speaker itself, with nobody or for an empty name', () => {
    expect(mergeTarget(speakers, { s2: 'Олег' }, 's2', 'Олег')).toBeNull();
    expect(mergeTarget(speakers, { s1: 'Ирина' }, 's2', 'Олег')).toBeNull();
    expect(mergeTarget(speakers, {}, 's2', '  ')).toBeNull();
  });
});

describe('hasManualChanges', () => {
  it('is true when the text was edited or other speakers were named', () => {
    expect(hasManualChanges({ editedAt: NOW.toISOString() }, {})).toBe(true);
    expect(hasManualChanges({}, { s1: 'Ирина' })).toBe(true);
  });

  it('is false for an untouched text, the owner name only, or no text', () => {
    expect(hasManualChanges({}, {})).toBe(false);
    expect(hasManualChanges({}, { me: 'Кирилл' })).toBe(false);
    expect(hasManualChanges(null, {})).toBe(false);
  });
});
