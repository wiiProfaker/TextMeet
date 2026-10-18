// Свой llama-server, оставшийся после падения программы (решения Плана 8, §5.1): номер процесса и путь к его exe
// записываются в userData/llama-server.pid при запуске движка и стираются при его выходе. При следующем запуске
// программа завершает оставшийся сервер — только если под этим номером всё ещё наш llama-server (номер могли занять).
import { readFile, rm } from 'node:fs/promises';
import { win32 } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../fs/atomic-write';
import type { Logger } from '../logger';

export interface EnginePidDeps {
  pidFile: string;
  platform: NodeJS.Platform;
  /** Полный путь исполняемого файла процесса (Windows — Get-Process, Mac — `ps -p N -o comm=`); нет такого — null. */
  processImage(pid: number): Promise<string | null>;
  kill(pid: number): void;
  logger: Pick<Logger, 'info' | 'warn'>;
}

const PidRecordSchema = z.object({ pid: z.number().int().positive(), file: z.string().min(1) });

/**
 * Тот же ли это файл движка: полный путь, на Windows — без учёта регистра и вида косой черты. По одному имени нельзя:
 * llama-server.exe бывает и у других программ на llama.cpp.
 */
export function sameEngine(image: string, file: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') return win32.normalize(image.trim()).toLowerCase() === win32.normalize(file).toLowerCase();
  return image.trim() === file;
}

export async function recordEnginePid(deps: EnginePidDeps, pid: number, file: string): Promise<void> {
  await writeFileAtomic(deps.pidFile, JSON.stringify({ pid, file }));
}

export async function clearEnginePid(deps: EnginePidDeps): Promise<void> {
  await rm(deps.pidFile, { force: true });
}

async function readRecord(deps: EnginePidDeps): Promise<z.infer<typeof PidRecordSchema> | null> {
  const text = await readFile(deps.pidFile, 'utf8').catch(() => null);
  if (text === null) return null;
  try {
    const parsed = PidRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Завершает свой оставшийся сервер из прошлого запуска; true — завершил. Файл PID удаляется в любом случае. */
export async function killOrphanEngine(deps: EnginePidDeps): Promise<boolean> {
  const record = await readRecord(deps);
  await clearEnginePid(deps);
  if (!record) return false;
  const image = await deps.processImage(record.pid);
  if (image === null || !sameEngine(image, record.file, deps.platform)) return false;
  try {
    deps.kill(record.pid);
  } catch (err) {
    deps.logger.warn('Не удалось завершить движок итогов, оставшийся с прошлого запуска', err);
    return false;
  }
  deps.logger.info('Завершён движок итогов, оставшийся с прошлого запуска');
  return true;
}
