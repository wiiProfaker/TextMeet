import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_PROMPT } from '../../shared/ai-prompt';
import type { AiState } from '../../shared/ai';
import type { Transcript } from '../../shared/transcript';
import { makeTempDir } from '../../test-support/temp-dir';
import { createMeeting, updateMeeting } from '../library/library';
import { writeTranscript } from '../library/transcript-store';
import { aiTexts } from '../texts';
import { aiView, deleteQuestion } from './ai-meeting';
import { AI_RULES } from './ai-messages';
import { aiPath, readAi } from './ai-store';
import { AiRunner, type AiEngine, type AiModelRef } from './ai-runner';
import { LlmError, type ChatRequest, type StreamOptions } from './llm-client';

const transcript: Transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-10-05T10:00:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Переносим запуск на пятницу.', edited: false }],
};

async function meeting(lib: string, title = 'Созвон с Ириной'): Promise<string> {
  const created = await createMeeting(lib, { source: 'recording', status: 'done', title, now: new Date(2026, 8, 27, 16, 20) });
  await updateMeeting(lib, created.id, (m) => ({ ...m, speakerNames: { s1: 'Ирина' } }));
  await writeTranscript(lib, created.id, transcript);
  return created.id;
}

/** Движок, которым управляет тест: загрузка, счёт «кусочков», поток ответа. */
function controllableEngine() {
  const requests: { request: ChatRequest; options: StreamOptions; finish(): void; fail(err: unknown): void }[] = [];
  let tokens = 100;
  let failReady: unknown = null;
  const engine = {
    ready: vi.fn<AiEngine['ready']>(async () => {
      if (failReady) throw failReady;
      return {
        countTokens: async () => tokens,
        streamChat: (request: ChatRequest, options: StreamOptions) =>
          new Promise<{ finishReason: string | null }>((resolve, reject) => {
            requests.push({ request, options, finish: () => resolve({ finishReason: 'stop' }), fail: reject });
            options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      };
    }),
    idle: vi.fn<AiEngine['idle']>(),
    stop: vi.fn<AiEngine['stop']>(async () => undefined),
  } satisfies AiEngine;
  return {
    engine,
    requests,
    setTokens: (n: number) => (tokens = n),
    failReady: (err: unknown) => (failReady = err),
    /** Дождаться запроса и написать в ответ кусками. */
    write: async (...pieces: string[]) => {
      await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
      const last = requests.at(-1)!;
      for (const piece of pieces) last.options.onText(piece);
      return last;
    },
  };
}

function setup(options: { model?: AiModelRef | null; prompt?: string | null } = {}) {
  const lib = makeTempDir('textmeet-ai-runner-');
  const control = controllableEngine();
  const states: AiState[] = [];
  const saved = vi.fn();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runner = new AiRunner({
    libraryDir: () => lib,
    model: async () => (options.model === undefined ? { id: 'qwen3.5-9b', path: 'M/qwen.gguf' } : options.model),
    engine: control.engine,
    aiPrompt: async () => options.prompt ?? null,
    now: () => new Date('2026-10-14T10:00:00.000Z'),
    logger,
    changed: (state) => states.push(state),
    saved,
    emitMs: 0,
  });
  return { lib, runner, ...control, states, saved, logger };
}

const idle = (runner: AiRunner) => vi.waitFor(() => expect(runner.isBusy()).toBe(false));

describe('AiRunner', () => {
  it('writes a summary: loading, reading, writing — and saves it with the hash of the text it read', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    expect(await t.runner.summarize(id)).toBe('started');
    expect(t.runner.state().job).toMatchObject({ meetingId: id, meetingTitle: 'Созвон с Ириной', kind: 'summary', modelTitle: 'Qwen3.5 9B' });
    const request = await t.write('- Главное', ': пятница');
    expect(t.states.map((s) => s.job?.stage)).toEqual(expect.arrayContaining(['loading', 'reading', 'writing']));
    expect(t.runner.state().job?.text).toBe('- Главное: пятница');
    // Модель видит правила, встречу (с именами спикеров) и стандартный запрос; итоги — до 2048 «кусочков».
    expect(request.request.maxTokens).toBe(2048);
    expect(request.request.messages[0]?.content).toBe(AI_RULES);
    expect(request.request.messages[1]?.content).toContain('Ирина [0:05]\nПереносим запуск на пятницу.');
    expect(request.request.messages[1]?.content.endsWith(`---\n${DEFAULT_AI_PROMPT}`)).toBe(true);
    expect(t.engine.ready).toHaveBeenCalledWith({ path: 'M/qwen.gguf', contextTokens: 65_536 }, expect.any(AbortSignal));
    request.finish();
    await idle(t.runner);
    const view = await aiView(t.lib, id);
    expect(view.doc.summary).toMatchObject({
      text: '- Главное: пятница',
      model: 'qwen3.5-9b',
      modelTitle: 'Qwen3.5 9B',
      createdAt: '2026-10-14T10:00:00.000Z',
      status: 'done',
    });
    expect(view.stale).toBe(false);
    expect(t.saved).toHaveBeenCalledWith(id);
    expect(t.engine.idle).toHaveBeenCalled();
    expect(t.runner.state()).toEqual({ job: null, finished: { meetingId: id, kind: 'summary', status: 'done' }, failures: [] });
  });

  it('asks a question with the question alone as the task, and keeps the questions in order', async () => {
    const t = setup({ prompt: 'Свой запрос' });
    const id = await meeting(t.lib);
    for (const question of ['  Что решили?  ', 'Кто такой Олег?']) {
      await t.runner.ask(id, question);
      const request = await t.write('Ответ.');
      expect(request.request.maxTokens).toBe(1024);
      expect(request.request.messages[1]?.content.endsWith(`---\n${question.trim()}`)).toBe(true);
      request.finish();
      await idle(t.runner);
    }
    const { doc } = await readAi(t.lib, id);
    expect(doc.questions.map((q) => [q.question, q.answer, q.status])).toEqual([
      ['Что решили?', 'Ответ.', 'done'],
      ['Кто такой Олег?', 'Ответ.', 'done'],
    ]);
    expect(doc.summary).toBeNull();
  });

  it('runs one request for the whole program', async () => {
    const t = setup();
    const first = await meeting(t.lib, 'Первая');
    const second = await meeting(t.lib, 'Вторая');
    await t.runner.summarize(first);
    expect(await t.runner.summarize(second)).toBe('busy');
    expect(await t.runner.ask(first, 'Что?')).toBe('busy');
  });

  it('two presses at once start one request', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const results = await Promise.all([t.runner.summarize(id), t.runner.ask(id, 'Что?')]);
    expect(results.sort()).toEqual(['busy', 'started']);
  });

  it('a meeting deleted while its request is being prepared does not start', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const started = t.runner.summarize(id);
    t.runner.forget(id);
    expect(await started).toBe('busy');
    expect(t.engine.ready).not.toHaveBeenCalled();
    expect(t.runner.isBusy()).toBe(false);
  });

  it('after quitting began, no new request starts and the engine is not started again', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    const preparing = t.runner.summarize(id);
    const quit = t.runner.disposeForQuit();
    expect(await preparing).toBe('busy');
    await quit;
    expect(await t.runner.summarize(id)).toBe('busy');
    expect(t.engine.ready).not.toHaveBeenCalled();
  });

  it('deleting a model stops the engine first and holds new requests until it is done', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    let during: string | null = null;
    await t.runner.withEngineStopped(async () => {
      during = await t.runner.summarize(id);
    });
    expect(during).toBe('busy');
    expect(t.engine.stop).toHaveBeenCalled();
    expect(await t.runner.summarize(id)).toBe('started');
    // Пока модель отвечает, удалить её нельзя.
    await expect(t.runner.withEngineStopped(async () => undefined)).rejects.toThrow(aiTexts.modelBusy);
  });

  it('tells the window about the saved answer only after the last state, and how it ended', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    // Что окно знало в момент «ai.json записан»: модель уже свободна, и понятно, чем кончился запрос.
    const seen: unknown[] = [];
    t.saved.mockImplementation(() => seen.push(t.states.at(-1)));
    (await t.write('- Итоги')).finish();
    await idle(t.runner);
    await vi.waitFor(() => expect(t.saved).toHaveBeenCalledWith(id));
    expect(seen[0]).toMatchObject({ job: null, finished: { meetingId: id, kind: 'summary', status: 'done' } });

    await t.runner.summarize(id);
    expect(t.runner.state().finished).toBeNull();
    await t.write('- Ещё');
    t.runner.stop();
    await idle(t.runner);
    expect(t.runner.state().finished).toEqual({ meetingId: id, kind: 'summary', status: 'stopped' });
  });

  it('says when no model is downloaded, without starting anything', async () => {
    const t = setup({ model: null });
    const id = await meeting(t.lib);
    expect(await t.runner.summarize(id)).toBe('no-model');
    expect(t.engine.ready).not.toHaveBeenCalled();
    expect(t.runner.isBusy()).toBe(false);
  });

  it('refuses a meeting without text, like the export', async () => {
    const t = setup();
    const created = await createMeeting(t.lib, { source: 'recording', status: 'recorded', title: 'Пусто', now: new Date() });
    await expect(t.runner.summarize(created.id)).rejects.toThrow('У встречи пока нет текста');
    expect(t.runner.isBusy()).toBe(false);
  });

  it('«Остановить» keeps what was written, marked as stopped; a stop before any text saves nothing', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Бюджет');
    t.runner.stop();
    await idle(t.runner);
    expect((await readAi(t.lib, id)).doc.summary).toMatchObject({ text: '- Бюджет', status: 'stopped' });

    await t.runner.ask(id, 'Что?');
    await vi.waitFor(() => expect(t.requests).toHaveLength(2));
    t.runner.stop();
    await idle(t.runner);
    expect((await readAi(t.lib, id)).doc.questions).toEqual([]);
  });

  it('does not send a meeting longer than the window of the model', async () => {
    const t = setup({ model: { id: 't-lite-it-2.1', path: 'M/t-lite.gguf' } });
    const id = await meeting(t.lib);
    t.setTokens(40_960 - 2048 + 1);
    await t.runner.summarize(id);
    await idle(t.runner);
    expect(t.requests).toHaveLength(0);
    expect(t.runner.state().failures).toEqual([
      { meetingId: id, kind: 'summary', question: null, failure: 'too-long', message: aiTexts.tooLong('T-lite-it 2.1'), text: null },
    ]);
  });

  it('reports an engine that did not start or broke off, and forgets the failure on the next request', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    t.failReady(new LlmError('engine', 'движок итогов не запустился'));
    await t.runner.summarize(id);
    await idle(t.runner);
    expect(t.runner.state().failures[0]).toMatchObject({ failure: 'engine', message: aiTexts.engine });
    expect(t.logger.error).toHaveBeenCalled();

    t.failReady(null);
    await t.runner.summarize(id);
    expect(t.runner.state().failures).toEqual([]);
    const request = await t.write('кус');
    request.fail(new LlmError('engine', 'ответ движка итогов оборвался'));
    await idle(t.runner);
    expect(t.runner.state().failures[0]?.failure).toBe('engine');
    expect((await readAi(t.lib, id)).doc.summary).toBeNull();
  });

  it('keeps an answer that could not be saved in the failure, until the person leaves the meeting', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    // На месте ai.json — папка: записать файл не выйдет.
    mkdirSync(aiPath(t.lib, id));
    await t.runner.ask(id, 'Сроки?');
    (await t.write('Пятница.')).finish();
    await idle(t.runner);
    const failure = t.runner.state().failures[0];
    expect(failure).toMatchObject({ failure: 'save', kind: 'question', question: 'Сроки?', text: 'Пятница.' });
    expect(failure?.message).toMatch(/^Не удалось сохранить ответ: /);
    t.runner.dismiss(id);
    expect(t.runner.state().failures).toEqual([]);
  });

  it('a deleted meeting stops its request and saves nothing', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Бюджет');
    t.runner.forget(id);
    await idle(t.runner);
    expect(await readAi(t.lib, id)).toMatchObject({ doc: { summary: null }, broken: false });
    expect(t.runner.state().failures).toEqual([]);
  });

  it('on quit saves the answer as stopped and stops the engine', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    await t.write('- Половина');
    await t.runner.disposeForQuit();
    expect((await readAi(t.lib, id)).doc.summary).toMatchObject({ text: '- Половина', status: 'stopped' });
    expect(t.engine.stop).toHaveBeenCalled();
  });

  it('treats an empty answer as a failure of the model', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    (await t.write('  ')).finish();
    await idle(t.runner);
    expect(t.runner.state().failures[0]?.failure).toBe('engine');
  });
});

describe('aiView and deleteQuestion', () => {
  it('marks the summary when the text of the meeting changed after it, but not after a new title', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    await t.runner.summarize(id);
    (await t.write('- Итоги')).finish();
    await idle(t.runner);
    await updateMeeting(t.lib, id, (m) => ({ ...m, title: 'Новое название' }));
    expect((await aiView(t.lib, id)).stale).toBe(false);
    await updateMeeting(t.lib, id, (m) => ({ ...m, speakerNames: { s1: 'Ира' } }));
    expect((await aiView(t.lib, id)).stale).toBe(true);
  });

  it('shows a broken file as empty and broken', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    writeFileSync(aiPath(t.lib, id), 'не json');
    expect(await aiView(t.lib, id)).toMatchObject({ broken: true, stale: false, doc: { summary: null, questions: [] } });
  });

  it('deletes one question and leaves the rest', async () => {
    const t = setup();
    const id = await meeting(t.lib);
    for (const q of ['Раз?', 'Два?']) {
      await t.runner.ask(id, q);
      (await t.write('Да.')).finish();
      await idle(t.runner);
    }
    const [first] = (await readAi(t.lib, id)).doc.questions;
    const view = await deleteQuestion(t.lib, id, first!.id, t.logger);
    expect(view.doc.questions.map((q) => q.question)).toEqual(['Два?']);
    // Чужой id — ничего не меняется.
    expect((await deleteQuestion(t.lib, id, 'нет-такого', t.logger)).doc.questions).toHaveLength(1);
  });
});
