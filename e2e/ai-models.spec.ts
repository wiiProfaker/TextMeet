// Каталог «Модель для итогов» (План 9): поддельное хранилище моделей (TEXTMEET_TEST_ASR=fake) — проверяются окно и
// склейка с main, а не скачивание.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, openSettings, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const aiModelSetting = async (userDataDir: string) =>
  (JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>).aiModel;

test('the AI catalog downloads, selects the first model by itself and deletes models', async () => {
  // Шаг «скачивания» долгий: проверки «ждут» и «Отменить» успевают и на медленной машине.
  launched = await launchApp({ downloadStepMs: 1500 });
  const { page, userDataDir } = launched;
  await openSettings(page, 'ИИ');

  const available = page.getByRole('group', { name: 'Можно скачать' });
  await expect(available.getByRole('article')).toHaveCount(4);
  await expect(page.getByRole('group', { name: 'Выбрана' })).toHaveCount(0);
  const qwen9 = page.getByRole('article', { name: 'Qwen3.5 9B' });
  await expect(qwen9).toContainText('Рекомендуется');
  await expect(qwen9).toContainText('5,3 ГБ');
  await expect(page.getByRole('article', { name: 'GigaChat 3.1 Lightning' })).toContainText('оценка');
  await expect(page.getByRole('article', { name: 'T-lite-it 2.1' })).toContainText('Встречи до ~2,5 часа');

  // Скачивание идёт: прогресс в карточке, остальные «Скачать» ждут — и модели расшифровки тоже.
  const small = page.getByRole('article', { name: 'Qwen3.5 4B' });
  await small.getByRole('button', { name: 'Скачать: Qwen3.5 4B' }).click();
  await expect(small.getByRole('progressbar', { name: 'Скачивание: Qwen3.5 4B' })).toBeVisible();
  await expect(small).toContainText(/из 2,6 ГБ/);
  await expect(page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Расшифровка' }).click();
  await expect(page.getByRole('button', { name: 'Скачать: T-one' })).toBeDisabled();
  await page.getByRole('tab', { name: 'ИИ' }).click();
  await small.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' })).toBeEnabled();

  // Первая скачанная модель выбирается сама.
  await small.getByRole('button', { name: 'Скачать: Qwen3.5 4B' }).click();
  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'Qwen3.5 4B' })).toBeVisible({ timeout: 20_000 });
  await expect(selected).toContainText('скачана · 2,6 ГБ');
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-4b');

  // Вторая — в «Скачанные», её можно выбрать.
  await page.getByRole('button', { name: 'Скачать: Qwen3.5 9B' }).click();
  const downloaded = page.getByRole('group', { name: 'Скачанные' });
  await expect(downloaded.getByRole('article', { name: 'Qwen3.5 9B' })).toBeVisible({ timeout: 20_000 });
  await downloaded.getByRole('button', { name: 'Выбрать: Qwen3.5 9B' }).click();
  await expect(selected.getByRole('article', { name: 'Qwen3.5 9B' })).toBeVisible();
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-9b');

  // Удалили выбранную — выбирается другая скачанная; удалили и её — ничего не выбрано.
  await selected.getByRole('button', { name: 'Удалить: Qwen3.5 9B' }).click();
  await expect(selected.getByRole('article', { name: 'Qwen3.5 4B' })).toBeVisible();
  await expect.poll(() => aiModelSetting(userDataDir)).toBe('qwen3.5-4b');
  await selected.getByRole('button', { name: 'Удалить: Qwen3.5 4B' }).click();
  await expect(page.getByRole('group', { name: 'Выбрана' })).toHaveCount(0);
  await expect(available.getByRole('article')).toHaveCount(4);
  await expect.poll(() => aiModelSetting(userDataDir)).toBeNull();
});
