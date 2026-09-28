import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import {
  MEETING_ID_PATTERN,
  MeetingSchema,
  type Meeting,
  type MeetingListEntry,
  type MeetingSource,
  type MeetingStatus,
} from '../../shared/meeting';
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
  }
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

/** Все встречи библиотеки, новые сверху. Повреждённые не роняют список, а помечаются. */
export async function listMeetings(libraryDir: string): Promise<MeetingListEntry[]> {
  await fsp.mkdir(libraryDir, { recursive: true });
  const dirents = await fsp.readdir(libraryDir, { withFileTypes: true });
  const ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
  const entries = await Promise.all(ids.map((id) => readEntry(libraryDir, id)));
  return entries.sort((a, b) => entryId(b).localeCompare(entryId(a)));
}

function entryId(entry: MeetingListEntry): string {
  return entry.kind === 'ok' ? entry.meeting.id : entry.id;
}

async function readEntry(libraryDir: string, id: string): Promise<MeetingListEntry> {
  try {
    const result = await readJsonFile(join(libraryDir, id, MEETING_FILE), MeetingSchema);
    if (!result.ok) {
      return { kind: 'broken', id, reason: result.reason === 'missing' ? 'нет файла meeting.json' : result.message };
    }
    if (result.value.id !== id) {
      return { kind: 'broken', id, reason: `id в meeting.json (${result.value.id}) не совпадает с именем папки` };
    }
    return { kind: 'ok', meeting: result.value };
  } catch (err) {
    return { kind: 'broken', id, reason: (err as Error).message };
  }
}
