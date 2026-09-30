import { join } from 'node:path';
import { TranscriptSchema, type Transcript } from '../../shared/transcript';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { meetingDir } from './library';

export const TRANSCRIPT_FILE = 'transcript.json';

export const transcriptPath = (libraryDir: string, id: string): string =>
  join(meetingDir(libraryDir, id), TRANSCRIPT_FILE);

/** Текст встречи; null — встречу ещё не расшифровывали. Повреждённый файл — ошибка с причиной. */
export async function readTranscript(libraryDir: string, id: string): Promise<Transcript | null> {
  const result = await readJsonFile(transcriptPath(libraryDir, id), TranscriptSchema);
  if (result.ok) return result.value;
  if (result.reason === 'missing') return null;
  throw new Error(`Текст встречи не прочитан: ${result.message}`);
}

export async function writeTranscript(libraryDir: string, id: string, transcript: Transcript): Promise<void> {
  await writeJsonAtomic(transcriptPath(libraryDir, id), TranscriptSchema.parse(transcript));
}
