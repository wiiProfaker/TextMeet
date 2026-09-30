import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { ModelGroupState } from '../../shared/transcription';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { DownloadError, downloadFile, sha256File } from './download';
import { MODEL_FILES, MODEL_GROUPS, modelFilePath, type ModelFile, type ModelGroupId } from './registry';

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

export interface ModelManagerDeps {
  root: string;
  logger: Logger;
  freeBytes(dir: string): Promise<number>;
  files?: readonly ModelFile[];
  download?: typeof downloadFile;
  hash?: (file: string) => Promise<string>;
}

/** Модели на диске: проверка, скачивание недостающих, удаление по группам. */
export class ModelManager {
  private ensuring: Promise<void> | null = null;
  private removing: Promise<void> | null = null;
  private readonly files: readonly ModelFile[];

  constructor(private readonly deps: ModelManagerDeps) {
    this.files = deps.files ?? MODEL_FILES;
  }

  get root(): string {
    return this.deps.root;
  }

  /**
   * Все модели на месте и целы; недостающие и испорченные скачиваются.
   * Одновременные вызовы ждут одну и ту же проверку; идущее удаление проверка сначала дожидается.
   */
  ensure(onProgress: (progress: DownloadProgress) => void = () => undefined): Promise<void> {
    const removing = this.removing?.catch(() => undefined);
    this.ensuring ??= (async () => {
      await removing;
      await this.runEnsure(onProgress);
    })().finally(() => {
      this.ensuring = null;
    });
    return this.ensuring;
  }

  async state(): Promise<ModelGroupState[]> {
    const verified = await this.readVerified();
    return Promise.all(
      MODEL_GROUPS.map(async (group) => {
        const files = this.files.filter((f) => f.group === group.id);
        const present = await Promise.all(files.map((f) => this.isVerified(f, verified)));
        return {
          id: group.id,
          title: group.title,
          sizeBytes: files.reduce((sum, f) => sum + f.size, 0),
          installed: present.every(Boolean),
        };
      }),
    );
  }

  /** Удаляет группу моделей. Во время проверки или скачивания (ensure) отказывает: main удаляет только без очереди. */
  remove(group: ModelGroupId): Promise<void> {
    if (this.ensuring) return Promise.reject(new Error(MODELS_ENSURING));
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

  private async runEnsure(onProgress: (progress: DownloadProgress) => void): Promise<void> {
    const verified = await this.readVerified();
    const missing: ModelFile[] = [];
    for (const file of this.files) {
      if (await this.isVerified(file, verified)) continue;
      if (await this.checkExisting(file, verified)) continue;
      missing.push(file);
    }
    if (missing.length === 0) return;

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
