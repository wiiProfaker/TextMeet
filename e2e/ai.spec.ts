// «Скопировать для ИИ» и «Запрос для ИИ» в настройках (План 6).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { DEFAULT_AI_PROMPT } from '../src/shared/ai-prompt';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const createdAt = new Date(2026, 8, 27, 16, 20).toISOString();
const TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T14:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'seg-1', start: 708, end: 712, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false },
    { id: 'seg-2', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};

function launchWithMeeting(): Promise<LaunchedApp> {
  return launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          createdAt,
          durationSec: 32 * 60,
          status: 'done',
          speakerNames: { s1: 'Ирина' },
        }),
      },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
}

const EXPECTED_TEXT =
  'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету.\n\nЯ [12:04]\nПонял.\n';

async function openMeeting(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Смотри, по бюджету.');
}

/** Что лежит в буфере обмена: простой текст и есть ли оформленный. */
async function clipboardNow(app: ElectronApplication): Promise<{ text: string; hasHtml: boolean }> {
  return app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    return { text: (await clipboard.readText()).replace(/\r\n/g, '\n'), hasHtml: item?.types.includes('text/html') ?? false };
  });
}

const savedPrompt = async (userDataDir: string): Promise<unknown> =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).aiPrompt;

test('the AI prompt starts as the standard one, saves itself and goes back to the standard', async () => {
  launched = await launchWithMeeting();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await expect(field).toHaveValue(DEFAULT_AI_PROMPT);
  const reset = page.getByRole('button', { name: 'Вернуть стандартный' });
  await expect(reset).toBeHidden();

  await field.fill('Коротко: о чём договорились?');
  await expect(reset).toBeVisible();
  // Сохраняется сам — после паузы набора, без ухода из поля.
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Коротко: о чём договорились?');
  await expect(field).toBeFocused();

  await field.fill('');
  await field.blur();
  await expect.poll(() => savedPrompt(userDataDir)).toBe('');

  await reset.click();
  await expect(field).toHaveValue(DEFAULT_AI_PROMPT);
  await expect(field).toBeFocused();
  await expect(reset).toBeHidden();
  await expect.poll(() => savedPrompt(userDataDir)).toBeNull();
});

test('a prompt typed right before leaving the settings is saved and shown again', async () => {
  launched = await launchWithMeeting();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('textbox', { name: 'Запрос для ИИ' }).fill('Список задач, по пунктам.');
  // Сразу на встречу — раньше, чем пройдёт пауза набора.
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Список задач, по пунктам.');

  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('textbox', { name: 'Запрос для ИИ' })).toHaveValue('Список задач, по пунктам.');
});

test('copies the standard prompt and the meeting text as plain text', async () => {
  launched = await launchWithMeeting();
  const { app, page } = launched;
  await openMeeting(page);
  const button = page.getByRole('button', { name: 'Скопировать для ИИ' });
  await button.click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Текст встречи с запросом скопирован' })).toBeAttached();
  expect(await clipboardNow(app)).toEqual({ text: `${DEFAULT_AI_PROMPT}\n\n${EXPECTED_TEXT}`, hasHtml: false });
  await expect(button).toBeVisible({ timeout: 5_000 });
});

test('copies with the own prompt, and only the text when the prompt is empty', async () => {
  launched = await launchWithMeeting();
  const { app, page, userDataDir } = launched;
  const field = page.getByRole('textbox', { name: 'Запрос для ИИ' });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('Что решили по бюджету?');
  // Набранный запрос уходит в main при уходе со страницы настроек; копируем, когда он сохранён.
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('Что решили по бюджету?');
  await page.getByRole('button', { name: 'Скопировать для ИИ' }).click();
  await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible();
  expect((await clipboardNow(app)).text).toBe(`Что решили по бюджету?\n\n${EXPECTED_TEXT}`);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await field.fill('');
  await openMeeting(page);
  await expect.poll(() => savedPrompt(userDataDir)).toBe('');
  await page.getByRole('button', { name: /Скопировать для ИИ|Скопировано/ }).click();
  await expect.poll(async () => (await clipboardNow(app)).text).toBe(EXPECTED_TEXT);
});

test('a meeting without text has no «Скопировать для ИИ»', async () => {
  const id = '2026-09-28_1430_d4e5f6';
  launched = await launchApp({ meetings: [{ id, json: meetingJson(id, { title: 'Только запись' }) }] });
  const { page } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Только запись/ }).click();
  await expect(page.getByRole('heading', { name: 'Только запись' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скопировать для ИИ' })).toHaveCount(0);
});
