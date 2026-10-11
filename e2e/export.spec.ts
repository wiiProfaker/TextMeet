// Экспорт (План 5): «Скопировать всё», «Сохранить в Word», «Сохранить как текст». Системное окно сохранения
// подменяется в main — в тестах его некому закрыть.
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const createdAt = new Date(2026, 8, 27, 16, 20).toISOString();
const TRANSCRIPT = {
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T14:00:00.000Z',
  speakers: [
    { id: 'me', kind: 'me' },
    { id: 's1', kind: 'other' },
  ],
  segments: [
    { id: 'seg-1', start: 708, end: 712, speakerId: 's1', text: 'Смотри, по бюджету.', edited: false },
    { id: 'seg-2', start: 715, end: 718, speakerId: 's1', text: 'Подрядчиков отдельно.', edited: false },
    { id: 'seg-3', start: 724, end: 726, speakerId: 'me', text: 'Понял.', edited: false },
  ],
};
const EXPECTED_TEXT =
  'Созвон с Ириной\n27 сентября 2026, 16:20 · 32 мин\nУчастники: Ирина, Я\n\n' +
  'Ирина [11:48]\nСмотри, по бюджету. Подрядчиков отдельно.\n\nЯ [12:04]\nПонял.\n';

async function launchWithText(): Promise<LaunchedApp> {
  const app = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Созвон с Ириной',
          createdAt,
          durationSec: 32 * 60 + 15,
          status: 'done',
          speakerNames: { s1: 'Ирина' },
        }),
      },
    ],
    transcripts: { [ID]: TRANSCRIPT },
  });
  await app.page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(app.page.getByLabel('Текст встречи')).toContainText('Подрядчиков отдельно.');
  return app;
}

/** Окно сохранения «сохраняет» в этот файл и запоминает, что предлагала программа. */
async function saveTo(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args.find((a) => typeof a === 'object' && a !== null && 'defaultPath' in a);
      (globalThis as { offered?: unknown }).offered = options;
      return { canceled: false, filePath: target };
    }) as typeof dialog.showSaveDialog;
  }, file);
}

const offered = (app: ElectronApplication): Promise<{ defaultPath: string }> =>
  app.evaluate(() => (globalThis as { offered?: { defaultPath: string } }).offered ?? { defaultPath: '' });

test('copies the whole text, plain and formatted', async () => {
  launched = await launchWithText();
  const { app, page } = launched;
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Скопировать всё' }).click();
  await expect(page.getByRole('button', { name: /Скопировано/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Экспорт/ })).toBeVisible({ timeout: 5_000 });

  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(text.replace(/\r\n/g, '\n')).toBe(EXPECTED_TEXT);
  const html = await app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    if (!item?.types.includes('text/html')) return '';
    return ((await item.getType('text/html')) as Blob).text();
  });
  expect(html).toContain('<b>Ирина</b>');
});

test('saves a Word file and a text file, starting the second time in the same folder', async () => {
  launched = await launchWithText();
  const { app, page, root, userDataDir } = launched;
  const docx = join(root, 'out', 'итоги.docx');
  await mkdir(dirname(docx), { recursive: true });

  await saveTo(app, docx);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Сохранить в Word (.docx)…' }).click();
  await expect.poll(() => existsSync(docx)).toBe(true);
  expect((await readFile(docx)).subarray(0, 2).toString()).toBe('PK');
  expect((await offered(app)).defaultPath).toMatch(/Созвон с Ириной\.docx$/);

  const txt = join(root, 'out', 'итоги.txt');
  await saveTo(app, txt);
  await page.getByRole('button', { name: /Экспорт/ }).click();
  await page.getByRole('menuitem', { name: 'Сохранить как текст (.txt)…' }).click();
  await expect.poll(() => existsSync(txt)).toBe(true);
  expect((await offered(app)).defaultPath).toBe(join(dirname(docx), 'Созвон с Ириной.txt'));
  const bytes = await readFile(txt);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(bytes.toString('utf8').slice(1).replace(/\r\n/g, '\n')).toBe(EXPECTED_TEXT);
  expect(JSON.parse(await readFile(join(userDataDir, 'settings.json'), 'utf8'))).toMatchObject({
    exportDir: dirname(docx),
  });
});

test('there is nothing to export before the meeting has text', async () => {
  launched = await launchApp({
    meetings: [{ id: ID, json: meetingJson(ID, { title: 'Без текста', status: 'recorded' }) }],
  });
  const { page } = launched;
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Без текста/ }).click();
  await expect(page.getByRole('heading', { name: 'Без текста' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Экспорт/ })).toBeHidden();
});
