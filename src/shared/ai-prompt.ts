// «Скопировать для ИИ» (решения Плана 6): запрос, который ставится перед текстом встречи. Нужен и окну (поле в
// настройках), и main (копирование).
import { z } from 'zod';

/** Длиннее запрос в настройках не принимается. */
export const AI_PROMPT_MAX = 4000;

/** Стандартный запрос: пояснение, кто есть кто в расшифровке, и что нужно в итогах. */
export const DEFAULT_AI_PROMPT = [
  'Ниже — расшифровка встречи, сделанная автоматически: в ней могут быть ошибки распознавания. «Я» — это я, «Спикер 2», «Спикер 3» — участники, чьи имена неизвестны.',
  'Сделай итоги встречи по-русски, кратко:',
  '— 3–5 главных пунктов;',
  '— принятые решения;',
  '— задачи: кто, что, к какому сроку;',
  '— открытые вопросы.',
].join('\n');

/** Запрос в настройках: null — стандартный, '' — без запроса, иначе — свой текст. */
/**
 * Вставка не помещается в поле запроса: поле само обрежет её до AI_PROMPT_MAX знаков — окно скажет об этом.
 * length — сколько знаков в поле, selected — сколько из них выделено (их заменит вставка), pasted — длина вставки.
 */
export function pasteCut(field: { length: number; selected: number; pasted: number }): boolean {
  return field.length - field.selected + field.pasted > AI_PROMPT_MAX;
}

export const AiPromptSchema = z.string().max(AI_PROMPT_MAX).nullable();

const normalize = (text: string): string => text.replace(/\r\n?/g, '\n');

/** Как хранить присланный окном текст: стандартный — null (тогда его улучшения в новых версиях дойдут сами). */
export function storedAiPrompt(text: string | null): string | null {
  if (text === null) return null;
  const normalized = normalize(text);
  return normalized === DEFAULT_AI_PROMPT ? null : normalized;
}

/** Текст запроса по значению из настроек. */
export function resolveAiPrompt(stored: string | null): string {
  return stored ?? DEFAULT_AI_PROMPT;
}

/** Запрос, пустая строка, текст встречи. Пустой запрос (одни пробелы) не добавляется. */
export function withAiPrompt(prompt: string, text: string): string {
  const clean = normalize(prompt).trim();
  return clean === '' ? text : `${clean}\n\n${text}`;
}
