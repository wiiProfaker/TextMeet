import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';
import { dirname } from 'node:path';

/** Почему не скачалось: нет связи (повторяли), файл пришёл испорченным, не хватает места, не записать на диск. */
export type DownloadFailure = 'network' | 'corrupt' | 'space' | 'disk';

export class DownloadError extends Error {
  constructor(
    readonly kind: DownloadFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

export interface DownloadOptions {
  url: string;
  dest: string;
  size: number;
  sha256: string;
  /** Сколько байт файла уже на диске (вместе с докачанным ранее) — для полоски прогресса. */
  onProgress?(bytesOnDisk: number): void;
  fetch?: typeof fetch;
  /** Сервер молчит дольше — попытка обрывается. */
  idleTimeoutMs?: number;
  /** Повторов после первой попытки при обрыве связи. */
  retries?: number;
  retryDelayMs?: number;
}

export const IDLE_TIMEOUT_MS = 30_000;
export const DOWNLOAD_RETRIES = 3;
export const RETRY_DELAY_MS = 2_000;

/** SHA-256 файла потоком (файлы моделей — сотни мегабайт). */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function sizeOf(file: string): Promise<number> {
  return fsp.stat(file).then(
    (stats) => stats.size,
    () => 0,
  );
}

const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS']);

/** Ответ сервера, который повтором не исправить (нет файла, нет доступа). */
class FinalHttpError extends Error {}
const retryableStatus = (status: number): boolean => status >= 500 || status === 408 || status === 429;
const isDiskError = (err: unknown): boolean => DISK_CODES.has((err as NodeJS.ErrnoException | null)?.code ?? '');

/** Одна попытка: докачивает `.part` с места обрыва (Range), сервер без Range — качает заново. */
async function fetchInto(part: string, options: DownloadOptions): Promise<void> {
  const have = await sizeOf(part);
  if (have === options.size) return;
  if (have > options.size) await fsp.rm(part, { force: true });
  const from = have > options.size ? 0 : have;

  const controller = new AbortController();
  const idleMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  let timer = setTimeout(() => controller.abort(), idleMs);
  const touch = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  try {
    const response = await (options.fetch ?? fetch)(options.url, {
      headers: from > 0 ? { Range: `bytes=${from}-` } : {},
      signal: controller.signal,
    });
    if (response.status !== 200 && response.status !== 206) {
      const message = `сервер ответил ${response.status}`;
      throw retryableStatus(response.status) ? new Error(message) : new FinalHttpError(message);
    }
    if (!response.body) throw new Error('сервер не прислал данных');
    const resumed = response.status === 206 && from > 0;
    const handle = await fsp.open(part, resumed ? 'a' : 'w');
    let done = resumed ? from : 0;
    try {
      for await (const chunk of response.body) {
        touch();
        await handle.write(chunk);
        done += chunk.byteLength;
        options.onProgress?.(done);
      }
    } finally {
      await handle.close();
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Скачивает файл модели: `.part` рядом, докачка после обрыва, повторы, проверка размера и SHA-256,
 * затем переименование. Испорченный файл удаляется — следующая попытка начнёт с нуля.
 */
export async function downloadFile(options: DownloadOptions): Promise<void> {
  const part = `${options.dest}.part`;
  const retries = options.retries ?? DOWNLOAD_RETRIES;
  try {
    await fsp.mkdir(dirname(options.dest), { recursive: true });
  } catch (err) {
    throw new DownloadError('disk', 'не удалось создать папку моделей', { cause: err });
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fetchInto(part, options);
      // Сервер закрыл ответ раньше времени без ошибки — докачиваем, как после обрыва.
      if ((await sizeOf(part)) < options.size) throw new Error('ответ оборвался');
      break;
    } catch (err) {
      if (isDiskError(err)) throw new DownloadError('disk', 'не удалось записать файл модели', { cause: err });
      if (err instanceof FinalHttpError) throw new DownloadError('network', err.message, { cause: err });
      if (attempt >= retries) throw new DownloadError('network', 'нет связи с сервером', { cause: err });
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
    }
  }
  const size = await sizeOf(part);
  const sha = size === options.size ? await sha256File(part) : null;
  if (sha !== options.sha256) {
    await fsp.rm(part, { force: true });
    throw new DownloadError('corrupt', `файл модели повреждён (${size} байт, ожидалось ${options.size})`);
  }
  await fsp.rename(part, options.dest);
}
