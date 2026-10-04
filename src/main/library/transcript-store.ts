import { join } from 'node:path';
import { TranscriptSchema, type Transcript } from '../../shared/transcript';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { withFileLock } from './file-lock';
import { meetingDir } from './library';

export const TRANSCRIPT_FILE = 'transcript.json';
const NO_TRANSCRIPT = 'Текста встречи нет — возможно, его удалили.';

export const transcriptPath = (libraryDir: string, id: string): string =>
  join(meetingDir(libraryDir, id), TRANSCRIPT_FILE);

/** Текст встречи; null — встречу ещё не расшифровывали. Повреждённый файл — ошибка с причиной. */
export async function readTranscript(libraryDir: string, id: string): Promise<Transcript | null> {
  const result = await readJsonFile(transcriptPath(libraryDir, id), TranscriptSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return null;
  throw new Error(`Текст встречи не прочитан: ${result.message}`);
}

const save = (libraryDir: string, id: string, transcript: Transcript): Promise<void> =>
  writeJsonAtomic(transcriptPath(libraryDir, id), TranscriptSchema.parse(transcript));

/** Записать текст целиком (результат расшифровки) — по очереди с правками этой встречи. */
export function writeTranscript(libraryDir: string, id: string, transcript: Transcript): Promise<void> {
  return withFileLock(transcriptPath(libraryDir, id), () => save(libraryDir, id, transcript));
}

/**
 * Прочитать → изменить → записать (правки); незнакомые поля сохраняются. Текста нет — ошибка. change вернул тот же
 * объект — ничего не изменилось, файл не перезаписывается.
 */
export function updateTranscript(
  libraryDir: string,
  id: string,
  change: (transcript: Transcript) => Transcript,
): Promise<Transcript> {
  return withFileLock(transcriptPath(libraryDir, id), async () => {
    const current = await readTranscript(libraryDir, id);
    if (!current) throw new Error(NO_TRANSCRIPT);
    const changed = change(current);
    if (changed === current) return current;
    const next = TranscriptSchema.parse(changed);
    await save(libraryDir, id, next);
    return next;
  });
}
