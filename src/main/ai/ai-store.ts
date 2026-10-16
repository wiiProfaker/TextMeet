// Файл итогов встречи ai.json (решения Плана 9, §5): чтение, изменение по очереди с блокировкой и атомарная запись —
// как у transcript.json. Испорченный файл не перезаписывается, пока человек сам не сделает новые итоги или не спросит.
import { join } from 'node:path';
import { AiDocSchema, EMPTY_AI_DOC, type AiDoc } from '../../shared/ai';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { withFileLock } from '../library/file-lock';
import { meetingDir } from '../library/library';
import type { Logger } from '../logger';

export const AI_FILE = 'ai.json';

export const aiPath = (libraryDir: string, id: string): string => join(meetingDir(libraryDir, id), AI_FILE);

export interface AiRead {
  doc: AiDoc;
  /** Файл есть, но не прочитался (испорчен) — doc пустой. */
  broken: boolean;
}

/** Итоги встречи; нет файла — пусто. Ошибка системы (файл занят, нет прав) — исключение. */
export async function readAi(libraryDir: string, id: string): Promise<AiRead> {
  const result = await readJsonFile(aiPath(libraryDir, id), AiDocSchema);
  if (result.ok) return { doc: result.value, broken: false };
  return { doc: EMPTY_AI_DOC, broken: result.reason !== 'missing' };
}

/**
 * Прочитать → изменить → записать, по очереди с другими изменениями этого файла. Испорченный файл заменяется (в
 * журнал — только причина: в файле текст встречи). change вернул тот же объект — файл не перезаписывается.
 */
export function updateAi(
  libraryDir: string,
  id: string,
  change: (doc: AiDoc) => AiDoc,
  logger: Pick<Logger, 'warn'>,
): Promise<AiDoc> {
  const file = aiPath(libraryDir, id);
  return withFileLock(file, async () => {
    const current = await readJsonFile(file, AiDocSchema);
    if (!current.ok && current.reason !== 'missing') {
      logger.warn(`Итоги встречи ${id} не прочитались (${current.reason}) — файл заменяется новыми`);
    }
    const doc = current.ok ? current.value : EMPTY_AI_DOC;
    const next = change(doc);
    if (next === doc) return doc;
    const parsed = AiDocSchema.parse(next);
    await writeJsonAtomic(file, parsed);
    return parsed;
  });
}
