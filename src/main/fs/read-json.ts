import { promises as fsp } from 'node:fs';
import { z } from 'zod';

export type ReadJsonFailure = { ok: false; reason: 'missing' | 'invalid-json' | 'invalid-data'; message: string };
export type ReadJsonResult<T> = { ok: true; value: T } | ReadJsonFailure;

/** Читает JSON и проверяет его схемой. Отсутствие файла и мусор внутри — не исключения, а результат. */
export async function readJsonFile<S extends z.ZodType>(file: string, schema: S): Promise<ReadJsonResult<z.output<S>>> {
  let text: string;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, reason: 'missing', message: 'файл не найден' };
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (err) {
    return { ok: false, reason: 'invalid-json', message: (err as Error).message };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid-data', message: z.prettifyError(parsed.error) };
  return { ok: true, value: parsed.data };
}
