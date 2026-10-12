import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('changes the recording hotkey, refuses single keys and resets to the default', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  const saved = async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).recordHotkey;
  const box = page.getByTestId('hotkey-box');
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(box).toContainText('Space');

  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(box).toHaveText('Нажмите новую комбинацию…');
  await page.keyboard.press('KeyR');
  await expect(page.getByRole('alert')).toContainText('Одну клавишу без');

  await page.keyboard.press('Control+Alt+Shift+F11');
  await expect(box).toContainText('F11');
  await expect.poll(saved).toBe('Control+Alt+Shift+F11');
  // Подсказка на кнопке записи тоже сменилась.
  await expect(page.getByRole('button', { name: /Начать запись/ })).toContainText('F11');

  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect.poll(saved).toBeNull();
  await expect(page.getByRole('button', { name: 'Сбросить' })).toBeHidden();
});

test('cancels typing a new hotkey with Escape', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('hotkey-box')).toContainText('Space');
  await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible();
});

test('switching to another settings tab cancels entering a new combination', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Изменить', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отмена' })).toBeVisible();
  await page.getByRole('tab', { name: 'Общие' }).click();
  await page.getByRole('tab', { name: 'Запись' }).click();
  await expect(page.getByRole('button', { name: 'Изменить', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отмена' })).toHaveCount(0);
  await expect(page.getByTestId('hotkey-box')).toContainText('Space');
});
