import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { readTranscript, transcriptPath, updateTranscript, writeTranscript } from './transcript-store';

const ID = '2026-09-29_1000_a1b2c3';
const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-29T10:00:00.000Z',
  speakers: [{ id: 'me', kind: 'me' }],
  segments: [{ id: 'seg-1', start: 0, end: 1.5, speakerId: 'me', text: 'Да.', edited: false }],
};

const library = () => {
  const lib = makeTempDir('textmeet-transcript-');
  mkdirSync(join(lib, ID));
  return lib;
};

describe('transcript store', () => {
  it('returns null when the meeting has no transcript yet', async () => {
    expect(await readTranscript(library(), ID)).toBeNull();
  });

  it('writes and reads a transcript back', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    expect(await readTranscript(lib, ID)).toEqual(transcript);
    expect(readFileSync(transcriptPath(lib, ID), 'utf8')).toContain('"model": "gigaam-v3-e2e-rnnt"');
  });

  it('reports a damaged file', async () => {
    const lib = library();
    writeFileSync(transcriptPath(lib, ID), '{"schemaVersion": 2}');
    await expect(readTranscript(lib, ID)).rejects.toThrow('Текст встречи не прочитан');
  });

  it('keeps fields of segments and speakers written by a newer version of the app', async () => {
    const lib = library();
    const newer = {
      ...transcript,
      speakers: [{ id: 'me', kind: 'me', voice: [0.1] }],
      segments: [{ ...transcript.segments[0], words: [{ w: 'Да', t: 0 }] }],
    };
    writeFileSync(transcriptPath(lib, ID), JSON.stringify(newer));

    await updateTranscript(lib, ID, (t) => ({ ...t, segments: t.segments.map((s) => ({ ...s, text: 'Нет.' })) }));

    expect(JSON.parse(readFileSync(transcriptPath(lib, ID), 'utf8'))).toMatchObject({
      speakers: [{ id: 'me', voice: [0.1] }],
      segments: [{ text: 'Нет.', words: [{ w: 'Да', t: 0 }] }],
    });
  });

  it('applies a change and returns the saved transcript', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    const saved = await updateTranscript(lib, ID, (t) => ({ ...t, editedAt: '2026-10-04T09:00:00.000Z' }));
    expect(saved.editedAt).toBe('2026-10-04T09:00:00.000Z');
    expect(await readTranscript(lib, ID)).toEqual(saved);
  });

  it('refuses to change a transcript that does not exist', async () => {
    await expect(updateTranscript(library(), ID, (t) => t)).rejects.toThrow('Текста встречи нет');
  });

  it('does not lose an edit made while a new transcription is being written', async () => {
    const lib = library();
    await writeTranscript(lib, ID, transcript);
    const fresh = { ...transcript, model: 't-one', segments: [{ ...transcript.segments[0]!, text: 'Новый.' }] };
    await Promise.all([
      updateTranscript(lib, ID, (t) => ({ ...t, editedAt: '2026-10-04T09:00:00.000Z' })),
      writeTranscript(lib, ID, fresh),
      updateTranscript(lib, ID, (t) => ({ ...t, segments: t.segments.map((s) => ({ ...s, edited: true })) })),
    ]);
    // Правки и запись идут по очереди: последняя правка применена к уже записанному новому тексту.
    expect(await readTranscript(lib, ID)).toEqual({ ...fresh, segments: [{ ...fresh.segments[0], edited: true }] });
  });

  it('refuses an invalid transcript', async () => {
    const bad = { ...transcript, segments: [{ ...transcript.segments[0], speakerId: 'бог' }] } as unknown as Transcript;
    await expect(writeTranscript(library(), ID, bad)).rejects.toThrow();
  });
});
