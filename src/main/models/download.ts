import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Почему не скачалось: нет связи (повторяли), сервер отказал в файле (403, 404 — повтор не поможет), файл пришёл
 * испорченным, не хватает места, не записать на диск.
 */
export type DownloadFailure = 'network' | 'server' | 'corrupt' | 'space' | 'disk';

export interface DownloadErrorOptions extends ErrorOptions {
  /** Для 'space': сколько свободного места нужно (недостающие файлы и запас), байт. */
  neededBytes?: number;
}

export class DownloadError extends Error {
  readonly neededBytes: number | undefined;

  constructor(
    readonly kind: DownloadFailure,
    message: string,
    options?: DownloadErrorOptions,
  ) {
    super(message, options);
    this.name = 'DownloadError';
    this.neededBytes = options?.neededBytes;
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
  /** На столько байт попытка должна продвинуть файл дальше достигнутого, чтобы счёт повторов начался заново. */
  minProgressBytes?: number;
}

export const IDLE_TIMEOUT_MS = 30_000;
export const DOWNLOAD_RETRIES = 3;
export const RETRY_DELAY_MS = 2_000;
export const MIN_PROGRESS_BYTES = 64 * 1024;

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

/** Сервер прислал больше байт, чем в файле: дальше не пишем — диск не должен заполниться мусором. */
class OversizeError extends Error {}

/** Начало куска из заголовка Content-Range («bytes 4000-9999/10000»); null — заголовка нет или он непонятен. */
function rangeStart(header: string | null): number | null {
  const match = /^bytes (\d+)-/.exec(header ?? '');
  return match ? Number(match[1]) : null;
}

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
    if (response.status === 206 && rangeStart(response.headers.get('content-range')) !== from) {
      // Кусок не с того места: дописать его — испортить файл. Начинаем с нуля (повтором).
      await fsp.rm(part, { force: true });
      throw new Error('сервер прислал не тот кусок файла');
    }
    const resumed = response.status === 206 && from > 0;
    const handle = await fsp.open(part, resumed ? 'a' : 'w');
    let done = resumed ? from : 0;
    try {
      for await (const chunk of response.body) {
        touch();
        if (done + chunk.byteLength > options.size) throw new OversizeError(`сервер прислал больше ${options.size} байт`);
        await handle.write(chunk);
        done += chunk.byteLength;
        options.onProgress?.(done);
      }
    } finally {
      await handle.close();
    }
  } finally {
    clearTimeout(timer);
    // Запрос освобождается при любом исходе (ошибка сервера, нет данных, файл не открылся); после полного чтения — no-op.
    controller.abort();
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
  const minProgress = options.minProgressBytes ?? MIN_PROGRESS_BYTES;
  // Самый длинный .part за всё скачивание: сервер без Range качает с нуля, и рост от нуля — не продвижение.
  let reached = await sizeOf(part);
  for (let attempt = 0; ; attempt++) {
    try {
      await fetchInto(part, options);
      // Сервер закрыл ответ раньше времени без ошибки — докачиваем, как после обрыва.
      if ((await sizeOf(part)) < options.size) throw new Error('ответ оборвался');
      break;
    } catch (err) {
      if (isDiskError(err)) throw new DownloadError('disk', 'не удалось записать файл модели', { cause: err });
      if (err instanceof FinalHttpError) throw new DownloadError('server', err.message, { cause: err });
      if (err instanceof OversizeError) {
        await fsp.rm(part, { force: true });
        throw new DownloadError('corrupt', `файл модели повреждён: ${err.message}`, { cause: err });
      }
      // Попытка заметно продвинула файл дальше прежнего — связь неустойчивая, но живая: следующая попытка снова
      // считается первой. Струйка в сотню байт или перезапуск с нуля повторы не восстанавливают — иначе бесконечно.
      const now = await sizeOf(part);
      if (now >= reached + minProgress) attempt = -1;
      else if (attempt >= retries) throw new DownloadError('network', 'нет связи с сервером', { cause: err });
      reached = Math.max(reached, now);
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
