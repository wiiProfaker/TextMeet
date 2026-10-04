import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, promises as fsp, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import type { Logger } from '../logger';
import { DownloadError, type DownloadOptions } from './download';
import { ModelManager, VERIFIED_FILE } from './model-manager';
import type { ModelFile } from './registry';

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: async () => undefined };
const content = (name: string) => Buffer.from(`model ${name}`);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const G = 'gigaam-v3-e2e-rnnt';
const ALL = [G, 'voices'] as const;
const file = (group: typeof G | 'voices', path: string): ModelFile => ({
  group,
  path,
  url: `https://example.test/${path}`,
  size: content(path).length,
  sha256: sha(content(path)),
});
const FILES = [file(G, 'g/encoder.onnx'), file(G, 'g/tokens.txt'), file('voices', 'v/vad.onnx')];

/** Поддельное скачивание: пишет правильное содержимое и сообщает прогресс. */
const fakeDownload = vi.fn(async (options: DownloadOptions) => {
  const name = FILES.find((f) => f.url === options.url)?.path ?? '';
  mkdirSync(dirname(options.dest), { recursive: true });
  options.onProgress?.(options.size);
  writeFileSync(options.dest, content(name));
});

function manager(root: string, overrides: Partial<ConstructorParameters<typeof ModelManager>[0]> = {}) {
  fakeDownload.mockClear();
  return new ModelManager({
    root,
    logger,
    files: FILES,
    download: fakeDownload,
    freeBytes: async () => 10 ** 12,
    ...overrides,
  });
}

const put = (root: string, path: string, data: Buffer) => {
  const target = join(root, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
};

describe('ModelManager.ensure', () => {
  it('downloads every missing file and reports bytes', async () => {
    const root = makeTempDir();
    const progress: { done: number; total: number }[] = [];
    await manager(root).ensure(ALL, { onProgress: (p) => progress.push(p) });
    expect(fakeDownload).toHaveBeenCalledTimes(3);
    const total = FILES.reduce((sum, f) => sum + f.size, 0);
    expect(progress[0]).toEqual({ done: 0, total });
    expect(progress.at(-1)).toEqual({ done: total, total });
    expect(JSON.parse(readFileSync(join(root, VERIFIED_FILE), 'utf8'))).toHaveProperty(['g/encoder.onnx']);
  });

  it('keeps files that are already there and intact', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, f.path, content(f.path));
    const hash = vi.fn(async (path: string) => sha(readFileSync(path)));
    await manager(root, { hash }).ensure(ALL);
    expect(fakeDownload).not.toHaveBeenCalled();
    expect(hash).toHaveBeenCalledTimes(3);
    // Второй раз суммы не пересчитываются — хватает запомненного.
    hash.mockClear();
    await manager(root, { hash }).ensure(ALL);
    expect(hash).not.toHaveBeenCalled();
  });

  it('replaces a damaged file', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, f.path, content(f.path));
    put(root, 'v/vad.onnx', Buffer.alloc(content('v/vad.onnx').length, 7));
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(root, 'v', 'vad.onnx'))).toEqual(content('v/vad.onnx'));
  });

  it('checks a file again after it changed on disk', async () => {
    const root = makeTempDir();
    await manager(root).ensure(ALL);
    put(root, 'g/tokens.txt', Buffer.from('other'));
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
  });

  it('refuses to start without enough free space', async () => {
    const root = makeTempDir();
    await expect(manager(root, { freeBytes: async () => 10 }).ensure(ALL)).rejects.toMatchObject({ kind: 'space' });
    expect(fakeDownload).not.toHaveBeenCalled();
  });

  it('does not count already downloaded parts as needed space', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, `${f.path}.part`, content(f.path));
    // Места ровно на запас: без учёта .part не хватило бы.
    const m = manager(root, { freeBytes: async () => 50 * 1024 * 1024 + 1 });
    await m.ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('counts a .part longer than the file as nothing downloaded', async () => {
    const root = makeTempDir();
    for (const f of FILES) put(root, `${f.path}.part`, Buffer.alloc(f.size * 100));
    const needed = FILES.reduce((sum, f) => sum + f.size, 0);
    // Места на запас и на файлы целиком — хватает, только если лишние .part не вычтены из нужного.
    const m = manager(root, { freeBytes: async () => 50 * 1024 * 1024 + needed - 1 });
    // Нужное место — недостающие файлы и запас: столько и назовёт сообщение.
    await expect(m.ensure(ALL)).rejects.toMatchObject({ kind: 'space', neededBytes: 50 * 1024 * 1024 + needed });
    await manager(root, { freeBytes: async () => 50 * 1024 * 1024 + needed }).ensure(ALL);
  });

  it('does not fail when the list of checked files cannot be saved', async () => {
    const root = makeTempDir();
    // Папка на месте verified.json: ни прочитать, ни записать.
    mkdirSync(join(root, VERIFIED_FILE), { recursive: true });
    vi.mocked(logger.warn).mockClear();
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
    expect(readFileSync(join(root, 'v', 'vad.onnx'))).toEqual(content('v/vad.onnx'));
    expect(logger.warn).toHaveBeenCalled();
  });

  it('warns about a damaged verified.json instead of silently ignoring it', async () => {
    const root = makeTempDir();
    writeFileSync(join(root, VERIFIED_FILE), '{broken');
    vi.mocked(logger.warn).mockClear();
    await manager(root).state();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(VERIFIED_FILE), expect.anything());
  });

  it('shares one check between callers', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await Promise.all([m.ensure(ALL), m.ensure(ALL)]);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('downloads only the groups asked for', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(['voices']);
    expect(fakeDownload).toHaveBeenCalledTimes(1);
    expect((await m.state()).map((g) => [g.id, g.installed])).toEqual([
      [G, false],
      ['voices', true],
    ]);
  });

  it('runs calls one after another, so a file is downloaded once', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await Promise.all([m.ensure([G]), m.ensure(ALL)]);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });

  it('passes the cancel signal to the download and keeps working after a cancel', async () => {
    const root = makeTempDir();
    const controller = new AbortController();
    const m = manager(root, {
      download: async (options) => {
        if (!options.signal) return fakeDownload(options);
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        throw new DownloadError('cancelled', 'скачивание отменено');
      },
    });
    await expect(m.ensure([G], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    // Уже отменённое не начинается; следующая проверка без отмены идёт как обычно.
    await expect(m.ensure([G], { signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    await m.ensure(['voices']);
    expect((await m.state()).find((g) => g.id === 'voices')?.installed).toBe(true);
  });

  it('drops a cancelled call that is still waiting for its turn, without letting the next one jump the queue', async () => {
    const root = makeTempDir();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const m = manager(root, {
      download: async (options) => {
        order.push(options.dest);
        if (order.length === 1) await gate;
        await fakeDownload(options);
      },
    });
    const first = m.ensure([G]);
    const controller = new AbortController();
    const waiting = m.ensure(['voices'], { signal: controller.signal });
    const third = m.ensure(['voices']);
    controller.abort();
    // Снятый вызов отвечает сразу, хотя первое скачивание ещё идёт.
    await expect(waiting).rejects.toMatchObject({ kind: 'cancelled' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Третий не начал скачивать раньше, чем закончился первый.
    expect(order.some((dest) => dest.endsWith('vad.onnx'))).toBe(false);
    release();
    await Promise.all([first, third]);
    expect((await m.state()).every((g) => g.installed)).toBe(true);
  });

  it('does not keep an installed group waiting for another group download', async () => {
    const root = makeTempDir();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const m = manager(root);
    await m.ensure(['voices']);
    const slow = manager(root, {
      download: async (options) => {
        await gate;
        await fakeDownload(options);
      },
    });
    const downloading = slow.ensure([G]);
    // Голоса уже скачаны: их проверка отвечает, не дожидаясь чужого скачивания.
    await expect(slow.ensure(['voices'])).resolves.toBeUndefined();
    release();
    await downloading;
    expect((await slow.state()).every((g) => g.installed)).toBe(true);
  });

  it('survives a damaged verified.json', async () => {
    const root = makeTempDir();
    writeFileSync(join(root, VERIFIED_FILE), '{broken');
    await manager(root).ensure(ALL);
    expect(fakeDownload).toHaveBeenCalledTimes(3);
  });
});

describe('ModelManager.state and remove', () => {
  it('shows each group with its size and whether it is installed', async () => {
    const root = makeTempDir();
    const m = manager(root);
    expect((await m.state()).map((g) => [g.id, g.installed])).toEqual([
      [G, false],
      ['voices', false],
    ]);
    await m.ensure(ALL);
    const groups = await m.state();
    expect(groups.every((g) => g.installed)).toBe(true);
    expect(groups[0]?.sizeBytes).toBe(FILES[0]!.size + FILES[1]!.size);
  });

  it('removes one group and forgets it was checked', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(ALL);
    await m.remove(G);
    expect(existsSync(join(root, 'g', 'encoder.onnx'))).toBe(false);
    expect(existsSync(join(root, 'v', 'vad.onnx'))).toBe(true);
    expect((await m.state()).map((g) => g.installed)).toEqual([false, true]);
    expect(Object.keys(JSON.parse(readFileSync(join(root, VERIFIED_FILE), 'utf8')))).toEqual(['v/vad.onnx']);
  });

  it('refuses to remove models while they are being checked or downloaded', async () => {
    const root = makeTempDir();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const m = manager(root, {
      download: async (options) => {
        await gate;
        await fakeDownload(options);
      },
    });
    const ensuring = m.ensure(ALL);
    await expect(m.remove(G)).rejects.toThrow('скачиваются');
    release();
    await ensuring;
    expect((await m.state()).every((g) => g.installed)).toBe(true);
    await m.remove(G);
    expect((await m.state()).map((g) => g.installed)).toEqual([false, true]);
  });

  it('checks the models only after a running removal has finished', async () => {
    const root = makeTempDir();
    const m = manager(root);
    await m.ensure(ALL);
    fakeDownload.mockClear();
    // Удаление медленное (антивирус держит файл): без ожидания проверка успела бы признать файлы целыми.
    const rm = fsp.rm.bind(fsp);
    const slowRm = vi.spyOn(fsp, 'rm').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      await rm(...args);
    });
    try {
      const removing = m.remove(G);
      const ensuring = m.ensure(ALL);
      await Promise.all([removing, ensuring]);
    } finally {
      slowRm.mockRestore();
    }
    // Проверка не увидела файлы, которые удаление вот-вот сотрёт: удалённое скачано заново.
    expect(fakeDownload).toHaveBeenCalledTimes(2);
    expect((await m.state()).every((g) => g.installed)).toBe(true);
  });
});
