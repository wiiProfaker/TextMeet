import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, recorderWindow, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('closing the window hides it to the tray; the recorder window stays hidden and ready', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  const windowStates = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .map((w) => `${w.getTitle()}: ${w.isVisible() ? 'видно' : 'скрыто'}`)
        .sort(),
    );

  await expect.poll(() => page.evaluate(() => window.textmeet.getAppInfo().then((i) => i.recorderReady))).toBe(true);
  await expect.poll(windowStates).toEqual(['TextMeet — запись: скрыто', 'TextMeet: видно']);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'TextMeet')
      ?.close();
  });

  await expect.poll(windowStates).toEqual(['TextMeet — запись: скрыто', 'TextMeet: скрыто']);
});

test('the recorder window cannot use the main window API', async () => {
  launched = await launchApp();
  const recorder = await recorderWindow(launched.app);
  await expect(recorder.evaluate(() => window.textmeet.getSettings())).rejects.toThrow('не из главного окна');
});

test('the main window cannot pretend to be the recorder window', async () => {
  launched = await launchApp();
  const { page, userDataDir } = launched;
  await page.evaluate(() => window.recorder.ready());
  await expect
    .poll(() => readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8'))
    .toContain('recorder:ready: сообщение не из окна записи');
});

test('the general tab shows the version and opens the list of licenses', async () => {
  launched = await launchApp();
  const { app, page } = launched;
  // Файл не открываем на самом деле — запоминаем, что программа попросила открыть.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { openedPaths?: string[] }).openedPaths = opened;
    shell.openPath = async (path: string) => {
      opened.push(path);
      return '';
    };
  });
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('tab', { name: 'Общие' }).click();
  const about = page.locator('footer.about');
  await expect(about).toContainText('TextMeet 1.0.0');
  await about.getByRole('button', { name: 'Лицензии' }).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as { openedPaths?: string[] }).openedPaths ?? []))
    .toEqual([expect.stringMatching(/THIRD-PARTY-NOTICES\.txt$/)]);
});

/** Подмена GitHub: отдаёт «последний выпуск» и считает запросы. */
async function releaseServer(tag: string): Promise<{ url: string; requests(): number; close(): Promise<void> }> {
  let count = 0;
  const server: Server = createServer((_req, res) => {
    count += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        tag_name: tag,
        html_url: `https://github.com/wiiProfaker/TextMeet/releases/tag/${tag}`,
        draft: false,
        prerelease: false,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/releases/latest`,
    requests: () => count,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test('shows the new version banner and hides it for that version', async () => {
  const github = await releaseServer('v9.0.0');
  try {
    const env = { TEXTMEET_TEST_UPDATE_URL: github.url, TEXTMEET_TEST_UPDATE_DELAY_MS: '0' };
    launched = await launchApp({ env });
    const { page, userDataDir } = launched;
    const banner = page.getByRole('region', { name: 'Новая версия' });
    await expect(banner).toContainText('Вышла версия 9.0.0');
    await banner.getByRole('button', { name: 'Скрыть' }).click();
    await expect(banner).toHaveCount(0);
    await expect
      .poll(async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).dismissedUpdate)
      .toBe('9.0.0');
    // После перезапуска окна — плашки нет: эту версию скрыли.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Настройки' })).toBeVisible();
    await expect(banner).toHaveCount(0);

    // Проверка выключена — к серверу никто не обращается.
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page.getByRole('tab', { name: 'Общие' }).click();
    await page.getByRole('switch', { name: 'Проверять, не вышла ли новая версия' }).click();
    await expect
      .poll(async () => JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8')).checkUpdates)
      .toBe(false);
  } finally {
    await github.close();
  }
});

test('the new version banner is not shown when checks are turned off', async () => {
  const github = await releaseServer('v9.0.0');
  try {
    launched = await launchApp({
      env: { TEXTMEET_TEST_UPDATE_URL: github.url, TEXTMEET_TEST_UPDATE_DELAY_MS: '0' },
      settings: { schemaVersion: 1, checkUpdates: false },
    });
    const { page } = launched;
    await expect(page.getByRole('button', { name: 'Настройки' })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(github.requests()).toBe(0);
    await expect(page.getByRole('region', { name: 'Новая версия' })).toHaveCount(0);
  } finally {
    await github.close();
  }
});
