import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { folderTrash, moveToTrash, TRASH_ATTEMPTS } from './trash';

const busy = () => Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });

describe('moveToTrash', () => {
  it('moves at the first try', async () => {
    const trash = vi.fn(async () => undefined);
    await moveToTrash('/lib/x', trash, 0);
    expect(trash).toHaveBeenCalledOnce();
  });

  it('tries again while the file is briefly held', async () => {
    const trash = vi
      .fn<(path: string) => Promise<void>>()
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(undefined);
    await moveToTrash('/lib/x', trash, 0);
    expect(trash).toHaveBeenCalledTimes(2);
  });

  it('gives up with a plain reason and never deletes for good', async () => {
    const trash = vi.fn(async () => {
      throw busy();
    });
    await expect(moveToTrash('/lib/x', trash, 0)).rejects.toThrow(
      'Не удалось переместить в Корзину: файл занят другой программой',
    );
    expect(trash).toHaveBeenCalledTimes(TRASH_ATTEMPTS);
  });

  it('does not show the system text of an unknown error (it may contain a path)', async () => {
    const run = moveToTrash('/lib/x', async () => Promise.reject(new Error("Failed to move 'C:\\lib\\x'")), 0);
    await expect(run).rejects.toThrow(
      'Не удалось переместить в Корзину: файл занят другой программой или Корзина недоступна',
    );
    await expect(run).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('C:') }),
    });
  });
});

describe('folderTrash', () => {
  it('moves folders into the test trash folder under unique names', async () => {
    const root = makeTempDir('textmeet-trash-');
    const bin = join(root, 'bin');
    const trash = folderTrash(bin);
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, name, 'audio'), { recursive: true });
      writeFileSync(join(root, name, 'audio', 'mix.opus'), 'x');
    }
    mkdirSync(join(root, 'c', 'audio'), { recursive: true });
    await trash(join(root, 'a', 'audio'));
    await trash(join(root, 'c', 'audio'));
    await trash(join(root, 'b'));
    expect(existsSync(join(root, 'a', 'audio'))).toBe(false);
    expect(existsSync(join(root, 'b'))).toBe(false);
    expect(readdirSync(bin).sort()).toEqual(['1-audio', '2-audio', '3-b']);
  });
});
