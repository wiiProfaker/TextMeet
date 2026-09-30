// Расшифровка в программе: поддельные движки (TEXTMEET_TEST_ASR=fake) — проверяется склейка, а не качество.
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  holdTranscription,
  launchApp,
  meetingJson,
  readMeetingJson,
  toneWebm,
  waitForRecorder,
  type LaunchedApp,
} from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-25_1430_a1b2c3';
const TRACKS = [
  { kind: 'mic', file: 'mic.webm', startOffsetMs: 0 },
  { kind: 'system', file: 'system.webm', startOffsetMs: 0 },
];
const recorded = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  json: meetingJson(ID, { title: 'Созвон с Ириной', durationSec: 3, tracks: TRACKS, ...overrides }),
  audio: { 'mic.webm': 2, 'system.webm': 2 },
});

test('a new recording is transcribed after the stop dialog', async () => {
  launched = await launchApp();
  const { page, libraryDir } = launched;
  await waitForRecorder(page);
  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[3-9]/, { timeout: 15_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Запись остановлена' });
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  const text = page.getByLabel('Текст встречи');
  await expect(text).toBeVisible({ timeout: 20_000 });
  await expect(text).toContainText('Я');
  await expect(text).toContainText('Проверка расшифровки');
  const [id] = (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  expect(await readMeetingJson(libraryDir, id!)).toMatchObject({ status: 'done', model: 'gigaam-v3-e2e-rnnt' });
});

test('«Расшифровать» on a saved recording asks for participants and shows the text of both tracks', async () => {
  launched = await launchApp({ meetings: [recorded()] });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByText('Текста пока нет.')).toBeVisible();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Расшифровать' });
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByLabel('Спикеры')).toContainText('Я');
  await expect(page.getByLabel('Спикеры')).toContainText('Спикер 1');
  await expect(page.getByLabel('Текст встречи').locator('.row')).toHaveCount(2);
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', participantsHint: 3 });
  // В списке у готовой встречи пометки нет.
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).not.toContainText('расшифров');
});

test('a failed transcription shows the reason and «Повторить» tries again', async () => {
  launched = await launchApp({ meetings: [{ ...recorded(), audio: {} }] });
  const { page, libraryDir } = launched;
  // Обе дорожки испорчены — ffmpeg не прочитает ни одну (с одной целой встреча расшифровалась бы по ней).
  for (const file of ['mic.webm', 'system.webm']) await writeFile(join(libraryDir, ID, 'audio', file), 'это не звук');
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать', exact: true }).click();
  await page.getByRole('dialog', { name: 'Расшифровать' }).getByRole('button', { name: 'Расшифровать' }).click();

  const banner = page.getByRole('alert').filter({ hasText: 'Ошибка расшифровки' });
  await expect(banner).toContainText('ffmpeg не прочитал дорожку', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText('ошибка расшифровки');

  for (const file of ['mic.webm', 'system.webm']) await toneWebm(join(libraryDir, ID, 'audio', file), 2);
  await banner.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByLabel('Текст встречи')).toBeVisible({ timeout: 20_000 });
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', errorMessage: null });
});

test('a meeting left in the queue is transcribed after a restart', async () => {
  launched = await launchApp({ meetings: [recorded({ status: 'transcribing', participantsHint: 2 })] });
  const { page, libraryDir } = launched;
  await expect.poll(async () => (await readMeetingJson(libraryDir, ID)).status, { timeout: 20_000 }).toBe('done');
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Спикер 1');
});

test('«Расшифровать заново» replaces the text and keeps the earlier answer preselected', async () => {
  const old = {
    schemaVersion: 1,
    model: 'gigaam-v3-e2e-rnnt',
    createdAt: '2026-09-25T12:00:00.000Z',
    speakers: [{ id: 's1', kind: 'other' }],
    segments: [{ id: 'seg-1', start: 0, end: 1, speakerId: 's1', text: 'Старый текст.', edited: false }],
  };
  launched = await launchApp({
    meetings: [recorded({ status: 'done', participantsHint: 4, model: 'gigaam-v3-e2e-rnnt' })],
    transcripts: { [ID]: old },
  });
  const { app, page } = launched;
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  const transcription = await holdTranscription(app);

  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  const dialog = page.getByRole('dialog', { name: 'Расшифровать заново' });
  await expect(dialog.getByRole('button', { name: '4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(dialog).toBeHidden();

  // Пока новая расшифровка идёт, старый текст виден, а над ним — её ход.
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Готовим звук/ })).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ })).toContainText(/в очереди на расшифровку|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeHidden();
  await expect(page.getByLabel('Текст встречи')).not.toContainText('Старый текст.');
  await expect(page.getByText('2 участника')).toBeVisible();
});

test('settings show the transcription model and that nothing is downloaded yet', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Расшифровка' })).toBeVisible();
  await expect(page.getByText('Скачается при первой расшифровке.')).toBeVisible();
  await expect(page.getByText('Пока ничего не скачано.')).toBeVisible();
});
