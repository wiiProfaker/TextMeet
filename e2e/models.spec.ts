// Каталог моделей расшифровки (План 7): поддельное хранилище моделей и поддельные движки (TEXTMEET_TEST_ASR=fake) —
// проверяется окно и склейка с main, а не скачивание и распознавание.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, openSettings, pollMeetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const settingsFile = async (userDataDir: string) =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>;

test('the catalog downloads, cancels, selects and deletes models', async () => {
  // Шаг «скачивания» долгий: проверки «ждут» и «Отменить» успевают и на медленной машине.
  launched = await launchApp({ downloadStepMs: 1500 });
  const { page, userDataDir } = launched;
  await openSettings(page, 'Расшифровка');

  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect(selected).toContainText('Скачается при первой расшифровке.');
  const russian = page.getByRole('group', { name: 'Понимают русский' });
  await expect(russian.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('group', { name: 'Только английский' }).getByRole('article')).toHaveCount(2);

  // Скачивание идёт: прогресс в карточке, остальные «Скачать» ждут; «Отменить» возвращает всё как было.
  const qwen = page.getByRole('article', { name: 'Qwen3-ASR 0.6B' });
  await qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' }).click();
  await expect(qwen.getByRole('progressbar', { name: 'Скачивание: Qwen3-ASR 0.6B' })).toBeVisible();
  await expect(qwen).toContainText('Скачиваем');
  // Счётчик байт меняется дважды в секунду — экранному диктору хватает полоски, вслух он его не зачитывает.
  await expect(qwen.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeDisabled();
  await qwen.getByRole('button', { name: 'Отменить' }).click();
  await expect(qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeEnabled();

  // Скачанная модель переезжает в «Скачанные», её можно выбрать.
  await page.getByRole('button', { name: 'Скачать: T-one' }).click();
  const downloaded = page.getByRole('group', { name: 'Скачанные' });
  await expect(downloaded.getByRole('article', { name: 'T-one' })).toBeVisible({ timeout: 20_000 });
  await downloaded.getByRole('button', { name: 'Выбрать: T-one' }).click();
  await expect(selected.getByRole('article', { name: 'T-one' })).toBeVisible();
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('t-one');
  await expect(page.getByRole('list', { name: 'Общие модели' })).toContainText('Разделение по голосам и поиск речи');

  // Удалили выбранную — новые встречи пойдут на GigaAM.
  await selected.getByRole('button', { name: 'Удалить: T-one' }).click();
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect.poll(async () => (await settingsFile(userDataDir)).asrModel).toBe('gigaam-v3-e2e-rnnt');
  await expect(russian.getByRole('article', { name: 'T-one' })).toBeVisible();
});

const ID = '2026-09-25_1430_a1b2c3';

test('a meeting is transcribed with the model chosen in the window and shows it', async () => {
  launched = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          durationSec: 3,
          tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
        }),
        audio: { 'mic.webm': 2 },
      },
    ],
  });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Расшифровать' });
  const select = dialog.getByRole('combobox', { name: 'Модель расшифровки' });
  await expect(select).toHaveValue('gigaam-v3-e2e-rnnt');
  await expect(select.locator('option[value="canary-180m-flash"]')).toHaveText(/только английский — скачается, \d+ МБ/);
  // Список моделей — первое поле окна: Shift+Tab с него ведёт по кругу на последнюю кнопку, а не за окно.
  await select.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Расшифровать' })).toBeFocused();
  await select.selectOption('t-one');
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  await expect(page.getByLabel('Текст встречи')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('main', { name: 'Встреча' })).toContainText('Текст: T-one');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.model).toBe('t-one');
  const transcript = JSON.parse(await readFile(join(libraryDir, ID, 'transcript.json'), 'utf8')) as Record<string, unknown>;
  expect(transcript).toMatchObject({ model: 't-one', modelTitle: 'T-one' });
});

test('the transcribe dialog says when the model list did not load', async () => {
  launched = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          durationSec: 3,
          tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
        }),
        audio: { 'mic.webm': 2 },
      },
    ],
  });
  const { app, page } = launched;
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('models:get');
    ipcMain.handle('models:get', () => {
      throw new Error('Список моделей не прочитался.');
    });
  });
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Список моделей не загрузился — расшифруем моделью из настроек.');
  await expect(dialog.getByRole('combobox', { name: 'Модель расшифровки' })).toHaveCount(0);
});
