import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { MEETING_ID_PATTERN, MeetingSchema } from '../../shared/meeting';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS, type SearchMeeting, type SearchResult } from '../../shared/search';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet } from '../../shared/search-text';
import { speakerLabel, type SpeakerId } from '../../shared/transcript';
import { humanFsError } from '../fs/fs-errors';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { MEETING_FILE } from './library';
import { readTranscript, TRANSCRIPT_FILE } from './transcript-store';

/** Сколько встреч поиск читает одновременно: тысячи открытых файлов разом упёрлись бы в предел системы. */
const READ_BATCH = 32;

/** Длина отрывка реплики в найденном. */
const SNIPPET_CHARS = 80;

interface IndexedSegment {
  id: string;
  start: number;
  speakerId: SpeakerId;
  text: string;
  norm: string;
}

interface IndexedMeeting {
  id: string;
  title: string;
  titleNorm: string;
  createdAt: string;
  speakerNames: Readonly<Record<string, string>>;
  segments: IndexedSegment[];
}

interface Entry {
  /** Время изменения и размер meeting.json и transcript.json: изменились — встречу перечитать. */
  stamp: string;
  /** null — встречу не удалось прочитать (в поиске её нет). */
  meeting: IndexedMeeting | null;
}

export interface SearchIndexDeps {
  libraryDir(): string;
  logger: Logger;
}

async function fileStamp(file: string): Promise<string> {
  try {
    const stat = await fsp.stat(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return '-';
  }
}

/**
 * Поиск по всем встречам: тексты и названия в памяти. Обновление перечитывает только изменившиеся встречи (по
 * времени изменения файлов), поэтому его можно звать часто — при каждом перечитывании списка встреч.
 */
export class SearchIndex {
  private readonly entries = new Map<string, Entry>();
  private dir: string | null = null;
  private running: Promise<void> | null = null;
  private pending: Promise<void> | null = null;

  constructor(private readonly deps: SearchIndexDeps) {}

  /** Обновить по диску. Вызовы во время обновления склеиваются в одно следующее. */
  refresh(): Promise<void> {
    if (this.running) {
      this.pending ??= this.running
        .catch(() => undefined)
        .then(() => {
          this.pending = null;
          return this.refresh();
        });
      return this.pending;
    }
    this.running = this.scan().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Встречу изменила сама программа: перечитать её при следующем обновлении, даже если время файлов то же. */
  invalidate(meetingId: string): void {
    const entry = this.entries.get(meetingId);
    if (entry) entry.stamp = '';
  }

  remove(meetingId: string): void {
    this.entries.delete(meetingId);
  }

  async search(query: string): Promise<SearchResult> {
    if (!isSearchable(query)) return { query, meetings: [], truncated: false };
    if (this.pending || this.running) await (this.pending ?? this.running);
    if (this.dir !== this.deps.libraryDir()) await this.refresh();
    const words = queryWords(query);
    const meetings = [...this.entries.values()]
      .flatMap((entry) => (entry.meeting ? [entry.meeting] : []))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const found: SearchMeeting[] = [];
    for (const meeting of meetings) {
      const result = searchMeeting(meeting, words);
      if (!result) continue;
      if (found.length === SEARCH_MAX_MEETINGS) return { query, meetings: found, truncated: true };
      found.push(result);
    }
    return { query, meetings: found, truncated: false };
  }

  private async scan(): Promise<void> {
    const dir = this.deps.libraryDir();
    if (dir !== this.dir) {
      this.entries.clear();
      this.dir = dir;
    }
    let ids: string[];
    try {
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw humanFsError('Не удалось прочитать библиотеку', err);
      ids = [];
    }
    const present = new Set(ids);
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
    for (let at = 0; at < ids.length; at += READ_BATCH) {
      await Promise.all(ids.slice(at, at + READ_BATCH).map((id) => this.update(dir, id)));
    }
  }

  private async update(dir: string, id: string): Promise<void> {
    const folder = join(dir, id);
    const stamp = `${await fileStamp(join(folder, MEETING_FILE))}|${await fileStamp(join(folder, TRANSCRIPT_FILE))}`;
    if (this.entries.get(id)?.stamp === stamp) return;
    const meeting = await this.read(dir, id);
    // Пока читали, папку библиотеки сменили — эта встреча уже не наша.
    if (this.dir === dir) this.entries.set(id, { stamp, meeting });
  }

  private async read(dir: string, id: string): Promise<IndexedMeeting | null> {
    try {
      const result = await readJsonFile(join(dir, id, MEETING_FILE), MeetingSchema);
      if (!result.ok) {
        if (result.reason !== 'missing') this.deps.logger.warn(`Поиск: встреча ${id} не прочитана — ${result.message}`);
        return null;
      }
      const meeting = result.value;
      let segments: IndexedSegment[] = [];
      try {
        const transcript = await readTranscript(dir, id);
        segments = (transcript?.segments ?? []).map((s) => ({
          id: s.id,
          start: s.start,
          speakerId: s.speakerId,
          text: s.text,
          norm: normalize(s.text),
        }));
      } catch (err) {
        // Повреждённый текст: встреча ищется хотя бы по названию.
        this.deps.logger.warn(`Поиск: текст встречи ${id} не прочитан`, err);
      }
      return {
        id,
        title: meeting.title,
        titleNorm: normalize(meeting.title),
        createdAt: meeting.createdAt,
        speakerNames: meeting.speakerNames,
        segments,
      };
    } catch (err) {
      this.deps.logger.warn(`Поиск: встреча ${id} не прочитана`, err);
      return null;
    }
  }
}

function searchMeeting(meeting: IndexedMeeting, words: readonly string[]): SearchMeeting | null {
  const titleMatch = matchesAll(meeting.titleNorm, words);
  const matched = meeting.segments.filter((s) => matchesAll(s.norm, words));
  if (!titleMatch && matched.length === 0) return null;
  return {
    meetingId: meeting.id,
    title: meeting.title,
    titleRanges: titleMatch ? findRanges(meeting.titleNorm, words) : [],
    createdAt: meeting.createdAt,
    total: matched.length,
    hits: matched.slice(0, SEARCH_HITS_PER_MEETING).map((s) => {
      const cut = snippet(s.text, findRanges(s.norm, words), SNIPPET_CHARS);
      return {
        segmentId: s.id,
        start: s.start,
        speakerId: s.speakerId,
        speaker: speakerLabel(s.speakerId, meeting.speakerNames),
        text: cut.text,
        ranges: cut.ranges,
      };
    }),
  };
}
