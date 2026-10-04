// Ответ поиска по всем встречам: main → окно. Только типы.
import type { TextRange } from './search-text';
import type { SpeakerId } from './transcript';

export interface SearchHit {
  segmentId: string;
  /** Начало реплики, секунды. */
  start: number;
  speakerId: SpeakerId;
  /** Подпись спикера (с именами из meeting.json). */
  speaker: string;
  /** Отрывок реплики вокруг совпадения. */
  text: string;
  /** Совпадения в отрывке. */
  ranges: TextRange[];
}

export interface SearchMeeting {
  meetingId: string;
  title: string;
  /** Совпадения в названии; пусто — название не совпало. */
  titleRanges: TextRange[];
  createdAt: string;
  /** Сколько реплик встречи найдено всего. */
  total: number;
  /** Первые найденные реплики (не больше SEARCH_HITS_PER_MEETING). */
  hits: SearchHit[];
}

export interface SearchResult {
  query: string;
  meetings: SearchMeeting[];
  /** Найдено больше SEARCH_MAX_MEETINGS встреч — хвост отброшен. */
  truncated: boolean;
}

export const SEARCH_HITS_PER_MEETING = 3;
export const SEARCH_MAX_MEETINGS = 200;
