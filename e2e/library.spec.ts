// Библиотека: прослушивание с места реплики, правка, спикеры, поиск, удаление (План 4).
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
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
  // 10 с: после перехода к 0:04 запись успеет поиграть, пока тест проверяет её.
  audio: { 'mic.webm': 10 },
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
  await expect(text.getByRole('status')).toContainText('Реплика 0:04 удалена');
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

test('two deleted segments are brought back one by one, the latest first', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  const field = text.getByRole('textbox', { name: 'Текст реплики' });
  const undo = text.getByRole('status');

  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await field.fill('');
  await field.press('Enter');
  await expect(undo).toContainText('Реплика 0:04 удалена');
  // После удаления фокус — на «Вернуть»: в конце длинного текста его иначе не найти.
  await expect(page.getByRole('button', { name: 'Вернуть' })).toBeFocused();

  await text.getByRole('button', { name: 'С подрядчиками или без?' }).click();
  await field.fill('');
  await field.press('Enter');
  await expect(text.locator('.row')).toHaveCount(1);
  await expect(undo).toContainText('Реплика 0:02 удалена');

  await page.getByRole('button', { name: 'Вернуть' }).click();
  await expect(text.locator('.row')).toHaveCount(2);
  await expect(undo).toContainText('Реплика 0:04 удалена');

  await page.getByRole('button', { name: 'Вернуть' }).click();
  await expect(text.locator('.row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Вернуть' })).toHaveCount(0);
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
  expect((await pollMeetingJson(libraryDir, ID))?.title).toBe('Бюджет на октябрь');
});

test('a speaker is renamed in the whole meeting, and the same name merges two speakers', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const speakers = page.getByLabel('Спикеры');
  const text = page.getByLabel('Текст встречи');

  await speakers.getByRole('button', { name: 'Спикер 1' }).click();
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).fill('Ирина');
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).press('Enter');
  await expect(speakers.getByRole('button', { name: 'Ирина' })).toBeVisible();
  // Поле имени заменилось чипом — фокус на нём, а не на <body>.
  await expect(speakers.getByRole('button', { name: 'Ирина' })).toBeFocused();
  await expect(text.locator('.row').first()).toContainText('Ирина');
  await expect.poll(async () => (await pollMeetingJson(libraryDir, ID))?.speakerNames).toEqual({ s1: 'Ирина' });

  await speakers.getByRole('button', { name: 'Спикер 2' }).click();
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).fill('ирина');
  await speakers.getByRole('textbox', { name: 'Имя спикера' }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Объединить «Спикер 2» и «Ирина»?' });
  await dialog.getByRole('button', { name: 'Объединить' }).click();
  await expect(dialog).toBeHidden();
  // «Спикер 2» объединили с «Ириной» — фокус на её чипе.
  await expect(speakers.getByRole('button', { name: 'Ирина' })).toBeFocused();
  await expect(speakers.getByRole('listitem')).toHaveText(['Я', 'Ирина']);
  await expect(text.locator('.row').nth(2)).toContainText('Ирина');
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s1', 'me', 's1']);
});

test('the speaker of one segment is changed from the menu, also to a new speaker', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir } = launched;
  await openMeeting(page);
  const rows = page.getByLabel('Текст встречи').locator('.row');

  await rows.nth(1).getByRole('button', { name: 'Я', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Кто говорит в этой реплике' });
  await expect(menu.getByRole('menuitemradio', { name: 'Я' })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemradio', { name: 'Спикер 2' }).click();
  await expect(menu).toBeHidden();
  await expect(rows.nth(1)).toContainText('Спикер 2');
  // У «Я» не осталось реплик — его нет в строке «Спикеры».
  await expect(page.getByLabel('Спикеры').getByRole('listitem')).toHaveText(['Спикер 1', 'Спикер 2']);

  await rows.nth(0).getByRole('button', { name: 'Спикер 1', exact: true }).click();
  await menu.getByRole('menuitem', { name: 'Новый собеседник' }).click();
  await expect(rows.nth(0)).toContainText('Спикер 3');
  await expect
    .poll(async () => (await pollTranscript(libraryDir))?.segments.map((s) => s.speakerId))
    .toEqual(['s3', 's2', 's2']);

  // Esc закрывает меню без изменений, повторный щелчок по имени — тоже.
  const who = rows.nth(2).getByRole('button', { name: 'Спикер 2', exact: true });
  await who.click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(who).toBeFocused();
  await who.click();
  await expect(menu).toBeVisible();
  await who.click();
  await expect(menu).toBeHidden();
});

test('«Удалить аудио» moves the audio to the trash and keeps the text', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page, libraryDir, trashDir } = launched;
  await openMeeting(page);
  // Аудио удаляется, когда запись готова к прослушиванию.
  await expect(page.getByRole('button', { name: 'Слушать', exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Удалить аудио…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить аудио?' });
  await expect(dialog).toContainText('Запись (меньше минуты, меньше 1 МБ) переместится в Корзину.');
  await dialog.getByRole('button', { name: 'Удалить аудио' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator('.meta')).toContainText('аудио удалено');
  await expect(page.getByRole('button', { name: 'Слушать', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Расшифровать заново' })).toBeHidden();
  await expect(page.getByLabel('Текст встречи')).toContainText('Без подрядчиков.');
  expect(existsSync(join(libraryDir, ID, 'audio'))).toBe(false);
  expect(await readdir(trashDir)).toEqual(['1-audio']);
  expect(await pollMeetingJson(libraryDir, ID)).toMatchObject({ audioDeleted: true, tracks: [] });

  await page.getByRole('button', { name: 'Ещё' }).click();
  await expect(page.getByRole('menuitem', { name: 'Удалить аудио…' })).toHaveCount(0);
});

test('«Удалить встречу» moves the meeting folder to the trash and selects the next meeting', async () => {
  const OTHER = '2026-09-24_1000_d4e5f6';
  launched = await launchApp({
    meetings: [
      doneMeeting(),
      { id: OTHER, json: meetingJson(OTHER, { title: 'Планёрка', createdAt: '2026-09-24T07:00:00.000Z' }) },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page, libraryDir, trashDir } = launched;
  await openMeeting(page);

  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Удалить встречу…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить встречу «Созвон с Ириной»?' });
  await dialog.getByRole('button', { name: 'Удалить встречу' }).click();

  await expect(page.getByRole('heading', { name: 'Планёрка' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).not.toContainText('Созвон с Ириной');
  expect(existsSync(join(libraryDir, ID))).toBe(false);
  expect(await readdir(trashDir)).toEqual([`1-${ID}`]);
});

test('a folder that cannot be read can be deleted too', async () => {
  launched = await launchApp({ meetings: [{ id: ID, json: '{ сломано' }] });
  const { page, libraryDir } = launched;
  await page.getByRole('button', { name: /Не удалось прочитать встречу/ }).click();
  await page.getByRole('button', { name: 'Удалить папку…' }).click();
  await page.getByRole('dialog', { name: 'Удалить папку встречи?' }).getByRole('button', { name: 'Удалить папку' }).click();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  expect(existsSync(join(libraryDir, ID))).toBe(false);
});

test('«Расшифровать заново» warns that edits and names will be lost', async () => {
  launched = await launchApp({
    meetings: [doneMeeting({ speakerNames: { s1: 'Ирина' } })],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  await openMeeting(page);
  await page.getByRole('button', { name: 'Расшифровать заново' }).click();
  await expect(page.getByRole('dialog', { name: 'Расшифровать заново' })).toContainText(
    'ваши правки и имена собеседников пропадут',
  );
});

test('search finds segments and titles in all meetings and opens the meeting at the segment', async () => {
  const OTHER = '2026-09-24_1000_d4e5f6';
  launched = await launchApp({
    meetings: [
      doneMeeting(),
      { id: OTHER, json: meetingJson(OTHER, { title: 'Бюджет 2027', createdAt: '2026-09-24T07:00:00.000Z' }) },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  const { page } = launched;
  const box = page.getByRole('searchbox', { name: 'Поиск по всем встречам' });
  const found = page.getByRole('navigation', { name: 'Найдено' });

  await box.fill('БЮДЖЕТ');
  await expect(found.getByRole('status')).toHaveText('Найдено в 2 встречах');
  await expect(found.getByRole('group', { name: 'Бюджет 2027' })).toBeVisible();
  await found.getByRole('button', { name: /По бюджету на октябрь/ }).click();

  await expect(page.getByRole('heading', { name: 'Созвон с Ириной' })).toBeVisible();
  const row = page.getByLabel('Текст встречи').locator('.row.found');
  await expect(row).toContainText('По бюджету на октябрь');
  await expect(row.locator('mark')).toHaveText('бюджет');
  await expect(found.getByRole('button', { name: /По бюджету на октябрь/ })).toHaveAttribute('aria-current', 'true');

  await box.fill('ёлка зима');
  await expect(found.getByRole('status')).toHaveText('Ничего не найдено');

  await box.press('Escape');
  await expect(found).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Встречи' })).toContainText('Бюджет 2027');
  await expect(page.getByLabel('Текст встречи').locator('mark')).toHaveCount(0);
});

test('search sees a segment right after it was edited', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  await text.getByRole('button', { name: 'Без подрядчиков.' }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('Без подрядчиков из Самары.');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.getByRole('button', { name: 'Без подрядчиков из Самары.' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('самары');
  await expect(page.getByRole('navigation', { name: 'Найдено' }).getByRole('status')).toHaveText('Найдено в 1 встрече');
});

test('search results follow a text edit and a deleted segment', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  await openMeeting(page);
  const text = page.getByLabel('Текст встречи');
  const found = page.getByRole('navigation', { name: 'Найдено' });
  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('октябрь');
  await expect(found.getByRole('status')).toHaveText('Найдено в 1 встрече');

  await text.getByRole('button', { name: /По бюджету на октябрь/ }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('По бюджету осталась половина.');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.getByRole('button', { name: 'По бюджету осталась половина.' })).toBeVisible();
  await expect(found.getByRole('status')).toHaveText('Ничего не найдено');

  // Удалённая реплика тоже пропадает из найденного.
  await page.getByRole('searchbox', { name: 'Поиск по всем встречам' }).fill('половина');
  await expect(found.getByRole('status')).toHaveText('Найдено в 1 встрече');
  await text.getByRole('button', { name: 'По бюджету осталась половина.' }).click();
  await text.getByRole('textbox', { name: 'Текст реплики' }).fill('');
  await text.getByRole('textbox', { name: 'Текст реплики' }).press('Enter');
  await expect(text.locator('.row')).toHaveCount(2);
  await expect(found.getByRole('status')).toHaveText('Ничего не найдено');
});

test('the clear button empties the search and keeps the focus in the field', async () => {
  launched = await launchApp({ meetings: [doneMeeting()], transcripts: { [ID]: TRANSCRIPT } });
  const { page } = launched;
  const box = page.getByRole('searchbox', { name: 'Поиск по всем встречам' });
  await box.fill('бюджет');
  await page.getByRole('button', { name: 'Очистить поиск' }).click();
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();
});
