import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { openTrackFiles } from './track-files';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('openTrackFiles', () => {
  it('writes chunks of each track in order', async () => {
    const dir = makeTempDir();
    const files = await openTrackFiles(dir, ['mic', 'system'], vi.fn());

    files.append('mic', bytes(1, 2));
    files.append('system', bytes(9));
    files.append('mic', bytes(3));
    await files.close();

    expect([...readFileSync(join(dir, 'mic.webm'))]).toEqual([1, 2, 3]);
    expect([...readFileSync(join(dir, 'system.webm'))]).toEqual([9]);
  });

  it('starts every file from scratch', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'mic.webm'), 'old');
    const files = await openTrackFiles(dir, ['mic'], vi.fn());
    await files.close();
    expect(readFileSync(join(dir, 'mic.webm')).length).toBe(0);
  });

  it('ignores chunks of tracks it did not open and chunks after closing', async () => {
    const dir = makeTempDir();
    const files = await openTrackFiles(dir, ['mic'], vi.fn());
    files.append('system', bytes(1));
    await files.close();
    files.append('mic', bytes(1));
    await files.close();
    expect(existsSync(join(dir, 'system.webm'))).toBe(false);
    expect(readFileSync(join(dir, 'mic.webm')).length).toBe(0);
  });

  it('reports the first write error once and stops writing', async () => {
    const error = Object.assign(new Error('no space'), { code: 'ENOSPC' });
    const write = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const files = await openTrackFiles('dir', ['mic'], onError, async () => ({ write, close: async () => undefined }));

    files.append('mic', bytes(1));
    files.append('mic', bytes(2));
    await files.close();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(error);
    expect(write).toHaveBeenCalledOnce();
  });

  it('reports a failure to close a file', async () => {
    const error = new Error('close failed');
    const onError = vi.fn();
    const files = await openTrackFiles('dir', ['mic'], onError, async () => ({
      write: async () => undefined,
      close: async () => {
        throw error;
      },
    }));
    await files.close();
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('closes the files it already opened when opening another one fails', async () => {
    const close = vi.fn(async () => undefined);
    let calls = 0;
    const open = async () => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return { write: async () => undefined, close };
    };
    await expect(openTrackFiles('dir', ['mic', 'system'], vi.fn(), open)).rejects.toMatchObject({ code: 'EBUSY' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails to open when the folder is missing', async () => {
    const dir = join(makeTempDir(), 'нет');
    await expect(openTrackFiles(dir, ['mic', 'system'], vi.fn())).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
