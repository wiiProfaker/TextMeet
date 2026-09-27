import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readJsonFile } from './read-json';

const Schema = z.object({ n: z.number() });
const tempDir = () => mkdtempSync(join(tmpdir(), 'textmeet-readjson-'));

describe('readJsonFile', () => {
  it('returns the parsed value', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{"n": 5}');
    expect(await readJsonFile(file, Schema)).toEqual({ ok: true, value: { n: 5 } });
  });

  it('accepts a UTF-8 BOM', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '\uFEFF{"n": 1}');
    expect(await readJsonFile(file, Schema)).toEqual({ ok: true, value: { n: 1 } });
  });

  it('reports a missing file', async () => {
    const result = await readJsonFile(join(tempDir(), 'none.json'), Schema);
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('reports broken JSON', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{oops');
    expect(await readJsonFile(file, Schema)).toMatchObject({ ok: false, reason: 'invalid-json' });
  });

  it('reports data that does not match the schema, naming the field', async () => {
    const file = join(tempDir(), 'a.json');
    writeFileSync(file, '{"n": "five"}');
    const result = await readJsonFile(file, Schema);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-data' });
    expect(result.ok ? '' : result.message).toContain('n');
  });

  it('rethrows other file errors', async () => {
    // Чтение папки как файла — ошибка EISDIR, а не «файла нет».
    await expect(readJsonFile(tempDir(), Schema)).rejects.toMatchObject({ code: expect.any(String) });
  });
});
