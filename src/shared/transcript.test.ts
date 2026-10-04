import { describe, expect, it } from 'vitest';
import { otherSpeakerId, speakerLabel, transcriptModelTitle, TranscriptSchema } from './transcript';

const valid = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-29T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [{ id: 'seg-1', start: 0.5, end: 2, speakerId: 's1', text: 'Привет.' }],
};

describe('TranscriptSchema', () => {
  it('accepts a transcript and fills «edited»', () => {
    expect(TranscriptSchema.parse(valid).segments[0]?.edited).toBe(false);
  });

  it('keeps fields written by a newer version', () => {
    expect(TranscriptSchema.parse({ ...valid, future: 1 })).toMatchObject({ future: 1 });
  });

  it('keeps the title of the model the text was made with', () => {
    expect(TranscriptSchema.parse({ ...valid, modelTitle: 'Parakeet v3' }).modelTitle).toBe('Parakeet v3');
    expect(TranscriptSchema.parse(valid).modelTitle).toBeUndefined();
  });

  it('rejects unknown speaker ids', () => {
    const bad = { ...valid, segments: [{ ...valid.segments[0], speakerId: '../x' }] };
    expect(TranscriptSchema.safeParse(bad).success).toBe(false);
  });
});

describe('transcriptModelTitle', () => {
  it('takes the saved title, then the catalog, then the bare id', () => {
    expect(transcriptModelTitle({ model: 't-one', modelTitle: 'Старое имя' })).toBe('Старое имя');
    expect(transcriptModelTitle({ model: 'gigaam-v3-e2e-rnnt' })).toBe('GigaAM v3');
    expect(transcriptModelTitle({ model: 'future-model' })).toBe('future-model');
  });
});

describe('speakerLabel', () => {
  it('names the owner and the others', () => {
    expect(speakerLabel('me')).toBe('Я');
    expect(speakerLabel(otherSpeakerId(0))).toBe('Спикер 1');
    expect(speakerLabel('s12')).toBe('Спикер 12');
  });

  it('prefers a name given by the user', () => {
    expect(speakerLabel('s2', { s2: 'Ирина' })).toBe('Ирина');
  });

  it('shows an unknown id as is', () => {
    expect(speakerLabel('x')).toBe('x');
  });
});
