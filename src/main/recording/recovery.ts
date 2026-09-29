import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import type { Meeting, Track, TrackKind } from '../../shared/meeting';
import { TRACK_FILES } from '../../shared/recording';
import { existingInputs } from '../audio/mixer';
import { audioDir, listMeetings, readMeeting, updateMeeting } from '../library/library';
import type { Logger } from '../logger';

export const INTERRUPTED_WITHOUT_AUDIO = 'Запись прервалась, звук не сохранился.';

const KINDS: readonly TrackKind[] = ['mic', 'system'];

/** Дорожки по файлам на диске — если сбой случился раньше, чем их записали в meeting.json. */
async function tracksOnDisk(dir: string): Promise<Track[]> {
  const tracks: Track[] = [];
  for (const kind of KINDS) {
    const exists = await fsp.access(join(dir, TRACK_FILES[kind])).then(
      () => true,
      () => false,
    );
    if (exists) tracks.push({ kind, file: TRACK_FILES[kind], startOffsetMs: 0 });
  }
  return tracks;
}

/**
 * Закрывает прерванную запись: «записано» с пометкой «восстановлена после сбоя»,
 * а если звука не осталось — «ошибка». Длительность заполнит сведение (mixer).
 * У «ошибки» дорожек нет: пустые файлы сводить нечего, а с дорожками встреча вечно ждала бы сведения.
 */
export async function finalizeInterrupted(libraryDir: string, meetingId: string): Promise<Meeting> {
  const meeting = await readMeeting(libraryDir, meetingId);
  const dir = audioDir(libraryDir, meetingId);
  const tracks = meeting.tracks.length > 0 ? meeting.tracks : await tracksOnDisk(dir);
  const hasAudio = (await existingInputs(dir, tracks)).length > 0;
  return updateMeeting(libraryDir, meetingId, (m) =>
    hasAudio
      ? { ...m, status: 'recorded', recovered: true, tracks }
      : { ...m, status: 'error', recovered: true, tracks: [], errorMessage: INTERRUPTED_WITHOUT_AUDIO },
  );
}

/**
 * При запуске: встречи в статусе «идёт запись» — это записи, прерванные сбоем.
 * isActive — запись, которую программа ведёт прямо сейчас (её могли начать клавишей сразу после запуска).
 */
export async function recoverInterruptedRecordings(
  libraryDir: string,
  logger: Logger,
  isActive: (meetingId: string) => boolean = () => false,
): Promise<Meeting[]> {
  const entries = await listMeetings(libraryDir);
  const recovered: Meeting[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'ok' || entry.meeting.status !== 'recording' || isActive(entry.meeting.id)) continue;
    try {
      recovered.push(await finalizeInterrupted(libraryDir, entry.meeting.id));
      logger.warn(`Восстановлена прерванная запись ${entry.meeting.id}`);
    } catch (err) {
      logger.error(`Не удалось восстановить запись ${entry.meeting.id}`, err);
    }
  }
  return recovered;
}
