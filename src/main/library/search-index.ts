import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { MEETING_ID_PATTERN, MeetingSchema } from '../../shared/meeting';
import { SEARCH_HITS_PER_MEETING, SEARCH_MAX_MEETINGS, type SearchMeeting, type SearchResult } from '../../shared/search';
import { aiPlainText } from '../../shared/ai-markdown';
import { findRanges, isSearchable, matchesAll, normalize, queryWords, snippet } from '../../shared/search-text';
import { speakerLabel, type SpeakerId } from '../../shared/transcript';
import { humanFsError } from '../fs/fs-errors';
import { readJsonFile } from '../fs/read-json';
import type { Logger } from '../logger';
import { MEETING_FILE } from './library';
import { AI_FILE, readAi } from '../ai/ai-store';
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

/** Итоги или ответ на свой вопрос — простым текстом, без разметки. */
interface IndexedAi {
  key: string;
  label: string;
  text: string;
  norm: string;
}

/** Вопрос в подписи найденного ответа — не длиннее. */
const QUESTION_LABEL_CHARS = 40;

function questionLabel(question: string): string {
  const short = question.length > QUESTION_LABEL_CHARS ? `${question.slice(0, QUESTION_LABEL_CHARS - 1).trimEnd()}…` : question;
  return `Ответ на «${short}»`;
}

interface IndexedMeeting {
  id: string;
  title: string;
  titleNorm: string;
  createdAt: string;
  speakerNames: Readonly<Record<string, string>>;
  segments: IndexedSegment[];
  ai: IndexedAi[];
}

interface Entry {
  /** Время изменения и размер meeting.json, transcript.json и ai.json: изменились — встречу перечитать. */
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
    let ids: string[];
    try {
      const dirents = await fsp.readdir(dir, { withFileTypes: true });
      ids = dirents.filter((d) => d.isDirectory() && MEETING_ID_PATTERN.test(d.name)).map((d) => d.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw humanFsError('Не удалось прочитать библиотеку', err);
      ids = [];
    }
    // Папку запоминаем только после удачного чтения: не вышло — следующий поиск просмотрит библиотеку заново.
    if (dir !== this.dir) {
      this.entries.clear();
      this.dir = dir;
    }
    const present = new Set(ids);
    for (const id of this.entries.keys()) if (!present.has(id)) this.entries.delete(id);
    for (let at = 0; at < ids.length; at += READ_BATCH) {
      await Promise.all(ids.slice(at, at + READ_BATCH).map((id) => this.update(dir, id)));
    }
  }

  private async update(dir: string, id: string): Promise<void> {
    const folder = join(dir, id);
    const stamp = [MEETING_FILE, TRANSCRIPT_FILE, AI_FILE].map((file) => fileStamp(join(folder, file)));
    const joined = (await Promise.all(stamp)).join('|');
    if (this.entries.get(id)?.stamp === joined) return;
    const { meeting, retry } = await this.read(dir, id);
    // Пока читали, папку библиотеки сменили — эта встреча уже не наша.
    // Сбой чтения (файл занят) — отпечаток не запоминаем: следующее обновление прочитает встречу снова.
    if (this.dir === dir) this.entries.set(id, { stamp: retry ? '' : joined, meeting });
  }

  private async read(dir: string, id: string): Promise<{ meeting: IndexedMeeting | null; retry: boolean }> {
    try {
      const result = await readJsonFile(join(dir, id, MEETING_FILE), MeetingSchema);
      if (!result.ok) {
        if (result.reason !== 'missing') this.deps.logger.warn(`Поиск: встреча ${id} не прочитана — ${result.message}`);
        return { meeting: null, retry: false };
      }
      const meeting = result.value;
      let segments: IndexedSegment[] = [];
      let retry = false;
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
        // Повреждённый текст: встреча ищется хотя бы по названию. Ошибка системы (есть code) — файл занят, перечитаем.
        retry = typeof (err as NodeJS.ErrnoException).code === 'string';
        this.deps.logger.warn(`Поиск: текст встречи ${id} не прочитан`, err);
      }
      let ai: IndexedAi[] = [];
      try {
        // Испорченный ai.json — итогов в поиске нет; файл занят — перечитаем.
        const { doc } = await readAi(dir, id);
        const items = [
          ...(doc.summary ? [{ key: 'summary', label: 'Итоги', text: aiPlainText(doc.summary.text) }] : []),
          ...doc.questions.map((q) => ({ key: `q:${q.id}`, label: questionLabel(q.question), text: aiPlainText(q.answer) })),
        ];
        ai = items.map((item) => ({ ...item, norm: normalize(item.text) }));
      } catch (err) {
        retry = true;
        this.deps.logger.warn(`Поиск: итоги встречи ${id} не прочитаны`, err);
      }
      return {
        meeting: {
          id,
          title: meeting.title,
          titleNorm: normalize(meeting.title),
          createdAt: meeting.createdAt,
          speakerNames: meeting.speakerNames,
          segments,
          ai,
        },
        retry,
      };
    } catch (err) {
      // readJsonFile бросает только ошибки системы (занят, нет доступа) — не кэшируем, перечитаем.
      this.deps.logger.warn(`Поиск: встреча ${id} не прочитана`, err);
      return { meeting: null, retry: true };
    }
  }
}

function searchMeeting(meeting: IndexedMeeting, words: readonly string[]): SearchMeeting | null {
  const titleMatch = matchesAll(meeting.titleNorm, words);
  const matched = meeting.segments.filter((s) => matchesAll(s.norm, words));
  const matchedAi = meeting.ai.filter((a) => matchesAll(a.norm, words));
  if (!titleMatch && matched.length === 0 && matchedAi.length === 0) return null;
  const aiHits = matchedAi.slice(0, SEARCH_HITS_PER_MEETING).map((a) => {
    const cut = snippet(a.text, findRanges(a.norm, words), SNIPPET_CHARS);
    return { key: a.key, label: a.label, text: cut.text, ranges: cut.ranges };
  });
  return {
    meetingId: meeting.id,
    title: meeting.title,
    titleRanges: titleMatch ? findRanges(meeting.titleNorm, words) : [],
    createdAt: meeting.createdAt,
    total: matched.length + matchedAi.length,
    aiHits,
    hits: matched.slice(0, SEARCH_HITS_PER_MEETING - aiHits.length).map((s) => {
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
