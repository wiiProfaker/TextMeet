// Каталог моделей расшифровки (План 7): поддельное хранилище моделей и поддельные движки (TEXTMEET_TEST_ASR=fake) —
// проверяется окно и склейка с main, а не скачивание и распознавание.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const settingsFile = async (userDataDir: string) =>
  JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>;

test('the catalog downloads, cancels, selects and deletes models', async () => {
  launched = await launchApp({ downloadStepMs: 600 });
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();

  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect(selected).toContainText('Скачается при первой расшифровке.');
  const russian = page.getByRole('group', { name: 'Понимают русский' });
  await expect(russian.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('group', { name: 'Только английский' }).getByRole('article')).toHaveCount(2);

  // Скачивание идёт: прогресс в карточке, остальные «Скачать» ждут; «Отменить» возвращает всё как было.
  const qwen = page.getByRole('article', { name: 'Qwen3-ASR 0.6B' });
  await qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' }).click();
  await expect(qwen.getByRole('status')).toContainText('Скачиваем');
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeDisabled();
  await qwen.getByRole('button', { name: 'Отменить' }).click();
  await expect(qwen.getByRole('button', { name: 'Скачать: Qwen3-ASR 0.6B' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeEnabled();

  // Скачанная модель переезжает в «Скачанные», её можно выбрать.
  await page.getByRole('button', { name: 'Скачать: T-one' }).click();
  const downloaded = page.getByRole('group', { name: 'Скачанные' });
  await expect(downloaded.getByRole('article', { name: 'T-one' })).toBeVisible({ timeout: 15_000 });
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
