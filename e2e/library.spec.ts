// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, meetingJson, pollMeetingJson, type LaunchedApp } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-25_1430_a1b2c3';

const TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-25T12:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
    { id: 's2', kind: 'other' },
  ],
  segments: [
    { id: 'seg-1', start: 0.5, end: 1.8, speakerId: 's1', text: 'По бюджету на октябрь осталась половина.', edited: false },
    { id: 'seg-2', start: 2, end: 3.5, speakerId: 'me', text: 'С подрядчиками или без?', edited: false },
    { id: 'seg-3', start: 4, end: 5.5, speakerId: 's2', text: 'Без подрядчиков.', edited: false },
  ],
};

/** Расшифрованная встреча со звуком (6 с тона; сведение программа сделает при запуске). */
const doneMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  json: meetingJson(ID, {
    title: 'Созвон с Ириной',
    durationSec: 6,
    status: 'done',
    model: 'gigaam-v3-e2e-rnnt',
    tracks: [{ kind: 'mic', file: 'mic.webm', startOffsetMs: 0 }],
    ...overrides,
  }),
  audio: { 'mic.webm': 6 },
});

async function openMeeting(page: Page, title = 'Созвон с Ириной'): Promise<void> {
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** Для expect.poll: transcript.json могут как раз перезаписывать — тогда undefined, и опрос повторится. */
const pollTranscript = (libraryDir: string): Promise<{ editedAt?: string; segments: Record<string, unknown>[] } | undefined> =>
  readFile(join(libraryDir, ID, 'transcript.json'), 'utf8')
    .then((text) => JSON.parse(text) as { segments: Record<string, unknown>[] })
    .catch(() => undefined);

const audioState = (page: Page) =>
  page.evaluate(() => {
    const audio = document.querySelector('audio');
    return audio ? { time: audio.currentTime, paused: audio.paused } : null;
  });

test('a click on the time of a segment plays the recording from there and marks the playing segment', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  // Время становится кнопкой, когда запись готова к прослушиванию.
  await text.getByRole('button', { name: 'Слушать с 0:04' }).click({ timeout: 15_000 });

  await expect.poll(async () => (await audioState(page))?.time ?? 0).toBeGreaterThanOrEqual(4);
  expect((await audioState(page))?.paused).toBe(false);
  await expect(text.locator('.row[aria-current="true"]')).toContainText('Без подрядчиков.');

  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect.poll(async () => (await audioState(page))?.paused).toBe(true);
});

test('the time of a segment is plain text while there is nothing to play', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Созвон с Ириной', status: 'done', tracks: [] }) }],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  await expect(text).toContainText('0:04');
  await expect(text.getByRole('button', { name: /Слушать с/ })).toHaveCount(0);
});

test('a click on the text edits the segment: Enter saves, Escape cancels', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');

  await text.getByRole('button', { name: 'С подрядчиками или без?' }).click();
  const field = text.getByRole('textbox', { name: 'Текст реплики' });
  await field.fill('Это с учётом подрядчиков?');
  await field.press('Enter');
  await expect(field).toBeHidden();
  await expect(text.getByRole('button', { name: 'Это с учётом подрядчиков?' })).toBeVisible();
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments[1])
    .toMatchObject({ text: 'Это с учётом подрядчиков?', edited: true });

  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await field.fill('Что-то другое');
  await field.press('Escape');
  await expect(text.getByRole('button', { name: 'Без подрядчиков.' })).toBeVisible();
  expect((await pollTranscript(libraryDir))?.segments[2]).toMatchObject({ text: 'Без подрядчиков.', edited: false });
});

test('an emptied segment is deleted and «Вернуть» brings it back', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');

  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.locator('.row')).toHaveCount(2);
  // Спикер 2 остался без реплик — из строки «Спикеры» он исчез.
  await expect(page.getByLabel('Спикеры')).not.toContainText('Спикер 2');
  await expect(page.getByRole('status')).toContainText('Реплика 0:04 удалена');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.length).toBe(2);

  await page.getByRole('button', { name: 'Вернуть' }).click();
  await expect(text.locator('.row')).toHaveCount(3);
  await expect(page.getByLabel('Спикеры')).toContainText('Спикер 2');
  await expect.poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.id)).toEqual([
    'seg-1',
    'seg-2',
    'seg-3',
  ]);
});

test('a click on the title renames the meeting', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);

  await page.getByRole('heading', { name: 'Созвон с Ириной' }).getByRole('button').click();
  const field = page.getByRole('textbox', { name: 'Название встречи' });
  await field.fill('  Бюджет на октябрь ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).toContainText('Бюджет на октябрь');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.title).toBe('Бюджет на октябрь');

  // Пустое название не сохраняется.
  await page.getByRole('heading', { name: 'Бюджет на октябрь' }).getByRole('button').click();
  await field.fill('   ');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'Бюджет на октябрь' })).toBeVisible();
});
