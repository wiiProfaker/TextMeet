import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';

// OneDrive и антивирус иногда ненадолго держат файл — переименование повторяем.
const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [50, 100, 200, 400];

export type RenameFn = (from: string, to: string) => Promise<void>;

/** Пишет во временный файл рядом, сбрасывает на диск и переименовывает поверх целевого. */
export async function writeFileAtomic(
  file: string,
  data: string | Uint8Array,
  rename: RenameFn = fsp.rename,
): Promise<void> {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    const handle = await fsp.open(tmp, 'w');
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmp, file, rename);
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function renameWithRetry(from: string, to: string, rename: RenameFn): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const delay = RETRY_DELAYS_MS[attempt];
      if (code === undefined || !RETRYABLE_CODES.has(code) || delay === undefined) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
