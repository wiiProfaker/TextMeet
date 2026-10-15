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

/** Совпадение в итогах встречи или в ответе на свой вопрос (решения Плана 9, §2.3). */
export interface SearchAiHit {
  /** «summary» — итоги; «q:<id>» — ответ на вопрос с этим id. */
  key: string;
  /** Подпись вместо времени реплики: «Итоги», «Ответ на «…»». */
  label: string;
  /** Отрывок вокруг совпадения. */
  text: string;
  ranges: TextRange[];
}

export interface SearchMeeting {
  meetingId: string;
  title: string;
  /** Совпадения в названии; пусто — название не совпало. */
  titleRanges: TextRange[];
  createdAt: string;
  /** Сколько совпадений во встрече всего: реплики, итоги, ответы. */
  total: number;
  /** Совпадения в итогах и ответах — первыми (не больше SEARCH_HITS_PER_MEETING). */
  aiHits: SearchAiHit[];
  /** Первые найденные реплики (вместе с aiHits — не больше SEARCH_HITS_PER_MEETING). */
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
