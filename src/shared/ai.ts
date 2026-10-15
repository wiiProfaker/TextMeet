// Итоги встречи и свои вопросы (решения Плана 9, §2.2, §5): файл ai.json в папке встречи и что main сообщает окну о
// работе модели. Схемы (zod) нужны только main; окно и preload берут отсюда типы.
import { z } from 'zod';

/** Свой вопрос к встрече — не длиннее. */
export const AI_QUESTION_MAX = 1000;

/** done — ответ дописан; stopped — человек нажал «Остановить» (или вышел из программы), написанное сохранено. */
export const AiAnswerStatusSchema = z.enum(['done', 'stopped']);
export type AiAnswerStatus = z.infer<typeof AiAnswerStatusSchema>;

const answerFields = {
  /** Модель из каталога (id) и её название — название показывается, даже если модель потом убрали из каталога. */
  model: z.string().max(100),
  modelTitle: z.string().max(200),
  createdAt: z.iso.datetime(),
  status: AiAnswerStatusSchema.default('done'),
};

export const AiSummarySchema = z.object({
  text: z.string(),
  ...answerFields,
  /** SHA-256 текста встречи, который видела модель: не совпал с нынешним — «Текст встречи меняли после итогов». */
  sourceHash: z.string().max(100),
});

export const AiQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  question: z.string().max(AI_QUESTION_MAX),
  answer: z.string(),
  ...answerFields,
});

export const AiDocSchema = z.object({
  version: z.literal(1).default(1),
  summary: AiSummarySchema.nullable().default(null),
  /** От старых к новым. */
  questions: z.array(AiQuestionSchema).default([]),
});

export type AiSummary = z.infer<typeof AiSummarySchema>;
export type AiQuestion = z.infer<typeof AiQuestionSchema>;
export type AiDoc = z.infer<typeof AiDocSchema>;

export const EMPTY_AI_DOC: AiDoc = { version: 1, summary: null, questions: [] };

/** Итоги и вопросы встречи глазами окна. */
export interface AiMeetingView {
  doc: AiDoc;
  /** ai.json не прочитался (испорчен): блок пуст, файл не трогаем, пока не сделают новые итоги или не спросят. */
  broken: boolean;
  /** Текст встречи меняли после итогов (правки, имена спикеров, «Расшифровать заново»). */
  stale: boolean;
}

export type AiJobKind = 'summary' | 'question';
/** loading — модель загружается в память («Готовим модель…»), reading — читает встречу, writing — пишет. */
export type AiJobStage = 'loading' | 'reading' | 'writing';

/** Запрос, который модель выполняет сейчас (один на всю программу). */
export interface AiJob {
  meetingId: string;
  meetingTitle: string;
  kind: AiJobKind;
  /** Вопрос; у итогов — null. */
  question: string | null;
  modelTitle: string;
  stage: AiJobStage;
  /** Написанное к этому моменту. */
  text: string;
}

/** Почему запрос не удался: встреча не поместилась, модель не ответила, ответ не сохранился. */
export type AiFailureKind = 'too-long' | 'engine' | 'save';

export interface AiFailure {
  meetingId: string;
  kind: AiJobKind;
  question: string | null;
  failure: AiFailureKind;
  /** Причина для человека. */
  message: string;
  /** Ответ, который не сохранился, — виден в блоке до ухода со встречи; в остальных случаях null. */
  text: string | null;
}

export interface AiState {
  job: AiJob | null;
  /** Последняя неудача по встрече — до следующего запроса по ней или до ухода со встречи. */
  failures: AiFailure[];
}

/** Ответ на «Итоги встречи» и «Спросить»: started — запрос пошёл; no-model — модель не скачана; busy — модель занята. */
export type AiStartResult = 'started' | 'no-model' | 'busy';

export interface AskRequest {
  meetingId: string;
  question: string;
}

export interface DeleteQuestionRequest {
  meetingId: string;
  questionId: string;
}
