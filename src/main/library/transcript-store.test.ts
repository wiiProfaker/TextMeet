import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { readTranscript, transcriptPath, writeTranscript } from './transcript-store';

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

  it('refuses an invalid transcript', async () => {
    const bad = { ...transcript, segments: [{ ...transcript.segments[0], speakerId: 'бог' }] } as unknown as Transcript;
    await expect(writeTranscript(library(), ID, bad)).rejects.toThrow();
  });
});
