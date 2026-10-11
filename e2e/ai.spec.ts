// «Скопировать для ИИ» и «Запрос для ИИ» в настройках (План 6).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
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

function launchWithMeeting(settings?: Record<string, unknown>): Promise<LaunchedApp> {
  return launchApp({
    ...(settings ? { settings } : {}),
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
