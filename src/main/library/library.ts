import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import {
  entryId,
  MEETING_ID_PATTERN,
  MeetingSchema,
  type Meeting,
  type MeetingListEntry,
  type MeetingSource,
  type MeetingStatus,
} from '../../shared/meeting';
import { MIX_FILE } from '../../shared/recording';
import { writeJsonAtomic } from '../fs/atomic-write';
import { readJsonFile } from '../fs/read-json';
import { defaultMeetingTitle, makeMeetingId, randomMeetingSuffix } from './naming';

export const MEETING_FILE = 'meeting.json';
export const AUDIO_DIR = 'audio';
const MAX_ID_ATTEMPTS = 3;

/** Путь к папке встречи. id проверяется, чтобы из IPC нельзя было выйти за пределы библиотеки. */
export function meetingDir(libraryDir: string, id: string): string {
  if (!MEETING_ID_PATTERN.test(id)) throw new RangeError(`Неверный id встречи: ${id}`);
  return join(libraryDir, id);
}

export function audioDir(libraryDir: string, id: string): string {
  return join(meetingDir(libraryDir, id), AUDIO_DIR);
}

export interface NewMeeting {
  source: MeetingSource;
  status: MeetingStatus;
  title?: string;
  now?: Date;
  randomSuffix?: () => string;
}

export async function createMeeting(libraryDir: string, input: NewMeeting): Promise<Meeting> {
  const now = input.now ?? new Date();
  const nextSuffix = input.randomSuffix ?? randomMeetingSuffix;
  await fsp.mkdir(libraryDir, { recursive: true });

  for (let attempt = 1; ; attempt++) {
    const id = makeMeetingId(now, nextSuffix());
    const dir = meetingDir(libraryDir, id);
    try {
      await fsp.mkdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST' && attempt < MAX_ID_ATTEMPTS) continue;
      throw err;
    }
    try {
      await fsp.mkdir(join(dir, AUDIO_DIR));
      const meeting = MeetingSchema.parse({
        schemaVersion: 1,
        id,
        title: input.title ?? defaultMeetingTitle(now),
        createdAt: now.toISOString(),
        durationSec: null,
        source: input.source,
        participantsHint: null,
        model: null,
        status: input.status,
        errorMessage: null,
        speakerNames: {},
      });
      await writeJsonAtomic(join(dir, MEETING_FILE), meeting);
      return meeting;
    } catch (err) {
      // Не оставляем полусозданную папку: в списке она висела бы «создаётся» навсегда.
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }
}

/** Удаляет папку встречи целиком (например, запись не началась — в ней ничего нет). */
export async function removeMeetingDir(libraryDir: string, id: string): Promise<void> {
  await fsp.rm(meetingDir(libraryDir, id), { recursive: true, force: true });
}

export async function readMeeting(libraryDir: string, id: string): Promise<Meeting> {
  const result = await readJsonFile(join(meetingDir(libraryDir, id), MEETING_FILE), MeetingSchema);
  if (!result.ok) throw new Error(`Встреча ${id} не прочитана: ${result.message}`);
  return result.value;
}

export async function saveMeeting(libraryDir: string, meeting: Meeting): Promise<void> {
  const valid = MeetingSchema.parse(meeting);
  await writeJsonAtomic(join(meetingDir(libraryDir, valid.id), MEETING_FILE), valid);
}

// Одну встречу могут менять почти одновременно (конец записи, сведение, ответ в окне «Запись остановлена»):
// изменения одной встречи выполняются строго по очереди, чтобы ни одно не потерялось.
const updateQueues = new Map<string, Promise<unknown>>();

/** Прочитать → изменить → записать; незнакомые поля meeting.json сохраняются. */
export function updateMeeting(
  libraryDir: string,
  id: string,
  change: (meeting: Meeting) => Meeting,
): Promise<Meeting> {
  const key = meetingDir(libraryDir, id);
  const previous = updateQueues.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    const next = change(await readMeeting(libraryDir, id));
    await saveMeeting(libraryDir, next);
    return MeetingSchema.parse(next);
  });
  const settled = run.catch(() => undefined);
  updateQueues.set(key, settled);
  void settled.then(() => {
    if (updateQueues.get(key) === settled) updateQueues.delete(key);
  });
  return run;
}

/** Все встречи библиотеки, новые сверху. Повреждённые не роняют список, а помечаются. */
export async function listMeetings(libraryDir: string): Promise<MeetingListEntry[]> {
  await fsp.mkdir(libraryDir, { recursive: true });
  const dirents = await fsp.readdir(libraryDir, { withFileTypes: true });
  const ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
  const entries = await Promise.all(ids.map((id) => readEntry(libraryDir, id)));
  return entries.sort((a, b) => entryId(b).localeCompare(entryId(a)));
}

async function fileExists(file: string): Promise<boolean> {
  return fsp.access(file).then(
    () => true,
    () => false,
  );
}

async function readEntry(libraryDir: string, id: string): Promise<MeetingListEntry> {
  try {
    const result = await readJsonFile(join(libraryDir, id, MEETING_FILE), MeetingSchema);
    if (!result.ok) {
      if (result.reason === 'missing') return { kind: 'creating', id };
      return { kind: 'broken', id, reason: result.message };
    }
    if (result.value.id !== id) {
      return { kind: 'broken', id, reason: `id в meeting.json (${result.value.id}) не совпадает с именем папки` };
    }
    const mixReady = await fileExists(join(libraryDir, id, AUDIO_DIR, MIX_FILE));
    return { kind: 'ok', meeting: result.value, mixReady };
  } catch (err) {
    return { kind: 'broken', id, reason: (err as Error).message };
  }
}
