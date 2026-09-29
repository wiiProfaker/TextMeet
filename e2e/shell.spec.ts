import { readFile } from 'node:fs/promises';
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
