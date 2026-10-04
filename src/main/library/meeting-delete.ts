// «Удалить аудио» и «Удалить встречу»: всё — в Корзину, ничего не стирается насовсем.
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../shared/meeting';
import type { Logger } from '../logger';
import { audioDir, meetingDir, readMeeting, updateMeeting } from './library';
import { moveToTrash, type Trash } from './trash';

export const deleteTexts = {
  recording: 'Эта встреча сейчас записывается — сначала остановите запись.',
  transcribing: 'Аудио нельзя удалить, пока встреча ждёт расшифровки или расшифровывается.',
  mixing: 'Запись ещё готовится к прослушиванию — удалите аудио чуть позже.',
  noAudio: 'Аудио этой встречи уже удалено.',
} as const;

export interface DeleteDeps {
  libraryDir(): string;
  trash: Trash;
  /** Эта встреча сейчас записывается. */
  isRecording(meetingId: string): boolean;
  transcription: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    enqueue(libraryDir: string, meetingId: string): Promise<void>;
  };
  mixer: {
    cancel(libraryDir: string, meetingId: string): Promise<void>;
    isPending(libraryDir: string, meetingId: string): boolean;
    enqueue(libraryDir: string, meetingId: string): void;
  };
  logger: Pick<Logger, 'warn'>;
  /** Убрать окно «Запись остановлена» этой встречи (открытое или ждущее). */
  dropStopDialog(meetingId: string): void;
  /** Пауза между попытками переноса в Корзину (в тестах — 0). */
  trashRetryMs?: number;
}

/** Размер файлов папки audio/ — для окна «Удалить аудио?». Папки нет — 0. */
export async function audioSize(libraryDir: string, meetingId: string): Promise<number> {
  const dir = audioDir(libraryDir, meetingId);
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    names.map((name) =>
      fsp.stat(join(dir, name)).then(
        (stat) => (stat.isFile() ? stat.size : 0),
        () => 0,
      ),
    ),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

const exists = (path: string): Promise<boolean> =>
  fsp.access(path).then(
    () => true,
    () => false,
  );

/** Аудио — в Корзину; текст остаётся. Встреча больше не сводится и не расшифровывается: дорожек у неё нет. */
export async function deleteAudio(deps: DeleteDeps, meetingId: string): Promise<Meeting> {
  const libraryDir = deps.libraryDir();
  const meeting = await readMeeting(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  if (meeting.status === 'queued' || meeting.status === 'transcribing') throw new Error(deleteTexts.transcribing);
  if (deps.mixer.isPending(libraryDir, meetingId)) throw new Error(deleteTexts.mixing);
  if (meeting.audioDeleted) throw new Error(deleteTexts.noAudio);
  const dir = audioDir(libraryDir, meetingId);
  if (await exists(dir)) await moveToTrash(dir, deps.trash, deps.trashRetryMs);
  return updateMeeting(libraryDir, meetingId, (m) => ({ ...m, tracks: [], audioDeleted: true }));
}

/**
 * Папку встречи — в Корзину. Сначала отменяются её расшифровка и сведение (они держат файлы); после переноса
 * убирается её окно «Запись остановлена». Перенос не удался — отменённое ставится обратно, иначе встреча так и висела
 * бы «в очереди» без задачи, а запись — «готовится». Работает и для папки, которую не удалось прочитать.
 */
export async function deleteMeeting(deps: DeleteDeps, meetingId: string): Promise<void> {
  const libraryDir = deps.libraryDir();
  const dir = meetingDir(libraryDir, meetingId);
  if (deps.isRecording(meetingId)) throw new Error(deleteTexts.recording);
  const status = await readMeeting(libraryDir, meetingId).then(
    (meeting) => meeting.status,
    () => null,
  );
  const wasMixing = deps.mixer.isPending(libraryDir, meetingId);
  await deps.transcription.cancel(libraryDir, meetingId);
  await deps.mixer.cancel(libraryDir, meetingId);
  try {
    await moveToTrash(dir, deps.trash, deps.trashRetryMs);
  } catch (err) {
    if (status === 'queued' || status === 'transcribing') {
      await deps.transcription
        .enqueue(libraryDir, meetingId)
        .catch((requeueErr: unknown) => deps.logger.warn(`Встреча ${meetingId} не вернулась в очередь`, requeueErr));
    }
    if (wasMixing) deps.mixer.enqueue(libraryDir, meetingId);
    throw err;
  }
  deps.dropStopDialog(meetingId);
}
