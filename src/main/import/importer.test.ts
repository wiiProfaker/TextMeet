import { existsSync, promises as fsp, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ImportFailedEvent, ImportProgress } from '../../shared/import';
import type { Meeting } from '../../shared/meeting';
import { makeTempDir } from '../../test-support/temp-dir';
import { videoWithSound } from '../../test-support/media-files';
import { FFMPEG_CANCELLED, resolveFfmpegPath } from '../audio/ffmpeg';
import { knownFsReason } from '../fs/fs-errors';
import { audioDir, createMeeting, listMeetings, readMeeting } from '../library/library';
import type { Logger } from '../logger';
import { copyTexts, SOURCE_FILE, type copySourceAudio, type CopyOptions } from './audio-copy';
import { Importer, importTexts, recoverInterruptedImports, type ImporterDeps } from './importer';
import { probeTexts, type Examined, type examineFile } from './probe';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const quiet = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) });

/** Сведения о файле: по имени — подходит ли он и какая у него дата. */
function fakeExamine(table: Record<string, Examined>): typeof examineFile {
  return async (_ffmpeg, path) => {
    const name = path.split(/[\\/]/).pop() ?? '';
    return table[name] ?? { ok: false, reason: probeTexts.unreadable };
  };
}

const goodFile = (creationTime: string | null, durationSec: number | null = 60): Examined => ({
  ok: true,
  info: { hasAudio: true, durationSec, creationTime },
  size: 1000,
  modifiedAt: new Date('2026-10-03T08:00:00.000Z'),
});

/** Копирование, которым управляет тест: каждый вызов ждёт finish / fail; отмена отклоняет его, как настоящий ffmpeg. */
function controlledCopy() {
  const calls: { source: string; dir: string; options: CopyOptions; finish(): void; fail(err: Error): void }[] = [];
  const copy: typeof copySourceAudio = (_ffmpeg, source, dir, options) =>
    new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error(FFMPEG_CANCELLED)), { once: true });
      calls.push({
        source,
        dir,
        options,
        finish: () => {
          writeFileSync(join(dir, SOURCE_FILE), 'звук');
          resolve({ durationSec: 61.5, reencoded: false });
        },
        fail: reject,
      });
    });
  return { copy, calls };
}

function setup(over: Partial<ImporterDeps> = {}) {
  const imported: Meeting[] = [];
  const failed: ImportFailedEvent[] = [];
  const progress: ImportProgress[][] = [];
  const changed = vi.fn();
  const deps: ImporterDeps = {
    ffmpegPath: () => 'ffmpeg',
    logger: quiet(),
    now: () => NOW,
    freeBytes: async () => 10 * 1024 ** 3,
    libraryChanged: changed,
    progressChanged: (p) => progress.push(p),
    imported: ({ meeting }) => imported.push(meeting),
    failed: (f) => failed.push(f),
    ...over,
  };
  return { importer: new Importer(deps), imported, failed, progress, changed };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await tick();
  if (!check()) throw new Error('не дождались');
}

describe('Importer.addFiles', () => {
  it('creates a meeting for every good file at once, dated by the file, and refuses the rest', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy } = controlledCopy();
    const t = setup({
      copy,
      examine: fakeExamine({
        'Созвон с Ириной.mp4': goodFile('2026-10-04T13:20:05.000000Z', 2832),
        'Новая запись 3.m4a': goodFile(null),
      }),
    });
    const result = await t.importer.addFiles(lib, [
      join('C:', 'Записи', 'Созвон с Ириной.mp4'),
      join('C:', 'Записи', 'отчёт.pdf'),
      join('C:', 'Записи', 'Новая запись 3.m4a'),
    ]);
    expect(result.failed).toEqual([{ name: 'отчёт.pdf', reason: probeTexts.unreadable }]);
    expect(result.added).toHaveLength(2);
    const [call, phone] = await Promise.all(result.added.map((id) => readMeeting(lib, id)));
    expect(call).toMatchObject({
      source: 'import',
      status: 'importing',
      title: 'Созвон с Ириной',
      createdAt: '2026-10-04T13:20:05.000Z',
      durationSec: 2832,
      sourceFileName: 'Созвон с Ириной.mp4',
      tracks: [],
    });
    expect(phone).toMatchObject({ title: 'Новая запись 3', createdAt: '2026-10-03T08:00:00.000Z' });
    expect(t.changed).toHaveBeenCalled();
  });

  it('takes at most 100 files at once', async () => {
    const lib = makeTempDir('textmeet-import-');
    const files = Array.from({ length: 102 }, (_, i) => `f${i}.mp3`);
    const t = setup({ copy: controlledCopy().copy, examine: async () => goodFile(null) });
    const result = await t.importer.addFiles(lib, files);
    expect(result.added).toHaveLength(100);
    expect(result.failed).toEqual([
      { name: 'f100.mp3', reason: importTexts.tooMany },
      { name: 'f101.mp3', reason: importTexts.tooMany },
    ]);
  });

  it('a file whose details could not be read is refused plainly', async () => {
    const lib = makeTempDir('textmeet-import-');
    const t = setup({ examine: async () => Promise.reject(new Error('spawn ENOENT')) });
    expect(await t.importer.addFiles(lib, ['a.mp3'])).toEqual({
      added: [],
      failed: [{ name: 'a.mp3', reason: probeTexts.unreadable }],
    });
  });

  it('says plainly when the meeting cannot be created', async () => {
    const lib = makeTempDir('textmeet-import-');
    const blocked = join(lib, 'файл-вместо-папки');
    writeFileSync(blocked, '');
    const t = setup({ examine: async () => goodFile(null) });
    const result = await t.importer.addFiles(blocked, ['a.mp3']);
    expect(result.added).toEqual([]);
    expect(result.failed[0]?.name).toBe('a.mp3');
  });
});

describe('Importer queue', () => {
  it('copies one file at a time, reports progress and hands the meeting on', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null, 100) });
    const { added } = await t.importer.addFiles(lib, ['a.mp4', 'b.mp4']);
    await until(() => calls.length === 1);
    expect(t.importer.progress()).toEqual([
      { meetingId: added[0], fraction: 0, waiting: false },
      { meetingId: added[1], fraction: null, waiting: true },
    ]);
    calls[0]?.options.onProgress?.(25);
    expect(t.progress.at(-1)?.[0]).toEqual({ meetingId: added[0], fraction: 0.25, waiting: false });
    expect(t.importer.isPending(lib, added[1] ?? '')).toBe(true);

    calls[0]?.finish();
    await until(() => calls.length === 2);
    expect(t.imported.map((m) => m.id)).toEqual([added[0]]);
    expect(await readMeeting(lib, added[0] ?? '')).toMatchObject({
      status: 'recorded',
      durationSec: 100,
      tracks: [{ kind: 'file', file: SOURCE_FILE, startOffsetMs: 0 }],
    });
    calls[1]?.finish();
    await until(() => t.imported.length === 2);
    await until(() => t.progress.at(-1)?.length === 0);
    expect(t.importer.isPending(lib, added[1] ?? '')).toBe(false);
  });

  it('takes the duration from ffmpeg when the file did not tell it and shows no percentage meanwhile', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null, null) });
    const [id = ''] = (await t.importer.addFiles(lib, ['a.amr'])).added;
    await until(() => calls.length === 1);
    calls[0]?.options.onProgress?.(10);
    expect(t.importer.progress()).toEqual([{ meetingId: id, fraction: null, waiting: false }]);
    calls[0]?.finish();
    await until(() => t.imported.length === 1);
    expect((await readMeeting(lib, id)).durationSec).toBe(61.5);
  });

  it('removes the unfinished meeting when the sound could not be copied and says why', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [id = ''] = (await t.importer.addFiles(lib, [join('D:', 'Созвон.mp4')])).added;
    await until(() => calls.length === 1);
    calls[0]?.fail(new Error(copyTexts.noSpace));
    await until(() => t.failed.length === 1);
    expect(t.failed).toEqual([{ meetingId: id, name: 'Созвон.mp4', reason: copyTexts.noSpace }]);
    expect(existsSync(join(lib, id))).toBe(false);
    expect(t.imported).toEqual([]);
  });

  it('cancels a waiting file and stops the one being copied without calling it a failure', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    expect(t.importer.isBusy()).toBe(true);
    await t.importer.cancel(lib, second);
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([first]);
    await t.importer.cancel(lib, first);
    expect(t.importer.isPending(lib, first)).toBe(false);
    expect(t.importer.isBusy()).toBe(false);
    expect(await t.importer.cancel(lib, first)).toBeNull();
    expect(t.failed).toEqual([]);
    // Папки остались: их переносит в Корзину удаление встречи.
    expect(existsSync(join(lib, first))).toBe(true);
    await tick();
    expect(calls).toHaveLength(1);
  });

  it('puts a cancelled file back first when its meeting could not be deleted', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = '', second = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    const restore = await t.importer.cancel(lib, first);
    await until(() => calls.length === 2);
    expect(calls[1]?.source).toBe('b.mp4');
    restore?.();
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([second, first]);
    calls[1]?.finish();
    await until(() => calls.length === 3);
    expect(calls[2]?.source).toBe('a.mp4');
  });

  it('puts a file back only once when its meeting was deleted twice and both deletions failed', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = ''] = (await t.importer.addFiles(lib, ['a.mp4'])).added;
    await until(() => calls.length === 1);
    const [restoreOne, restoreTwo] = await Promise.all([t.importer.cancel(lib, first), t.importer.cancel(lib, first)]);
    restoreOne?.();
    restoreTwo?.();
    await until(() => calls.length === 2);
    expect(t.importer.progress().map((p) => p.meetingId)).toEqual([first]);
    calls[1]?.finish();
    await until(() => !t.importer.isBusy());
    expect(calls).toHaveLength(2);
  });

  it('ignores a late second restore of a file that was put back and already copied', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = ''] = (await t.importer.addFiles(lib, ['a.mp4'])).added;
    await until(() => calls.length === 1);
    const [restoreOne, restoreTwo] = await Promise.all([t.importer.cancel(lib, first), t.importer.cancel(lib, first)]);
    restoreOne?.();
    await until(() => calls.length === 2);
    calls[1]?.finish();
    await until(() => !t.importer.isBusy());
    // Второе удаление сорвалось позже, когда файл уже скопирован заново.
    restoreTwo?.();
    await tick();
    expect(t.importer.isBusy()).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('a file put back can be put back again after another failed deletion', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [first = ''] = (await t.importer.addFiles(lib, ['a.mp4'])).added;
    await until(() => calls.length === 1);
    (await t.importer.cancel(lib, first))?.();
    await until(() => calls.length === 2);
    (await t.importer.cancel(lib, first))?.();
    await until(() => calls.length === 3);
    expect(t.importer.isPending(lib, first)).toBe(true);
  });

  it('says plainly why the copy could not be saved when the system names it', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [id = ''] = (await t.importer.addFiles(lib, ['a.mp4'])).added;
    await until(() => calls.length === 1);
    const busy = Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    calls[0]?.fail(new Error(knownFsReason(busy) ?? '', { cause: busy }));
    await until(() => t.failed.length === 1);
    expect(t.failed).toEqual([{ meetingId: id, name: 'a.mp4', reason: knownFsReason(busy) }]);
  });

  it('keeps working after a listener throws, and never deletes a meeting whose sound was copied', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({
      copy,
      examine: async () => goodFile(null),
      imported: () => {
        throw new Error('окно закрыто');
      },
      failed: () => {
        throw new Error('окно закрыто');
      },
    });
    const [first = '', second = '', third = ''] = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4', 'c.mp4'])).added;
    await until(() => calls.length === 1);
    calls[0]?.finish();
    await until(() => calls.length === 2);
    expect((await readMeeting(lib, first)).status).toBe('recorded');
    calls[1]?.fail(new Error(copyTexts.broken));
    await until(() => calls.length === 3);
    expect(existsSync(join(lib, second))).toBe(false);
    calls[2]?.finish();
    await until(() => !t.importer.isBusy());
    expect((await readMeeting(lib, third)).status).toBe('recorded');
  });

  it('shows only known copy reasons; anything else is a broken file', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const [id = ''] = (await t.importer.addFiles(lib, ['a.mp4'])).added;
    await until(() => calls.length === 1);
    calls[0]?.fail(new Error("spawn C:\\Program Files\\TextMeet\\ffmpeg.exe ENOENT"));
    await until(() => t.failed.length === 1);
    expect(t.failed).toEqual([{ meetingId: id, name: 'a.mp4', reason: copyTexts.broken }]);
  });

  it('a file that finished while it was being cancelled is not put back', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    let restore: (() => void) | null | undefined;
    const t = setup({
      copy,
      examine: async () => goodFile(null),
      // Удаление пришло, когда звук уже скопирован и встреча вот-вот станет «записано».
      imported: ({ libraryDir, meeting }) => {
        void t.importer.cancel(libraryDir, meeting.id).then((r) => {
          restore = r;
        });
      },
    });
    await t.importer.addFiles(lib, ['a.mp4']);
    await until(() => calls.length === 1);
    calls[0]?.finish();
    await until(() => restore !== undefined);
    expect(restore).toBeNull();
  });

  it('counts files being checked as a running import', async () => {
    const lib = makeTempDir('textmeet-import-');
    let release: () => void = () => undefined;
    const t = setup({
      copy: controlledCopy().copy,
      examine: () =>
        new Promise<Examined>((resolve) => {
          release = () => resolve({ ok: false, reason: probeTexts.noAudio });
        }),
    });
    const adding = t.importer.addFiles(lib, ['a.mp4']);
    await tick();
    expect(t.importer.isBusy()).toBe(true);
    release();
    await adding;
    expect(t.importer.isBusy()).toBe(false);
  });

  it('creates no meeting for a file checked while the app was closing', async () => {
    const lib = makeTempDir('textmeet-import-');
    let release: () => void = () => undefined;
    const t = setup({
      copy: controlledCopy().copy,
      examine: () =>
        new Promise<Examined>((resolve) => {
          release = () => resolve(goodFile(null));
        }),
    });
    const adding = t.importer.addFiles(lib, ['a.mp4']);
    await tick();
    await t.importer.disposeForQuit();
    release();
    expect(await adding).toEqual({ added: [], failed: [{ name: 'a.mp4', reason: importTexts.quitting }] });
    expect(await listMeetings(lib)).toEqual([]);
  });

  it('notes in the log a meeting created while the app was closing that could not be removed', async () => {
    const lib = makeTempDir('textmeet-import-');
    const logger = quiet();
    const { importer } = setup({ logger, copy: controlledCopy().copy, examine: async () => goodFile(null) });
    const mkdir = fsp.mkdir.bind(fsp);
    // Программу начали закрывать, пока создавалась встреча, а её папку не убрать.
    const creating = vi.spyOn(fsp, 'mkdir').mockImplementation((async (path: string, options?: unknown) => {
      if (path.endsWith('audio')) void importer.stop();
      return mkdir(path, options as Parameters<typeof fsp.mkdir>[1]);
    }) as typeof fsp.mkdir);
    const removing = vi.spyOn(fsp, 'rm').mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));
    try {
      expect(await importer.addFiles(lib, ['a.mp4'])).toEqual({
        added: [],
        failed: [{ name: 'a.mp4', reason: importTexts.quitting }],
      });
    } finally {
      creating.mockRestore();
      removing.mockRestore();
    }
    expect(vi.mocked(logger.warn)).toHaveBeenCalledTimes(1);
  });

  it('stopping for the end of a Windows session keeps the unfinished meetings for the next start', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const ids = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.stop();
    for (const id of ids) expect((await readMeeting(lib, id)).status).toBe('importing');
    expect(t.importer.isBusy()).toBe(false);
  });

  it('removes unfinished meetings when the app quits', async () => {
    const lib = makeTempDir('textmeet-import-');
    const { copy, calls } = controlledCopy();
    const t = setup({ copy, examine: async () => goodFile(null) });
    const ids = (await t.importer.addFiles(lib, ['a.mp4', 'b.mp4'])).added;
    await until(() => calls.length === 1);
    await t.importer.disposeForQuit();
    for (const id of ids) expect(existsSync(join(lib, id))).toBe(false);
    expect(t.failed).toEqual([]);
    expect(t.imported).toEqual([]);
  });

  it('copies a real video: only its sound lands in the meeting folder', async () => {
    const lib = makeTempDir('textmeet-import-');
    const source = join(makeTempDir('textmeet-import-src-'), 'созвон.mp4');
    await videoWithSound(source, 1, '2026-10-04T13:20:05.000000Z');
    const t = setup({ ffmpegPath: () => resolveFfmpegPath() });
    const [id = ''] = (await t.importer.addFiles(lib, [source])).added;
    await until(() => t.imported.length === 1);
    const meeting = await readMeeting(lib, id);
    expect(meeting).toMatchObject({ status: 'recorded', createdAt: '2026-10-04T13:20:05.000Z', title: 'созвон' });
    expect(readFileSync(join(audioDir(lib, id), SOURCE_FILE)).length).toBeGreaterThan(0);
    expect(existsSync(source)).toBe(true);
  });
});

describe('recoverInterruptedImports', () => {
  it('marks a meeting left in import by a crash, but not one being imported now', async () => {
    const lib = makeTempDir('textmeet-import-');
    const crashed = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'a.mp4' });
    const running = await createMeeting(lib, { source: 'import', status: 'importing', sourceFileName: 'b.mp4' });
    const done = await createMeeting(lib, { source: 'import', status: 'done' });
    writeFileSync(join(audioDir(lib, crashed.id), `${SOURCE_FILE}.part`), 'недописано');
    const recovered = await recoverInterruptedImports(lib, quiet(), (id) => id === running.id);
    expect(existsSync(join(audioDir(lib, crashed.id), `${SOURCE_FILE}.part`))).toBe(false);
    expect(recovered).toEqual([crashed.id]);
    expect(await readMeeting(lib, crashed.id)).toMatchObject({
      status: 'error',
      tracks: [],
      errorMessage: importTexts.interrupted,
    });
    expect((await readMeeting(lib, running.id)).status).toBe('importing');
    expect((await readMeeting(lib, done.id)).status).toBe('done');
    expect((await listMeetings(lib)).length).toBe(3);
  });
});
