// Что видит модель (решения Плана 9, §4.2): скрытые правила, текст встречи, затем задание — запрос для ИИ (итоги) или
// вопрос. Текст встречи — в начале: у вопроса после итогов та же начальная часть, и движок не перечитывает встречу.
import { createHash } from 'node:crypto';
import { DEFAULT_AI_PROMPT, resolveAiPrompt } from '../../shared/ai-prompt';
import { toPlainText, type ExportDoc } from '../../shared/export-doc';
import type { ChatMessage } from './llm-client';

/** Скрытые правила: без них модель натягивала «решения» и «задачи» на интервью (решения Плана 9, §9). */
export const AI_RULES =
  'Ты помогаешь разобраться во встрече по её автоматической расшифровке (в ней бывают ошибки распознавания). ' +
  'Отвечай по-русски, только по тексту встречи. Если в разговоре чего-то нет, так и напиши — не придумывай. ' +
  'Рекламные вставки не учитывай.';

/** Предел ответа, «кусочков»: итоги и ответ на вопрос. */
export const SUMMARY_MAX_TOKENS = 2048;
export const QUESTION_MAX_TOKENS = 1024;
/** Сколько окна модели оставлено под ответ: встреча длиннее окна без него не отправляется. */
export const ANSWER_RESERVE_TOKENS = 2048;

/** Сообщения для модели: правила; «Текст встречи:», пустая строка, текст встречи, «---», задание. */
export function aiMessages(meetingText: string, task: string): ChatMessage[] {
  return [
    { role: 'system', content: AI_RULES },
    { role: 'user', content: `Текст встречи:\n\n${meetingText}---\n${task}` },
  ];
}

/** Задание для итогов: запрос для ИИ из настроек; пустой — стандартный: без задания модели нечего делать. */
export function summaryTask(stored: string | null): string {
  const prompt = resolveAiPrompt(stored);
  return prompt.trim() === '' ? DEFAULT_AI_PROMPT : prompt;
}

/** Текст встречи для модели — как у «Скопировать всё» (с правками и именами спикеров). */
export const meetingText = (doc: ExportDoc): string => toPlainText(doc);

/**
 * Отпечаток текста встречи, который видела модель. Название не входит: переименование встречи — не правка текста, и
 * пометка «текст меняли» из-за него не появляется.
 */
export function sourceHash(doc: ExportDoc): string {
  const text = toPlainText({ title: '', metaLine: doc.metaLine, participantsLine: doc.participantsLine, paragraphs: doc.paragraphs });
  return createHash('sha256').update(text).digest('hex');
}

/** Встреча с запросом помещается в окно модели, и ещё остаётся место под ответ. */
export const fitsWindow = (tokens: number, contextTokens: number): boolean =>
  tokens + ANSWER_RESERVE_TOKENS <= contextTokens;
