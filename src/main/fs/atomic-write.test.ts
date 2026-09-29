import { promises as fsp, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic, writeJsonAtomic, type RenameFn } from './atomic-write';
import { makeTempDir } from '../../test-support/temp-dir';

const tempDir = () => makeTempDir('textmeet-atomic-');

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('writeFileAtomic', () => {
  it('creates the file with the given content', async () => {
    const dir = tempDir();
    await writeFileAtomic(join(dir, 'a.txt'), 'привет');
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('привет');
  });

  it('replaces an existing file and leaves no temp files', async () => {
    const dir = tempDir();
    const file = join(dir, 'a.txt');
    await writeFileAtomic(file, 'old');
    await writeFileAtomic(file, 'new');
    expect(readFileSync(file, 'utf8')).toBe('new');
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('retries rename on EPERM and succeeds', async () => {
    const dir = tempDir();
    let calls = 0;
    const flakyRename: RenameFn = async (from, to) => {
      calls += 1;
      if (calls <= 2) throw errnoError('EPERM');
      await fsp.rename(from, to);
    };
    await writeFileAtomic(join(dir, 'a.txt'), 'x', flakyRename);
    expect(calls).toBe(3);
    expect(readdirSync(dir)).toEqual(['a.txt']);
  });

  it('gives up after the retries and removes the temp file', async () => {
    const dir = tempDir();
    const alwaysBusy: RenameFn = async () => {
      throw errnoError('EBUSY');
    };
    await expect(writeFileAtomic(join(dir, 'a.txt'), 'x', alwaysBusy)).rejects.toThrow('EBUSY');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('does not retry non-retryable errors', async () => {
    const dir = tempDir();
    let calls = 0;
    const broken: RenameFn = async () => {
      calls += 1;
      throw errnoError('EXDEV');
    };
    await expect(writeFileAtomic(join(dir, 'a.txt'), 'x', broken)).rejects.toThrow('EXDEV');
    expect(calls).toBe(1);
  });

  it('rejects when the folder does not exist', async () => {
    const dir = tempDir();
    await expect(writeFileAtomic(join(dir, 'missing', 'a.txt'), 'x')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('writeJsonAtomic', () => {
  it('writes pretty JSON with a trailing newline', async () => {
    const dir = tempDir();
    await writeJsonAtomic(join(dir, 'a.json'), { a: 1 });
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});
