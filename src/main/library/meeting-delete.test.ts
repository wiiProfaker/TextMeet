import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, meetingDir, readMeeting, updateMeeting } from './library';
import { audioSize, deleteAudio, deleteMeeting, deleteTexts, type DeleteDeps } from './meeting-delete';
import { folderTrash } from './trash';

async function setup(patch: Partial<Meeting> = {}) {
  const lib = makeTempDir('textmeet-delete-');
  const created = await createMeeting(lib, { source: 'recording', status: 'recording' });
  writeFileSync(join(audioDir(lib, created.id), 'mic.webm'), 'x'.repeat(1000));
  writeFileSync(join(audioDir(lib, created.id), 'mix.opus'), 'y'.repeat(500));
  const meeting = await updateMeeting(lib, created.id, (m) => ({
    ...m,
    status: 'done',
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...patch,
  }));
  const calls: string[] = [];
  const bin = join(makeTempDir('textmeet-bin-'), 'bin');
  const deps: DeleteDeps = {
    libraryDir: () => lib,
    trash: folderTrash(bin),
    isRecording: vi.fn(() => false),
    transcription: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`transcription ${id}`);
      }),
      enqueue: vi.fn(async (_lib: string, id: string) => {
        calls.push(`requeue ${id}`);
      }),
    },
    mixer: {
      cancel: vi.fn(async (_lib: string, id: string) => {
        calls.push(`mixer ${id}`);
      }),
      isPending: vi.fn(() => false),
      enqueue: vi.fn((_lib: string, id: string) => {
        calls.push(`remix ${id}`);
      }),
    },
    logger: { warn: vi.fn() },
    dropStopDialog: vi.fn((id: string) => {
      calls.push(`dialog ${id}`);
    }),
    trashRetryMs: 0,
  };
  return { lib, meeting, deps, calls, bin };
}

describe('audioSize', () => {
  it('adds up the files of the audio folder and is 0 without it', async () => {
    const { lib, meeting } = await setup();
    expect(await audioSize(lib, meeting.id)).toBe(1500);
    expect(await audioSize(lib, '2026-01-01_0000_ffffff')).toBe(0);
  });
});

describe('deleteAudio', () => {
  it('moves the audio folder to the trash and keeps the meeting with no tracks', async () => {
    const { lib, meeting, deps } = await setup();
    const updated = await deleteAudio(deps, meeting.id);
    expect(updated).toMatchObject({ tracks: [], audioDeleted: true, status: 'done' });
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ tracks: [], audioDeleted: true });
    expect(existsSync(audioDir(lib, meeting.id))).toBe(false);
    expect(existsSync(join(meetingDir(lib, meeting.id), 'meeting.json'))).toBe(true);
  });

  it('marks the audio deleted even when the folder is already gone', async () => {
    const { lib, meeting, deps } = await setup();
    await deps.trash(audioDir(lib, meeting.id));
    expect((await deleteAudio(deps, meeting.id)).audioDeleted).toBe(true);
  });

  it.each([
    ['being recorded', {}, { recording: true }, deleteTexts.recording],
    ['queued', { status: 'queued' }, {}, deleteTexts.transcribing],
    ['transcribing', { status: 'transcribing' }, {}, deleteTexts.transcribing],
    ['still mixing', {}, { mixing: true }, deleteTexts.mixing],
    ['without audio already', { audioDeleted: true, tracks: [] }, {}, deleteTexts.noAudio],
  ] as const)('refuses a meeting %s', async (_name, patch, state, message) => {
    const { lib, meeting, deps } = await setup(patch as Partial<Meeting>);
    vi.mocked(deps.isRecording).mockReturnValue('recording' in state);
    vi.mocked(deps.mixer.isPending).mockReturnValue('mixing' in state);
    await expect(deleteAudio(deps, meeting.id)).rejects.toThrow(message);
    expect(existsSync(audioDir(lib, meeting.id))).toBe(true);
  });
});

describe('deleteMeeting', () => {
  it('stops its transcription and mixing, moves the folder to the trash, then drops its stop dialog', async () => {
    const { lib, meeting, deps, calls, bin } = await setup({ status: 'transcribing' });
    await deleteMeeting(deps, meeting.id);
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `dialog ${meeting.id}`]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
    expect(existsSync(join(bin, `1-${meeting.id}`, 'meeting.json'))).toBe(true);
  });

  it('puts its transcription and mixing back and keeps its stop dialog when the trash fails', async () => {
    const { lib, meeting, deps, calls } = await setup({ status: 'queued' });
    vi.mocked(deps.mixer.isPending).mockReturnValue(true);
    deps.trash = async () => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([
      `transcription ${meeting.id}`,
      `mixer ${meeting.id}`,
      `requeue ${meeting.id}`,
      `remix ${meeting.id}`,
    ]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('does not requeue a meeting that was not waiting for transcription or mixing', async () => {
    const { meeting, deps, calls } = await setup();
    deps.trash = async () => {
      throw new Error('нет Корзины');
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`]);
  });

  it('refuses the meeting being recorded', async () => {
    const { lib, meeting, deps, calls } = await setup();
    vi.mocked(deps.isRecording).mockReturnValue(true);
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow(deleteTexts.recording);
    expect(calls).toEqual([]);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(true);
  });

  it('deletes a folder whose meeting.json cannot be read', async () => {
    const { lib, meeting, deps } = await setup();
    writeFileSync(join(meetingDir(lib, meeting.id), 'meeting.json'), '{ сломано');
    await deleteMeeting(deps, meeting.id);
    expect(existsSync(meetingDir(lib, meeting.id))).toBe(false);
  });

  it('refuses a path outside the library', async () => {
    const { deps } = await setup();
    await expect(deleteMeeting(deps, '..')).rejects.toThrow(RangeError);
  });
});
