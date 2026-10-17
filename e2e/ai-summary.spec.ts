// Блок «Итоги встречи» (План 9, листы 18–20 макета): поддельный llama-server (TEXTMEET_TEST_LLM) отвечает
// разметкой — «### Главное», список, жирный; на вопрос — «Ответ: <вопрос>».
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, llmRequests, meetingJson, type LaunchedApp, type LaunchOptions } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const OTHER = '2026-09-28_1100_d4e5f6';

const transcript = (text: string) => ({
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T13:52:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text, edited: false }],
});

function launch(options: LaunchOptions & { text?: string } = {}): Promise<LaunchedApp> {
  return launchApp({
    meetings: [
      { id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной', speakerNames: { s1: 'Ирина' } }) },
      { id: OTHER, json: meetingJson(OTHER, { status: 'done', title: 'Планёрка с дизайнерами', createdAt: '2026-09-28T08:00:00.000Z' }) },
    ],
    transcripts: { [ID]: transcript(options.text ?? 'Переносим запуск на пятницу.'), [OTHER]: transcript('Макеты к среде.') },
    ...options,
  });
}

const open = (page: Page, title: RegExp) =>
  page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: title }).click();
const block = (page: Page) => page.getByRole('region', { name: 'Итоги встречи' });
const summaryButton = (page: Page) => page.getByRole('button', { name: 'Итоги встречи' });

test('without a model the block offers the AI settings', async () => {
  launched = await launch();
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Скачайте её один раз (около 6 ГБ)');
  await block(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await block(page).getByRole('button', { name: 'Открыть настройки ИИ' }).click();
  await expect(page.getByRole('tab', { name: 'ИИ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Можно скачать' })).toBeVisible();
});

test('the summary is written with a cursor, formatted, saved and announced', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 60 });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(summaryButton(page)).toBeDisabled();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await expect(block(page).getByRole('status')).toHaveText('Итоги готовы', { timeout: 15_000 });
  await expect(summaryButton(page)).toBeEnabled();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect(block(page).locator('b', { hasText: 'Задание:' })).toBeVisible();
  await expect(block(page).locator('ol li')).toHaveText('Проверить итоги.');
  await expect(block(page)).toContainText(/Qwen3\.5 9B · \d\d\.\d\d, \d\d:\d\d/);
  await expect(block(page)).toContainText('Отвечает модель на вашем компьютере — важное проверяйте по тексту встречи.');

  // Свернуть — блок прячется; «Итоги встречи» разворачивает его, не делая итоги заново.
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  expect(await llmRequests(launched.llmLog)).toHaveLength(1);
});

test('«Остановить» keeps what was written; «Обновить» asks before replacing', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Остановить' }).click();
  await expect(block(page)).toContainText('· остановлено');

  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Заменить итоги?' });
  await expect(dialog).toContainText('Ваши вопросы и ответы останутся.');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  expect(await llmRequests(llmLog)).toHaveLength(1);
  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});

test('own questions are answered, kept in order and deleted', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  const field = block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' });
  await expect(field).toBeEnabled({ timeout: 15_000 });
  await field.fill('Что решили по срокам?');
  await field.press('Enter');
  await expect(block(page)).toContainText('Ответ: Что решили по срокам?', { timeout: 15_000 });
  await expect(field).toHaveValue('');
  await field.fill('Кто такой Олег?');
  await block(page).getByRole('button', { name: 'Спросить' }).click();
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?', { timeout: 15_000 });
  await expect(block(page).locator('.qa-q')).toHaveText([/^Что решили по срокам\?/, /^Кто такой Олег\?/]);

  await block(page).getByRole('button', { name: 'Удалить вопрос: Что решили по срокам?' }).click();
  await expect(block(page).locator('.qa-q')).toHaveCount(1);
  // Вопросы и итоги — на диске: после перезапуска они на месте.
  await page.reload();
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?');
});

test('the summary is marked when the text of the meeting changed after it', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page, libraryDir } = launched;
  const summary = { text: '- Старые итоги', model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-09-27T13:55:00.000Z', status: 'done', sourceHash: 'другой текст' };
  await writeFile(join(libraryDir, ID, 'ai.json'), JSON.stringify({ version: 1, summary, questions: [] }));
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Текст встречи меняли после итогов.');
  await block(page).getByRole('button', { name: 'Обновить итоги' }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await expect(block(page)).not.toContainText('Текст встречи меняли после итогов.');
});

test('while the model writes for one meeting, another meeting names it and offers to go there', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page } = launched;
  await open(page, /Планёрка с дизайнерами/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('пишет…');
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Модель сейчас пишет итоги встречи «Планёрка с дизайнерами».');
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await block(page).getByRole('button', { name: 'Перейти' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Планёрка с дизайнерами/);
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
});

test('a meeting too long for the model is not sent', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText(
    'Встреча слишком длинная для Qwen3.5 9B. Выберите другую модель в настройках ИИ или воспользуйтесь «Скопировать для ИИ».',
  );
  expect(await llmRequests(llmLog)).toEqual([]);
});

test('a crashed engine shows the reason and «Повторить» starts it again', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'УПАДИ, пожалуйста.' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('alert')).toHaveText(/^Модель не смогла ответить — подробности в журнале\./, { timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Повторить' }).click();
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});

test('a busy engine explains itself instead of an empty block', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { app, page } = launched;
  // Модель занята (удаляется, готовится другой запрос, программа закрывается) — main отвечает «busy».
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:summarize');
    ipcMain.handle('ai:summarize', () => 'busy');
  });
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Модель сейчас занята — попробуйте ещё раз через несколько секунд.');
  await block(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(block(page)).toHaveCount(0);
});

test('"Итоги готовы" is announced while the block is collapsed', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 200 });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Итоги готовы' })).toHaveCount(1, { timeout: 20_000 });
});
