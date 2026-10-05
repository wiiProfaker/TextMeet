import { existsSync, promises as fsp, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Meeting } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { audioDir, createMeeting, meetingDir, readMeeting, updateMeeting } from './library';
import { audioSize, deleteAudio, deleteMeeting, deleteTexts, type DeleteDeps } from './meeting-delete';
import { folderTrash } from './trash';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Папку не удаётся проверить (OneDrive, антивирус, отключённый диск): это не «папки нет». */
function checkFailsFor(path: string, code: string): void {
  const fail = () => Promise.reject(Object.assign(new Error(`${code}: ${path}`), { code }));
  for (const name of ['stat', 'access'] as const) {
    const real = fsp[name].bind(fsp) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(fsp, name).mockImplementation(((file: unknown, ...rest: unknown[]) =>
      String(file) === path ? fail() : real(file, ...rest)) as never);
  }
}

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

  it('keeps the meeting as it was when its record cannot be updated, and a retry finishes the job', async () => {
    const { lib, meeting, deps } = await setup();
    const realRename = fsp.rename.bind(fsp);
    const rename = vi.spyOn(fsp, 'rename').mockImplementation((from, to) =>
      String(to).endsWith('meeting.json')
        ? Promise.reject(Object.assign(new Error(`ENOSPC: ${String(to)}`), { code: 'ENOSPC' }))
        : realRename(from, to),
    );
    const failure = await deleteAudio(deps, meeting.id).catch((err: unknown) => err as Error);
    expect(failure.message).toBe(
      'Аудио перенесено в Корзину, но запись о встрече не обновилась: на диске закончилось место. Повторите удаление.',
    );
    expect(failure.message).not.toContain(lib);
    expect(existsSync(audioDir(lib, meeting.id))).toBe(false);
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ audioDeleted: false });

    rename.mockRestore();
    expect(await deleteAudio(deps, meeting.id)).toMatchObject({ tracks: [], audioDeleted: true });
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ tracks: [], audioDeleted: true });
  });

  it('uses a generic reason, not the system text with a path, for an unknown error code', async () => {
    const { lib, meeting, deps } = await setup();
    const realRename = fsp.rename.bind(fsp);
    vi.spyOn(fsp, 'rename').mockImplementation((from, to) =>
      String(to).endsWith('meeting.json')
        ? Promise.reject(Object.assign(new Error(`EMFILE: too many open files, rename '${String(to)}'`), { code: 'EMFILE' }))
        : realRename(from, to),
    );
    const failure = await deleteAudio(deps, meeting.id).catch((err: unknown) => err as Error);
    expect(failure.message).toBe(
      'Аудио перенесено в Корзину, но запись о встрече не обновилась: файл занят или недоступен. Повторите удаление.',
    );
    expect(failure.message).not.toContain(lib);
  });

  it('still tries the trash when the audio folder cannot be checked', async () => {
    const { lib, meeting, deps } = await setup();
    checkFailsFor(audioDir(lib, meeting.id), 'EPERM');
    const trash = vi.fn(async () => {
      throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    });
    deps.trash = trash;
    await expect(deleteAudio(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(trash).toHaveBeenCalled();
    expect(await readMeeting(lib, meeting.id)).toMatchObject({ audioDeleted: false });
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

  it('does not requeue a transcription that finished while it was being cancelled', async () => {
    const { lib, meeting, deps, calls } = await setup({ status: 'transcribing' });
    vi.mocked(deps.transcription.cancel).mockImplementation(async (_lib, id) => {
      calls.push(`transcription ${id}`);
      await updateMeeting(lib, id, (m) => ({ ...m, status: 'done' }));
    });
    deps.trash = async () => {
      throw new Error('нет Корзины');
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`]);
  });

  it('asks whether the mixing runs right before cancelling it, not before the transcription cancel', async () => {
    const { meeting, deps, calls } = await setup();
    // Сведение началось, пока отменялась расшифровка: до её отмены его ещё не было.
    let mixing = false;
    vi.mocked(deps.mixer.isPending).mockImplementation(() => mixing);
    vi.mocked(deps.transcription.cancel).mockImplementation(async (_lib, id) => {
      calls.push(`transcription ${id}`);
      mixing = true;
    });
    deps.trash = async () => {
      throw new Error('нет Корзины');
    };
    await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `remix ${meeting.id}`]);
  });

  it.each(['EPERM', 'EACCES', 'EBUSY', 'EIO'])(
    'does not report a meeting as deleted when its folder cannot be checked (%s)',
    async (code) => {
      const { lib, meeting, deps, calls } = await setup({ status: 'queued' });
      vi.mocked(deps.mixer.isPending).mockReturnValue(true);
      checkFailsFor(meetingDir(lib, meeting.id), code);
      const trash = vi.fn(async () => {
        throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      });
      deps.trash = trash;
      await expect(deleteMeeting(deps, meeting.id)).rejects.toThrow('Не удалось переместить в Корзину');
      expect(trash).toHaveBeenCalled();
      expect(calls).toEqual([
        `transcription ${meeting.id}`,
        `mixer ${meeting.id}`,
        `requeue ${meeting.id}`,
        `remix ${meeting.id}`,
      ]);
      expect(deps.dropStopDialog).not.toHaveBeenCalled();
    },
  );

  it('counts a folder that is already gone as deleted', async () => {
    const { lib, meeting, deps, calls } = await setup();
    rmSync(meetingDir(lib, meeting.id), { recursive: true });
    const trash = vi.fn(deps.trash);
    deps.trash = trash;
    await deleteMeeting(deps, meeting.id);
    expect(trash).not.toHaveBeenCalled();
    expect(calls).toEqual([`transcription ${meeting.id}`, `mixer ${meeting.id}`, `dialog ${meeting.id}`]);
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
