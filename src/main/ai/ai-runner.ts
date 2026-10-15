// Итоги встречи и свои вопросы (решения Плана 9, §4.3): один запрос на всю программу. Окно получает состояние —
// начало, ход (не чаще 10 раз в секунду) и конец; написанное сохраняется в ai.json встречи. «Остановить» и выход из
// программы сохраняют написанное с пометкой «остановлено»; удаление встречи — ничего не сохраняет.
import { randomUUID } from 'node:crypto';
import type { AiFailure, AiFinished, AiJob, AiJobKind, AiStartResult, AiState } from '../../shared/ai';
import type { ExportDoc } from '../../shared/export-doc';
import { llmModel, type LlmModelId, type LlmModelInfo } from '../../shared/llm-models';
import { loadExportDoc } from '../export/export-meeting';
import type { Logger } from '../logger';
import { aiTexts } from '../texts';
import { aiMessages, fitsWindow, meetingText, QUESTION_MAX_TOKENS, sourceHash, SUMMARY_MAX_TOKENS, summaryTask } from './ai-messages';
import { updateAi } from './ai-store';
import { countTokens, LlmError, streamChat, type ChatRequest, type StreamOptions } from './llm-client';
import type { LlamaModel, LlamaServer } from './llama-server';

/** Ход ответа — в окно не чаще. */
export const AI_EMIT_MS = 100;
/** Сколько выход из программы ждёт сохранения остановленного ответа. */
export const QUIT_SAVE_MS = 2000;

/** Готовый к запросам движок с моделью. */
export interface AiSession {
  countTokens(content: string, signal: AbortSignal): Promise<number>;
  streamChat(request: ChatRequest, options: StreamOptions): Promise<{ finishReason: string | null }>;
}

/** Движок итогов глазами очереди: llama-server (llamaEngine) или подделка в модульных тестах. */
export interface AiEngine {
  /** Загрузить модель (этап «Готовим модель…»); отмена прекращает ожидание. */
  ready(model: LlamaModel, signal: AbortSignal): Promise<AiSession>;
  /** Запрос закончился — движок может завершиться после простоя. */
  idle(): void;
  stop(): Promise<void>;
}

export function llamaEngine(server: LlamaServer): AiEngine {
  return {
    ready: async (model, signal) => {
      const endpoint = await server.ready(model, signal);
      return {
        countTokens: (content, abort) => countTokens(endpoint, content, abort),
        streamChat: (request, options) => streamChat(endpoint, request, options),
      };
    },
    idle: () => server.idle(),
    stop: () => server.stop(),
  };
}

export interface AiModelRef {
  id: LlmModelId;
  /** Файл GGUF на диске. */
  path: string;
}

export interface AiRunnerDeps {
  libraryDir(): string;
  /** Модель для итогов, если скачана (выбранная или первая скачанная). */
  model(): Promise<AiModelRef | null>;
  engine: AiEngine;
  /** «Запрос для ИИ» из настроек — после уже начатых сохранений настроек. */
  aiPrompt(): Promise<string | null>;
  now(): Date;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Состояние для окна. */
  changed(state: AiState): void;
  /** ai.json встречи записан — окно перечитает итоги, поиск — встречу. */
  saved(meetingId: string): void;
  /** Пауза между сообщениями о ходе ответа (в тестах — короче). */
  emitMs?: number;
}

interface Running {
  job: AiJob;
  controller: AbortController;
  /** Встречу удалили — написанное не сохраняется. */
  discard: boolean;
  /** Ответ записан в ai.json — окну сказать после последнего состояния. */
  saved: boolean;
  done: Promise<void>;
}

interface JobInput {
  model: AiModelRef;
  info: LlmModelInfo;
  doc: ExportDoc;
  task: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AiRunner {
  private running: Running | null = null;
  /** Запрос готовится (модель, текст встречи): второй в это время — «занято». */
  private starting: { meetingId: string; forgotten: boolean } | null = null;
  /** Движок остановлен на время удаления модели или навсегда (выход): новые запросы — «занято». */
  private engineHeld = false;
  private disposed = false;
  private finished: AiFinished | null = null;
  private readonly failures = new Map<string, AiFailure>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AiRunnerDeps) {}

  state(): AiState {
    return { job: this.running?.job ?? null, finished: this.finished, failures: [...this.failures.values()] };
  }

  isBusy(): boolean {
    return this.running !== null || this.starting !== null;
  }

  /** «Итоги встречи» и «Обновить»: итоги по запросу для ИИ из настроек. */
  summarize(meetingId: string): Promise<AiStartResult> {
    return this.start(meetingId, 'summary', null);
  }

  /** «Спросить»: ответ видит только встречу и этот вопрос (без прошлых вопросов и итогов). */
  ask(meetingId: string, question: string): Promise<AiStartResult> {
    return this.start(meetingId, 'question', question.trim());
  }

  /** «Остановить»: написанное сохраняется с пометкой «остановлено». */
  stop(): void {
    this.running?.controller.abort();
  }

  /** Человек ушёл со встречи — её прошлая неудача больше не показывается. */
  dismiss(meetingId: string): void {
    if (this.failures.delete(meetingId)) this.emit(true);
  }

  /** Встречу удаляют: её запрос останавливается без сохранения (и готовящийся не начнётся), неудача забывается. */
  forget(meetingId: string): void {
    if (this.starting?.meetingId === meetingId) this.starting.forgotten = true;
    const running = this.running;
    if (running?.job.meetingId === meetingId) {
      running.discard = true;
      running.controller.abort();
    }
    this.dismiss(meetingId);
  }

  /**
   * Удалить модель: пока работает движок, её файл открыт (Windows его не удалит) — движок завершается, и до конца
   * удаления новые запросы получают «занято». Модель отвечает — отказ.
   */
  async withEngineStopped<T>(work: () => Promise<T>): Promise<T> {
    if (this.isBusy() || this.engineHeld) throw new Error(aiTexts.modelBusy);
    this.engineHeld = true;
    try {
      await this.deps.engine.stop();
      return await work();
    } finally {
      this.engineHeld = this.disposed;
    }
  }

  /** Выход из программы: идущий ответ сохраняется как остановленный (ждём до 2 с), движок завершается. */
  async disposeForQuit(): Promise<void> {
    // Новые запросы (нажатие во время выхода) уже не начнутся.
    this.disposed = true;
    this.engineHeld = true;
    if (this.starting) this.starting.forgotten = true;
    const running = this.running;
    if (running) {
      running.controller.abort();
      await Promise.race([running.done, sleep(QUIT_SAVE_MS)]);
    }
    await this.deps.engine.stop();
  }

  private async start(meetingId: string, kind: AiJobKind, question: string | null): Promise<AiStartResult> {
    if (this.isBusy() || this.engineHeld) return 'busy';
    const starting = { meetingId, forgotten: false };
    this.starting = starting;
    try {
      const model = await this.deps.model();
      if (!model) return 'no-model';
      // Нет текста или он не читается — ошибка уходит в окно (как у «Скопировать всё»).
      const doc = await loadExportDoc(this.deps.libraryDir(), meetingId);
      const task = question ?? summaryTask(await this.deps.aiPrompt());
      // Пока готовились, встречу удалили или программа выходит — запрос не начинается.
      if (starting.forgotten) return 'busy';
      const info = llmModel(model.id);
      const running: Running = {
        job: { meetingId, meetingTitle: doc.title, kind, question, modelTitle: info.title, stage: 'loading', text: '' },
        controller: new AbortController(),
        discard: false,
        saved: false,
        done: Promise.resolve(),
      };
      this.failures.delete(meetingId);
      this.finished = null;
      this.running = running;
      running.done = this.run(running, { model, info, doc, task });
      return 'started';
    } finally {
      this.starting = null;
      this.emit(true);
    }
  }

  private async run(running: Running, input: JobInput): Promise<void> {
    const signal = running.controller.signal;
    const kind = running.job.kind;
    try {
      const session = await this.deps.engine.ready({ path: input.model.path, contextTokens: input.info.contextTokens }, signal);
      this.update(running, { stage: 'reading' }, true);
      const messages = aiMessages(meetingText(input.doc), input.task);
      const tokens = await session.countTokens(messages.map((m) => m.content).join('\n'), signal);
      if (!fitsWindow(tokens, input.info.contextTokens)) throw new LlmError('too-long', `${tokens} «кусочков»`);
      await session.streamChat(
        { messages, maxTokens: kind === 'summary' ? SUMMARY_MAX_TOKENS : QUESTION_MAX_TOKENS },
        {
          signal,
          onText: (text) => this.update(running, { stage: 'writing', text: running.job.text + text }, running.job.stage !== 'writing'),
        },
      );
      if (running.job.text.trim() === '') throw new LlmError('engine', 'модель ответила пустым текстом');
      await this.save(running, input, 'done');
    } catch (err) {
      if (signal.aborted) {
        // Остановили: написанное сохраняется; встречу удаляют — нет.
        if (!running.discard && running.job.text.trim() !== '') await this.save(running, input, 'stopped');
      } else if (!running.discard) {
        this.fail(running, err, input.info.title);
      }
    } finally {
      this.deps.engine.idle();
      this.running = null;
      this.emit(true);
      // После последнего состояния: окно сразу перечитывает итоги, без мелькания прежних.
      if (running.saved) {
        try {
          this.deps.saved(running.job.meetingId);
        } catch (err) {
          this.deps.logger.error('Итоги: сбой обработчика записи', err);
        }
      }
    }
  }

  private fail(running: Running, err: unknown, modelTitle: string): void {
    const tooLong = err instanceof LlmError && err.kind === 'too-long';
    if (tooLong) this.deps.logger.warn(`Встреча не поместилась в модель ${modelTitle}`, err);
    else this.deps.logger.error('Модель для итогов не ответила', err);
    const { meetingId, kind, question } = running.job;
    this.failures.set(meetingId, {
      meetingId,
      kind,
      question,
      failure: tooLong ? 'too-long' : 'engine',
      message: tooLong ? aiTexts.tooLong(modelTitle) : aiTexts.engine,
      text: null,
    });
  }

  private async save(running: Running, input: JobInput, status: 'done' | 'stopped'): Promise<void> {
    const { meetingId, kind, question, text } = running.job;
    const common = { model: input.model.id, modelTitle: input.info.title, createdAt: this.deps.now().toISOString(), status };
    try {
      await updateAi(
        this.deps.libraryDir(),
        meetingId,
        (doc) =>
          kind === 'summary'
            ? { ...doc, summary: { text, ...common, sourceHash: sourceHash(input.doc) } }
            : { ...doc, questions: [...doc.questions, { id: randomUUID(), question: question ?? '', answer: text, ...common }] },
        this.deps.logger,
      );
    } catch (err) {
      if (running.discard) return;
      this.deps.logger.warn('Итоги не сохранились', err);
      this.failures.set(meetingId, { meetingId, kind, question, failure: 'save', message: aiTexts.notSaved(kind, err), text });
      return;
    }
    running.saved = true;
    this.finished = { meetingId, kind, status };
  }

  private update(running: Running, patch: Partial<AiJob>, force: boolean): void {
    running.job = { ...running.job, ...patch };
    if (this.running === running) this.emit(force);
  }

  /** Ход ответа — не чаще AI_EMIT_MS; последний кусок всё равно дойдёт (отложенной отправкой). */
  private emit(force: boolean): void {
    const now = Date.now();
    const pause = this.deps.emitMs ?? AI_EMIT_MS;
    if (!force && now - this.lastEmit < pause) {
      this.emitTimer ??= setTimeout(() => {
        this.emitTimer = null;
        this.emit(true);
      }, pause - (now - this.lastEmit));
      return;
    }
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    this.lastEmit = now;
    try {
      this.deps.changed(this.state());
    } catch (err) {
      this.deps.logger.error('Итоги: сбой обработчика состояния', err);
    }
  }
}
