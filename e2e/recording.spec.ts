import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, pollMeetingJson, readMeetingJson, waitForRecorder, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

/** Папки встреч в библиотеке. */
const meetingIds = async (libraryDir: string): Promise<string[]> =>
  (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

async function startRecording(page: Page): Promise<void> {
  await waitForRecorder(page);
  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByRole('main', { name: 'Идёт запись' })).toBeVisible();
  // Таймер пошёл — запись действительно идёт, куски пишутся на диск.
  await expect(page.getByTestId('live-timer')).not.toHaveText('00:00:00', { timeout: 10_000 });
}

test('records both tracks, asks about participants and prepares the recording for listening', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;

  await startRecording(page);
  await expect
    .poll(() => page.getByRole('meter', { name: 'Уровень звука компьютера' }).first().getAttribute('aria-valuenow'))
    .not.toBe('0');
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[2-9]/, { timeout: 10_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Запись остановлена' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Название' }).fill('Созвон с Ириной');
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Выберите, сколько было человек');
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog).toBeHidden();

  const [id] = await meetingIds(libraryDir);
  // Ответ в окне ставит встречу в очередь расшифровки — чуть позже, чем закрывается окно.
  await expect.poll(async () => (await pollMeetingJson(libraryDir, id!))?.status).toMatch(/^(queued|transcribing|done)$/);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({
    title: 'Созвон с Ириной',
    participantsHint: 3,
    tracks: [{ kind: 'mic' }, { kind: 'system' }].map((t) => expect.objectContaining(t)),
  });
  for (const file of ['mic.webm', 'system.webm']) {
    expect((await stat(join(libraryDir, id!, 'audio', file))).size).toBeGreaterThan(0);
  }
  await expect(page.getByRole('heading', { name: 'Созвон с Ириной' })).toBeVisible();
  await expect(page.getByText('3 участника')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Слушать' })).toBeVisible({ timeout: 15_000 });
  expect(existsSync(join(libraryDir, id!, 'audio', 'mix.opus'))).toBe(true);
  // Плеер получает файл через протокол tm-media и знает его длительность (нужна для перемотки).
  const duration = await page.locator('audio').evaluate(
    (audio: HTMLAudioElement) =>
      new Promise<number>((resolve) => {
        if (audio.readyState >= 1) resolve(audio.duration);
        else audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true });
      }),
  );
  expect(duration).toBeGreaterThan(1.5);
});

test('records only the microphone when the switch is off, then turns the switch back on', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  const toggle = page.getByRole('switch', { name: 'Звук компьютера' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await startRecording(page);
  await expect(page.getByText('выключен для этой записи')).toBeVisible();
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await meetingIds(libraryDir);
  expect(await readdir(join(libraryDir, id!, 'audio'))).toContain('mic.webm');
  expect(await readdir(join(libraryDir, id!, 'audio'))).not.toContain('system.webm');
  expect((await readMeetingJson(libraryDir, id!)).participantsHint).toBeNull();
  await expect(page.getByRole('switch', { name: 'Звук компьютера' })).toHaveAttribute('aria-checked', 'true');
});

test('keeps recording the microphone when the computer sound cannot be captured', async () => {
  launched = await launchApp({ media: 'fail' });
  const { page, libraryDir } = launched;

  await startRecording(page);
  await expect(page.getByText('Звук компьютера не записывается')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Идёт запись' }).getByText('не записывается')).toBeVisible();
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await meetingIds(libraryDir);
  expect(await readdir(join(libraryDir, id!, 'audio'))).toContain('mic.webm');
});

test('explains a refused microphone and leaves no empty meeting', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await waitForRecorder(page);
  await app.evaluate(({ session }) => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  });

  await page.getByRole('button', { name: /Начать запись/ }).click();

  await expect(page.getByRole('alert')).toContainText('Нет доступа к микрофону');
  await expect(page.getByRole('button', { name: 'Открыть настройки системы' })).toBeVisible();
  expect(await meetingIds(libraryDir)).toEqual([]);
  await page.getByRole('button', { name: 'Скрыть' }).click();
  await expect(page.getByText('Нет доступа к микрофону')).toBeHidden();
});

test('recovers a recording interrupted by a crash at the next start', async () => {
  const id = '2026-09-27_1015_abcdef';
  launched = await launchApp({
    meetings: [
      {
        id,
        json: {
          schemaVersion: 1,
          id,
          title: 'Прерванная встреча',
          createdAt: '2026-09-27T07:15:00.000Z',
          durationSec: null,
          source: 'recording',
          participantsHint: null,
          model: null,
          status: 'recording',
          errorMessage: null,
          speakerNames: {},
          tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
        },
        audio: { 'mic.webm': 3 },
      },
    ],
  });
  const { page, libraryDir } = launched;

  await expect(page.getByText('восстановлена после сбоя')).toBeVisible();
  await expect
    .poll(async () => (await pollMeetingJson(libraryDir, id))?.durationSec, { timeout: 15_000 })
    .toBeCloseTo(3, 0);
  expect(await readMeetingJson(libraryDir, id)).toMatchObject({ status: 'recorded', recovered: true });
  await page.getByRole('button', { name: /Прерванная встреча/ }).click();
  await expect(page.getByText('Запись восстановлена после сбоя')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Слушать' })).toBeVisible();
});

test('saves the recording when the recorder window crashes and can record again', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await startRecording(page);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === 'TextMeet — запись')
      ?.webContents.forcefullyCrashRenderer();
  });

  await expect(page.getByRole('button', { name: /Начать запись/ })).toBeVisible({ timeout: 15_000 });
  const [first] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, first!)).toMatchObject({ status: 'recorded', recovered: true });

  await startRecording(page);
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await expect(page.getByRole('dialog', { name: 'Запись остановлена' })).toBeVisible();
  expect(await meetingIds(libraryDir)).toHaveLength(2);
});

test('asks before quitting during a recording and saves it on exit', async () => {
  launched = await launchApp();
  const { page, app, libraryDir } = launched;
  await startRecording(page);

  // Системное окно в тесте не нажать — отвечаем за пользователя: сначала «Продолжить запись».
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await expect(page.getByTestId('live-timer')).toBeVisible();
  await expect(page.getByRole('main', { name: 'Идёт запись' })).toBeVisible();

  // Теперь «Остановить и выйти».
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  const closed = app.waitForEvent('close');
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await closed;

  const [id] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({ status: 'recorded' });
});
