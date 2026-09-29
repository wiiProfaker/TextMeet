import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

async function addMeeting(libraryDir: string, id: string, title: string): Promise<void> {
  await mkdir(join(libraryDir, id), { recursive: true });
  await writeFile(join(libraryDir, id, 'meeting.json'), JSON.stringify(meetingJson(id, { title })));
}

test('shows the empty library', async () => {
  launched = await launchApp();
  await expect(launched.page.getByText('Пока нет встреч.')).toBeVisible();
});

test('lists meetings by day, newest first, and marks broken and unfinished ones', async () => {
  launched = await launchApp({
    meetings: [
      { id: '2026-09-20_1000_aaaaaa', json: meetingJson('2026-09-20_1000_aaaaaa', { title: 'Старая встреча' }) },
      {
        id: '2026-09-25_1430_bbbbbb',
        json: meetingJson('2026-09-25_1430_bbbbbb', { title: 'Свежая встреча', createdAt: '2026-09-25T11:30:00.000Z' }),
      },
      { id: '2026-09-22_1200_cccccc', json: '{oops' },
    ],
  });
  const { page, libraryDir } = launched;
  await mkdir(join(libraryDir, '2026-09-23_0900_dddddd'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.locator('.it b')).toHaveText([
    'Свежая встреча',
    'Новая встреча',
    'Не удалось прочитать встречу',
    'Старая встреча',
  ]);
  await expect(list.getByText('создаётся…')).toBeVisible();

  await list.getByRole('button', { name: /Свежая встреча/ }).click();
  await expect(page.getByRole('heading', { name: 'Свежая встреча' })).toBeVisible();

  await list.getByRole('button', { name: /Не удалось прочитать/ }).click();
  await expect(page.getByText('Папка: 2026-09-22_1200_cccccc')).toBeVisible();
});

test('re-reads the library when the window gets focus', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();

  await addMeeting(libraryDir, '2026-09-26_0900_dddddd', 'Из OneDrive');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Из OneDrive')).toBeVisible();
});

test('settings show the library folder and save the switches', async () => {
  launched = await launchApp();
  const { page, libraryDir, userDataDir } = launched;
  const settingsFile = async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8'));
  await page.getByRole('button', { name: 'Настройки' }).click();

  await expect(page.getByTestId('library-dir')).toHaveText(libraryDir);
  // Тесты запускают версию для разработки — автозапуск в системе не прописывается.
  await expect(page.getByTestId('launch-notice')).toContainText('установленной программе');

  const autostart = page.getByRole('switch', { name: 'Запускать TextMeet при входе в систему' });
  await expect(autostart).toHaveAttribute('aria-checked', 'true');
  await autostart.click();
  await expect.poll(async () => (await settingsFile()).launchAtLogin).toBe(false);

  await page.getByRole('switch', { name: 'Короткий звук при начале и остановке записи' }).click();
  await expect.poll(async () => (await settingsFile()).recordSounds).toBe(false);
});

test('lists the microphones and saves the choice', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  const select = page.getByRole('combobox', { name: 'Микрофон' });
  await expect(select.locator('option').first()).toHaveText(/^Как в системе/);
  // Поддельные устройства Chromium: кроме «как в системе» есть хотя бы один микрофон.
  await expect.poll(() => select.locator('option').count()).toBeGreaterThan(1);
  const deviceId = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(deviceId ?? '');
  await expect
    .poll(async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).microphoneId)
    .toBe(deviceId);
});

test('changing the library folder switches the meeting list', async () => {
  launched = await launchApp();
  const { page, app, root } = launched;
  const otherDir = join(root, 'other-library');
  await addMeeting(otherDir, '2026-09-27_1000_eeeeee', 'Во второй папке');

  // Системный диалог выбора папки в тесте не нажать — подменяем его ответ.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, otherDir);

  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Изменить…' }).click();
  await expect(page.getByTestId('library-dir')).toHaveText(otherDir);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Во второй папке')).toBeVisible();
});

test('broken settings fall back to defaults and are kept aside', async () => {
  launched = await launchApp({ settings: '{oops' });
  const { page, userDataDir, homeDir } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByTestId('library-dir')).toHaveText(join(homeDir, 'TextMeet'));
  const files = await readdir(userDataDir);
  expect(files.some((f) => f.startsWith('settings.json.broken-'))).toBe(true);
});
