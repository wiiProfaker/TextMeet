// Расшифровка в программе: поддельные движки (TEXTMEET_TEST_ASR=fake) — проверяется склейка, а не качество.
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  holdTranscription,
  launchApp,
  meetingJson,
  openSettings,
  pollMeetingJson,
  readMeetingJson,
  toneWebm,
  waitForRecorder,
  type LaunchedApp,
} from './helpers';

// Настоящая запись, запуск процесса расшифровки и ожидания до 20 с — больше обычных 30 с на тест.
test.describe.configure({ timeout: 60_000 });

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

const OLD_TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-25T12:00:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'seg-1', start: 0, end: 1, speakerId: 's1', text: 'Старый текст.', edited: false }],
};

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
  // В списке у готовой встречи пометки нет: только время и длительность.
  await expect(page.getByRole('button', { name: /Созвон с Ириной/ }).locator('.meta-line')).toHaveText(
    /^\d{2}:\d{2} · меньше минуты$/,
  );
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
  // В списке встреч: название встречи справа — тоже кнопка (переименовать).
  await expect(
    page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }),
  ).toContainText('ошибка расшифровки');
  // Текста ещё не было — «заново» не к чему.
  await expect(page.getByRole('button', { name: 'Расшифровать', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toHaveCount(0);

  for (const file of ['mic.webm', 'system.webm']) await toneWebm(join(libraryDir, ID, 'audio', file), 2);
  await banner.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByLabel('Текст встречи')).toBeVisible({ timeout: 20_000 });
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', errorMessage: null });
});

test('meetings left transcribing or queued by the previous run are transcribed on start', async () => {
  // Прошлый запуск закрылся посреди расшифровки одной встречи, другая ждала очереди.
  const queuedId = '2026-09-25_1500_d4e5f6';
  launched = await launchApp({
    meetings: [
      recorded({ status: 'transcribing', participantsHint: 2 }),
      {
        id: queuedId,
        json: meetingJson(queuedId, {
          title: 'Планёрка',
          createdAt: '2026-09-25T12:00:00.000Z',
          durationSec: 3,
          tracks: TRACKS,
          status: 'queued',
          participantsHint: 2,
        }),
        audio: { 'mic.webm': 2, 'system.webm': 2 },
      },
    ],
  });
  const { page, libraryDir } = launched;
  for (const id of [ID, queuedId]) {
    await expect.poll(async () => (await pollMeetingJson(libraryDir, id))?.status, { timeout: 20_000 }).toBe('done');
  }
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Спикер 1');
  await page.getByRole('button', { name: /Планёрка/ }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Спикер 1');
});

test('«Расшифровать заново» replaces the text and keeps the earlier answer preselected', async () => {
  launched = await launchApp({
    meetings: [recorded({ status: 'done', participantsHint: 4, model: 'gigaam-v3-e2e-rnnt' })],
    transcripts: { [ID]: OLD_TRANSCRIPT },
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
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toBeFocused();

  // Пока новая расшифровка идёт, старый текст виден, а над ним — её ход (модели в тестах «скачиваются» мгновенно).
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: /В очереди на расшифровку|Скачиваем модель GigaAM v3|Готовим звук/ }),
  ).toBeVisible();
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');
  await expect(
    page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }),
  ).toContainText(/в очереди на расшифровку|скачиваем модель|расшифровка/);

  await transcription.release();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
  await expect(page.getByText('Текст заменится, когда новая расшифровка закончится.')).toBeHidden();
  await expect(page.getByLabel('Текст встречи')).not.toContainText('Старый текст.');
  await expect(page.getByText('2 участника')).toBeVisible();
});

test('after a failed re-run the old text stays and another number of participants can be chosen', async () => {
  launched = await launchApp({
    meetings: [{ ...recorded({ status: 'done', participantsHint: 4, model: 'gigaam-v3-e2e-rnnt' }), audio: {} }],
    transcripts: { [ID]: OLD_TRANSCRIPT },
  });
  const { page, libraryDir } = launched;
  for (const file of ['mic.webm', 'system.webm']) await writeFile(join(libraryDir, ID, 'audio', file), 'это не звук');
  await page.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  await page.getByRole('dialog', { name: 'Расшифровать заново' }).getByRole('button', { name: 'Расшифровать' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Ошибка расшифровки' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Текст встречи')).toContainText('Старый текст.');

  for (const file of ['mic.webm', 'system.webm']) await toneWebm(join(libraryDir, ID, 'audio', file), 2);
  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  const dialog = page.getByRole('dialog', { name: 'Расшифровать заново' });
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();
  await expect(page.getByLabel('Текст встречи')).toContainText('Проверка расшифровки', { timeout: 20_000 });
  expect(await readMeetingJson(libraryDir, ID)).toMatchObject({ status: 'done', participantsHint: 3 });
});

test('settings show the transcription model and that it is not downloaded yet', async () => {
  launched = await launchApp();
  const { page } = launched;
  await openSettings(page, 'Расшифровка');
  await expect(page.getByRole('tabpanel', { name: 'Расшифровка' })).toBeVisible();
  const selected = page.getByRole('group', { name: 'Выбрана' });
  await expect(selected.getByRole('article', { name: 'GigaAM v3' })).toBeVisible();
  await expect(selected).toContainText('Скачается при первой расшифровке.');
  // Общие модели голосов ещё не скачаны — их строки нет.
  await expect(page.getByRole('list', { name: 'Общие модели' })).toHaveCount(0);
});
