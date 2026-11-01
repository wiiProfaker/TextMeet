// Итоги в поиске и в выгрузке (План 9, решения §2.3): готовые итоги лежат в ai.json встречи.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';

function launchWithSummary(): Promise<LaunchedApp> {
  const answer = { model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-09-27T13:55:00.000Z', status: 'done' };
  return launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной', speakerNames: { s1: 'Ирина' } }) }],
    transcripts: {
      [ID]: {
        schemaVersion: 1,
        model: 'gigaam-v3-e2e-rnnt',
        createdAt: '2026-09-27T13:52:00.000Z',
        speakers: [{ id: 's1', kind: 'other' }],
        segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false }],
      },
    },
    aiDocs: {
      [ID]: {
        version: 1,
        summary: { ...answer, text: '### Главное\n- Подрядчики — **отдельной строкой**.', sourceHash: 'h' },
        questions: [{ ...answer, id: 'q1', question: 'Кто такой Олег?', answer: 'Олег считает смету.' }],
      },
    },
  });
}

test('the search finds words of the summary and of the answers and opens the summary', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  // Свёрнутый блок разворачивается, когда переходят из найденного.
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('region', { name: 'Итоги встречи' }).getByRole('button', { name: 'Свернуть' }).click();
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('подрядчики');
  const found = page.getByRole('navigation', { name: 'Найдено' });
  await expect(found.getByRole('button', { name: /^Итоги/ })).toContainText('Подрядчики — отдельной строкой.');
  await found.getByRole('button', { name: /^Итоги/ }).click();
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('смету');
  await expect(found.getByRole('button', { name: /^Ответ на «Кто такой Олег\?»/ })).toBeVisible();
});

test('«Скопировать всё» and the saved text start with the summary, «Скопировать для ИИ» does not', async () => {
  launched = await launchWithSummary();
  const { app, page, root } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Скопировать всё' }).click();
  const copied = () => app.evaluate(({ clipboard }) => clipboard.readText());
  await expect.poll(copied).toContain('Итоги встречи\nQwen3.5 9B · 27.09.2026, ');
  const text = await copied();
  expect(text).toContain('• Подрядчики — отдельной строкой.');
  expect(text.indexOf('Итоги встречи')).toBeLessThan(text.indexOf('Текст встречи'));
  expect(text).not.toContain('Олег');

  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect.poll(copied).not.toContain('Итоги встречи');

  const file = join(root, 'итоги.txt');
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, file);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: /Сохранить как текст/ }).click();
  await expect.poll(() => readFile(file, 'utf8').catch(() => '')).toContain('Итоги встречи');
});
