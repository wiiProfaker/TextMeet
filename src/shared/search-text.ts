// Поиск по тексту встреч — общий для main (поиск по всем встречам) и окна (подсветка в открытой встрече).
// Только чистые функции.

export interface TextRange {
  start: number;
  end: number;
}

export interface TextPiece {
  text: string;
  mark: boolean;
}

/** Нет слова хотя бы из стольких букв — не ищем: на одну букву нашлось бы почти всё. */
export const MIN_QUERY_LETTERS = 2;

/**
 * Для сравнения без учёта регистра и «ё/е». Каждый символ меняется отдельно и только если длина не меняется,
 * поэтому позиции в нормализованной строке совпадают с позициями в исходной.
 */
export function normalize(text: string): string {
  // Быстрый путь: длина не изменилась — каждый символ остался на своём месте.
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower.replaceAll('ё', 'е');
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const next = lower.length === ch.length ? lower : ch;
    out += next === 'ё' ? 'е' : next;
  }
  return out;
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Слова запроса: нормализованы, без знаков по краям («бюджет,» → «бюджет»), без повторов. */
export function queryWords(query: string): string[] {
  const words = normalize(query)
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((word) => word.length > 0);
  return [...new Set(words)];
}

export function isSearchable(query: string): boolean {
  return queryWords(query).some((word) => word.length >= MIN_QUERY_LETTERS);
}

/** В нормализованном тексте есть каждое слово (как часть слова: «бюджет» находит «бюджета»). */
export function matchesAll(normalized: string, words: readonly string[]): boolean {
  return words.length > 0 && words.every((word) => normalized.includes(word));
}

/** Все вхождения всех слов, по порядку; пересекающиеся и соседние слиты. */
export function findRanges(normalized: string, words: readonly string[]): TextRange[] {
  const found: TextRange[] = [];
  for (const word of words) {
    // Пустое слово нашлось бы в каждой позиции бесконечно.
    if (!word) continue;
    for (let at = normalized.indexOf(word); at !== -1; at = normalized.indexOf(word, at + 1)) {
      found.push({ start: at, end: at + word.length });
    }
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Текст кусками: подсвеченные (mark) и обычные — для показа совпадений. */
export function splitByRanges(text: string, ranges: readonly TextRange[]): TextPiece[] {
  const pieces: TextPiece[] = [];
  let at = 0;
  for (const range of ranges) {
    const start = Math.max(at, Math.min(range.start, text.length));
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > at) pieces.push({ text: text.slice(at, start), mark: false });
    pieces.push({ text: text.slice(start, end), mark: true });
    at = end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at), mark: false });
  return pieces;
}

const ELLIPSIS = '…';
/** На сколько символов можно сдвинуть край отрывка, чтобы не резать слово. */
const WORD_SNAP = 15;

/**
 * Кусок длинного текста вокруг первого совпадения (около max символов), с «…» там, где текст обрезан, и
 * совпадениями внутри куска. Края отрывка по возможности не режут слова.
 */
export function snippet(text: string, ranges: readonly TextRange[], max = 80): { text: string; ranges: TextRange[] } {
  if (text.length <= max) return { text, ranges: ranges.map((r) => ({ ...r })) };
  const first = ranges[0] ?? { start: 0, end: 0 };
  let start = Math.max(0, first.start - Math.floor((max - (first.end - first.start)) / 2));
  let end = Math.min(text.length, start + max);
  start = Math.max(0, end - max);
  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space - start <= WORD_SNAP && space < first.start) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space !== -1 && end - space <= WORD_SNAP && space >= first.end) end = space;
  }
  while (start < first.start && text[start] === ' ') start++;
  while (end > first.end && text[end - 1] === ' ') end--;
  const prefix = start > 0 ? ELLIPSIS : '';
  const suffix = end < text.length ? ELLIPSIS : '';
  const shift = prefix.length - start;
  const inside = ranges
    .filter((r) => r.end > start && r.start < end)
    .map((r) => ({ start: Math.max(r.start, start) + shift, end: Math.min(r.end, end) + shift }));
  return { text: prefix + text.slice(start, end) + suffix, ranges: inside };
}
