// Итоги в main (План 9): очередь, ai.json, выход и удаление встречи посреди ответа — через API окна, с поддельным
// llama-server (TEXTMEET_TEST_LLM) и поддельным хранилищем моделей. Блок итогов в окне — e2e/ai-summary.spec.ts.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, llmRequests, meetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';

const transcript = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T13:52:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Переносим запуск на пятницу.', edited: false },
    { id: 'b', start: 10, end: 12, speakerId: 'me', text: 'Согласен.', edited: false },
  ],
};

const fixture = { meetings: [{ id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной' }) }], transcripts: { [ID]: transcript } };

test('a summary is written by the engine and saved in ai.json of the meeting', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'] });
  const { page, libraryDir, llmLog } = launched;
  expect(await page.evaluate((id) => window.textmeet.summarize(id), ID)).toBe('started');
  await expect
    .poll(() => page.evaluate((id) => window.textmeet.getAi(id).then((v) => v.doc.summary?.status ?? null), ID))
    .toBe('done');
  const saved = JSON.parse(await readFile(join(libraryDir, ID, 'ai.json'), 'utf8')) as { summary: { text: string; modelTitle: string } };
  expect(saved.summary.text).toContain('### Главное');
  expect(saved.summary.modelTitle).toBe('Qwen3.5 9B');
  // Модель видит скрытые правила и текст встречи с именами спикеров.
  const [request] = await llmRequests(llmLog);
  expect(request?.max_tokens).toBe(2048);
  expect(request?.messages[0]?.content).toContain('не придумывай');
  expect(request?.messages[1]?.content).toContain('Спикер 1 [0:05]\nПереносим запуск на пятницу.');
  expect(await page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
});

test('without a downloaded model nothing starts', async () => {
  launched = await launchApp(fixture);
  expect(await launched.page.evaluate((id) => window.textmeet.summarize(id), ID)).toBe('no-model');
  expect(await llmRequests(launched.llmLog)).toEqual([]);
});

test('quitting while the model writes keeps what was written, marked as stopped', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'], llmTokenMs: 400 });
  const { app, page, libraryDir } = launched;
  await page.evaluate((id) => window.textmeet.askAi({ meetingId: id, question: 'Что решили по срокам?' }), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.text ?? ''))).not.toBe('');
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await closed;
  const saved = JSON.parse(await readFile(join(libraryDir, ID, 'ai.json'), 'utf8')) as {
    questions: { question: string; answer: string; status: string }[];
  };
  expect(saved.questions).toHaveLength(1);
  expect(saved.questions[0]).toMatchObject({ question: 'Что решили по срокам?', status: 'stopped' });
  expect(saved.questions[0]?.answer.startsWith('Ответ:')).toBe(true);
});

test('deleting the meeting while the model writes stops it and saves nothing', async () => {
  launched = await launchApp({ ...fixture, installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page, trashDir } = launched;
  await page.evaluate((id) => window.textmeet.summarize(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState().then((s) => s.job?.stage ?? null))).toBe('writing');
  await page.evaluate((id) => window.textmeet.deleteMeeting(id), ID);
  await expect.poll(() => page.evaluate(() => window.textmeet.getAiState())).toEqual({ job: null, failures: [] });
  const [trashed] = await readdir(trashDir);
  expect(existsSync(join(trashDir, trashed!, 'ai.json'))).toBe(false);
});
