import { describe, expect, it } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import type { Transcript } from '../../shared/transcript';
import { editTexts } from '../../shared/transcript-edit';
import { makeTempDir } from '../../test-support/temp-dir';
import { editTranscript, meetingEditTexts, renameMeeting, renameSpeaker, TranscriptEditSchema } from './meeting-edits';
import { createMeeting, readMeeting, updateMeeting } from './library';
import { readTranscript, writeTranscript } from './transcript-store';

const NOW = new Date('2026-10-04T09:00:00.000Z');

const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-01T10:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 0, end: 1, speakerId: 's1', text: 'Привет.', edited: false },
    { id: 'b', start: 2, end: 3, speakerId: 'me', text: 'Здравствуйте.', edited: false },
    { id: 'c', start: 4, end: 5, speakerId: 's2', text: 'Добрый день.', edited: false },
  ],
};

async function meetingWithText(patch: Partial<Meeting> = {}): Promise<{ lib: string; id: string }> {
  const lib = makeTempDir('textmeet-edits-');
  const meeting = await createMeeting(lib, { source: 'recording', status: 'done' });
  await updateMeeting(lib, meeting.id, (m) => ({ ...m, ...patch }));
  await writeTranscript(lib, meeting.id, transcript);
  return { lib, id: meeting.id };
}

describe('renameMeeting', () => {
  it('saves a trimmed title', async () => {
    const { lib, id } = await meetingWithText();
    expect((await renameMeeting(lib, id, '  Созвон с Ириной ')).title).toBe('Созвон с Ириной');
    expect((await readMeeting(lib, id)).title).toBe('Созвон с Ириной');
  });

  it('refuses an empty title', async () => {
    const { lib, id } = await meetingWithText();
    await expect(renameMeeting(lib, id, '   ')).rejects.toThrow(meetingEditTexts.emptyTitle);
  });
});

describe('renameSpeaker', () => {
  it('sets, trims and clears a speaker name', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл' } });
    expect((await renameSpeaker(lib, id, 's1', ' Ирина ')).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    expect((await renameSpeaker(lib, id, 's1', '  ')).speakerNames).toEqual({ me: 'Кирилл' });
    expect((await renameSpeaker(lib, id, 'me', null)).speakerNames).toEqual({});
  });
});

describe('editTranscript', () => {
  it('applies an edit and returns the meeting and the saved text', async () => {
    const { lib, id } = await meetingWithText();
    const result = await editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: 'Добрый вечер.' }, NOW);
    expect(result.transcript.segments[1]).toMatchObject({ text: 'Добрый вечер.', edited: true });
    expect(result.meeting.id).toBe(id);
    expect(result.meetingChanged).toBe(false);
    expect(await readTranscript(lib, id)).toEqual(result.transcript);
  });

  it('forgets the name of a speaker that has no segments left', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл', s1: 'Ирина', s2: 'Олег' } });
    const result = await editTranscript(lib, id, { kind: 'merge', from: 's2', into: 's1' }, NOW);
    expect(result.meeting.speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
    expect(result.meetingChanged).toBe(true);
    expect((await readMeeting(lib, id)).speakerNames).toEqual({ me: 'Кирилл', s1: 'Ирина' });
  });

  it('keeps the owner name even when the owner has no segments', async () => {
    const { lib, id } = await meetingWithText({ speakerNames: { me: 'Кирилл' } });
    const result = await editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: '' }, NOW);
    expect(result.meeting.speakerNames).toEqual({ me: 'Кирилл' });
  });

  it.each(['queued', 'transcribing'] as const)('refuses to edit while the meeting is %s', async (status) => {
    const { lib, id } = await meetingWithText({ status });
    await expect(editTranscript(lib, id, { kind: 'text', segmentId: 'b', text: 'x' }, NOW)).rejects.toThrow(
      meetingEditTexts.transcribing,
    );
  });

  it('reports a segment that is gone', async () => {
    const { lib, id } = await meetingWithText();
    await expect(editTranscript(lib, id, { kind: 'text', segmentId: 'zz', text: 'x' }, NOW)).rejects.toThrow(
      editTexts.segmentGone,
    );
  });
});

describe('TranscriptEditSchema', () => {
  it('accepts every kind of edit', () => {
    for (const edit of [
      { kind: 'text', segmentId: 'seg-1', text: '' },
      { kind: 'restore', segment: transcript.segments[0] },
      { kind: 'speaker', segmentId: 'seg-1', speakerId: 'new' },
      { kind: 'speaker', segmentId: 'seg-1', speakerId: 's2' },
      { kind: 'merge', from: 's2', into: 'me' },
    ]) {
      expect(TranscriptEditSchema.safeParse(edit).success).toBe(true);
    }
  });

  it('refuses wrong edits', () => {
    for (const edit of [
      { kind: 'text', segmentId: '', text: 'x' },
      { kind: 'text', segmentId: 'a', text: 'x'.repeat(20_001) },
      { kind: 'speaker', segmentId: 'a', speakerId: 'бог' },
      { kind: 'merge', from: 's1' },
      { kind: 'delete', segmentId: 'a' },
    ]) {
      expect(TranscriptEditSchema.safeParse(edit).success).toBe(false);
    }
  });
});
