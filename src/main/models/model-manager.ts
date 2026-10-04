import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { ModelGroupState } from '../../shared/transcription';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { DownloadError, downloadFile, sha256File } from './download';
import { MODEL_FILES, MODEL_GROUP_IDS, modelFilePath, type ModelFile, type ModelGroupId } from './registry';

/** Файл, куда запоминается, какие модели уже проверены по SHA-256 (проверка 320 МБ — пара секунд). */
export const VERIFIED_FILE = 'verified.json';
/** Запас места сверх размера моделей. */
const DISK_MARGIN_BYTES = 50 * 1024 * 1024;
/** Удалять модели, пока они проверяются или скачиваются, нельзя: расшифровка ждёт именно их. */
export const MODELS_ENSURING = 'модели сейчас проверяются или скачиваются';

const VerifiedSchema = z.record(z.string(), z.object({ size: z.number(), mtimeMs: z.number(), sha256: z.string() }));
type Verified = z.infer<typeof VerifiedSchema>;

export interface DownloadProgress {
  done: number;
  total: number;
}

export interface EnsureOptions {
  onProgress?(progress: DownloadProgress): void;
  /** Отмена скачивания (кнопка «Отменить» в карточке модели). */
  signal?: AbortSignal;
}

/** Модели на диске глазами main: ModelManager, а в автотестах — FakeModelStore. */
export interface ModelStore {
  readonly root: string;
  ensure(groups: readonly ModelGroupId[], options?: EnsureOptions): Promise<void>;
  state(): Promise<(ModelGroupState & { id: ModelGroupId })[]>;
  remove(group: ModelGroupId): Promise<void>;
}

const cancelled = (): DownloadError => new DownloadError('cancelled', 'скачивание отменено');

/** Дождаться своей очереди; отмена прерывает ожидание. */
function untilAborted(turn: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return turn;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    void turn.then(() => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) reject(cancelled());
      else resolve();
    });
  });
}

export interface ModelManagerDeps {
  root: string;
  logger: Logger;
  freeBytes(dir: string): Promise<number>;
  files?: readonly ModelFile[];
  download?: typeof downloadFile;
  hash?: (file: string) => Promise<string>;
}

/** Модели на диске: проверка, скачивание недостающих, удаление по группам. */
export class ModelManager implements ModelStore {
  /** Проверки и скачивания идут по одной: две не качают один файл и не делят место на диске. */
  private chain: Promise<void> = Promise.resolve();
  private ensuring = 0;
  private removing: Promise<void> | null = null;
  private readonly files: readonly ModelFile[];

  constructor(private readonly deps: ModelManagerDeps) {
    this.files = deps.files ?? MODEL_FILES;
  }

  get root(): string {
    return this.deps.root;
  }

  /**
   * Файлы групп на месте и целы; недостающие и испорченные скачиваются. Вызовы идут по очереди: второй ждёт первого
   * и находит уже скачанное. Идущее удаление проверка сначала дожидается. Отмена (options.signal) снимает и вызов,
   * который ещё ждёт своей очереди, — сразу, не дожидаясь чужого скачивания.
   */
  ensure(groups: readonly ModelGroupId[], options: EnsureOptions = {}): Promise<void> {
    this.ensuring += 1;
    const removing = this.removing?.catch(() => undefined);
    const turn = this.chain;
    const run = untilAborted(turn, options.signal).then(async () => {
      await removing;
      await this.runEnsure(this.files.filter((f) => groups.includes(f.group)), options);
    });
    // Следующий вызов ждёт и этот, и предыдущий: снятый с очереди вызов не пропускает его вперёд чужого скачивания.
    this.chain = Promise.all([turn, run.catch(() => undefined)]).then(() => undefined);
    return run.finally(() => {
      this.ensuring -= 1;
    });
  }

  /** Группы, у которых есть файлы, в порядке каталога: размер и скачаны ли. */
  async state(): Promise<(ModelGroupState & { id: ModelGroupId })[]> {
    const verified = await this.readVerified();
    const groups = MODEL_GROUP_IDS.filter((id) => this.files.some((f) => f.group === id));
    return Promise.all(
      groups.map(async (id) => {
        const files = this.files.filter((f) => f.group === id);
        const present = await Promise.all(files.map((f) => this.isVerified(f, verified)));
        return { id, sizeBytes: files.reduce((sum, f) => sum + f.size, 0), installed: present.every(Boolean) };
      }),
    );
  }

  /**
   * Удаляет группу моделей вместе с недокачанными кусками. Во время проверки или скачивания (ensure) отказывает:
   * main удаляет только без очереди и без скачивания из каталога.
   */
  remove(group: ModelGroupId): Promise<void> {
    if (this.ensuring > 0) return Promise.reject(new Error(MODELS_ENSURING));
    const previous = this.removing?.catch(() => undefined);
    const removing = (async () => {
      await previous;
      await this.runRemove(group);
    })();
    this.removing = removing;
    return removing.finally(() => {
      if (this.removing === removing) this.removing = null;
    });
  }

  private async runRemove(group: ModelGroupId): Promise<void> {
    const files = this.files.filter((f) => f.group === group);
    for (const file of files) {
      const path = modelFilePath(this.deps.root, file);
      await fsp.rm(path, { force: true, maxRetries: 4, retryDelay: 100 });
      await fsp.rm(`${path}.part`, { force: true });
    }
    const removed = new Set(files.map((f) => f.path));
    const verified = await this.readVerified();
    await this.writeVerified(Object.fromEntries(Object.entries(verified).filter(([path]) => !removed.has(path))));
    this.deps.logger.info(`Модели удалены: ${group}`);
  }

  private async runEnsure(files: readonly ModelFile[], options: EnsureOptions): Promise<void> {
    if (options.signal?.aborted) throw cancelled();
    const onProgress = options.onProgress ?? (() => undefined);
    const verified = await this.readVerified();
    const missing: ModelFile[] = [];
    for (const file of files) {
      if (await this.isVerified(file, verified)) continue;
      if (await this.checkExisting(file, verified)) continue;
      missing.push(file);
    }
    if (missing.length === 0) return;
    if (options.signal?.aborted) throw cancelled();

    const total = missing.reduce((sum, f) => sum + f.size, 0);
    await fsp.mkdir(this.deps.root, { recursive: true }).catch((err: unknown) => {
      throw new DownloadError('disk', 'не удалось создать папку моделей', { cause: err });
    });
    // Уже докачанные куски (.part) место не требуют.
    const partial = await Promise.all(
      missing.map((f) =>
        fsp.stat(`${modelFilePath(this.deps.root, f)}.part`).then(
          // Кусок длиннее файла downloadFile выбросит и начнёт заново — он ничего не экономит.
          (s) => (s.size > f.size ? 0 : s.size),
          () => 0,
        ),
      ),
    );
    const needed = total - partial.reduce((sum, n) => sum + n, 0);
    const free = await this.deps.freeBytes(this.deps.root);
    if (free < needed + DISK_MARGIN_BYTES) {
      throw new DownloadError('space', `мало места: нужно ${needed} байт и запас, свободно ${free}`, {
        neededBytes: needed + DISK_MARGIN_BYTES,
      });
    }
    let finished = 0;
    onProgress({ done: 0, total });
    for (const file of missing) {
      const dest = modelFilePath(this.deps.root, file);
      this.deps.logger.info(`Скачиваем модель ${file.path}`);
      await (this.deps.download ?? downloadFile)({
        url: file.url,
        dest,
        size: file.size,
        sha256: file.sha256,
        onProgress: (bytes) => onProgress({ done: finished + bytes, total }),
        ...(options.signal && { signal: options.signal }),
      });
      finished += file.size;
      verified[file.path] = await this.fingerprint(dest, file.sha256);
      await this.writeVerified(verified);
    }
  }

  /** Файл уже лежит (например, со спайка): проверить сумму один раз и запомнить. */
  private async checkExisting(file: ModelFile, verified: Verified): Promise<boolean> {
    const path = modelFilePath(this.deps.root, file);
    const stats = await fsp.stat(path).catch(() => null);
    if (!stats || stats.size !== file.size) return false;
    const sha = await (this.deps.hash ?? sha256File)(path);
    if (sha !== file.sha256) {
      this.deps.logger.warn(`Модель ${file.path} повреждена — скачаем заново`);
      await fsp.rm(path, { force: true });
      return false;
    }
    verified[file.path] = { size: stats.size, mtimeMs: stats.mtimeMs, sha256: sha };
    await this.writeVerified(verified);
    return true;
  }

  private async isVerified(file: ModelFile, verified: Verified): Promise<boolean> {
    const known = verified[file.path];
    if (!known || known.sha256 !== file.sha256) return false;
    const stats = await fsp.stat(modelFilePath(this.deps.root, file)).catch(() => null);
    return !!stats && stats.size === known.size && stats.mtimeMs === known.mtimeMs;
  }

  private async fingerprint(path: string, sha256: string): Promise<Verified[string]> {
    const stats = await fsp.stat(path);
    return { size: stats.size, mtimeMs: stats.mtimeMs, sha256 };
  }

  /** Список проверенных — только кэш: если он не читается, суммы просто посчитаются заново. */
  private async readVerified(): Promise<Verified> {
    try {
      const result = await readJsonFile(join(this.deps.root, VERIFIED_FILE), VerifiedSchema);
      if (result.ok) return result.value;
      if (result.reason !== 'missing') this.deps.logger.warn(`${VERIFIED_FILE} повреждён — модели проверим заново`, result.message);
    } catch (err) {
      this.deps.logger.warn(`Не удалось прочитать ${VERIFIED_FILE} — модели проверим заново`, err);
    }
    return {};
  }

  /** Записать не удалось — не беда: модели на месте, в следующий раз их суммы посчитаются заново. */
  private async writeVerified(verified: Verified): Promise<void> {
    const file = join(this.deps.root, VERIFIED_FILE);
    try {
      await fsp.mkdir(dirname(file), { recursive: true });
      await writeJsonAtomic(file, verified);
    } catch (err) {
      this.deps.logger.warn(`Не удалось записать ${VERIFIED_FILE}`, err);
    }
  }
}
