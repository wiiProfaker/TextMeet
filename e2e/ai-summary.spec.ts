// Блок «Итоги встречи» (План 9, листы 18–20 макета): поддельный llama-server (TEXTMEET_TEST_LLM) отвечает
// разметкой — «### Главное», список, жирный; на вопрос — «Ответ: <вопрос>».
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, llmRequests, meetingJson, type LaunchedApp, type LaunchOptions } from './helpers';

test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const ID = '2026-09-27_1620_a1b2c3';
const OTHER = '2026-09-28_1100_d4e5f6';

const transcript = (text: string) => ({
  schemaVersion: 1,
  model: 'gigaam-v3-e2e-rnnt',
  createdAt: '2026-09-27T13:52:00.000Z',
  speakers: [{ id: 's1', kind: 'other' }],
  segments: [{ id: 'a', start: 5, end: 9, speakerId: 's1', text, edited: false }],
});

function launch(options: LaunchOptions & { text?: string } = {}): Promise<LaunchedApp> {
  return launchApp({
    meetings: [
      { id: ID, json: meetingJson(ID, { status: 'done', title: 'Созвон с Ириной', speakerNames: { s1: 'Ирина' } }) },
      { id: OTHER, json: meetingJson(OTHER, { status: 'done', title: 'Планёрка с дизайнерами', createdAt: '2026-09-28T08:00:00.000Z' }) },
    ],
    transcripts: { [ID]: transcript(options.text ?? 'Переносим запуск на пятницу.'), [OTHER]: transcript('Макеты к среде.') },
    ...options,
  });
}

const open = (page: Page, title: RegExp) =>
  page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: title }).click();
const block = (page: Page) => page.getByRole('region', { name: 'Итоги встречи' });
const summaryButton = (page: Page) => page.getByRole('button', { name: 'Итоги встречи' });

test('without a model the block offers the AI settings', async () => {
  launched = await launch();
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Скачайте её один раз (около 6 ГБ)');
  await block(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await block(page).getByRole('button', { name: 'Открыть настройки ИИ' }).click();
  await expect(page.getByRole('tab', { name: 'ИИ' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('group', { name: 'Можно скачать' })).toBeVisible();
});

test('the summary is written with a cursor, formatted, saved and announced', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 60 });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(summaryButton(page)).toBeDisabled();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await expect(block(page).getByRole('status')).toHaveText('Итоги готовы', { timeout: 15_000 });
  await expect(summaryButton(page)).toBeEnabled();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect(block(page).locator('b', { hasText: 'Задание:' })).toBeVisible();
  await expect(block(page).locator('ol li')).toHaveText('Проверить итоги.');
  await expect(block(page)).toContainText(/Qwen3\.5 9B · \d\d\.\d\d, \d\d:\d\d/);
  await expect(block(page)).toContainText('Отвечает модель на вашем компьютере — важное проверяйте по тексту встречи.');

  // Свернуть — блок прячется; «Итоги встречи» разворачивает его, не делая итоги заново.
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  expect(await llmRequests(launched.llmLog)).toHaveLength(1);
});

test('«Остановить» keeps what was written; «Обновить» asks before replacing', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Остановить' }).click();
  await expect(block(page)).toContainText('· остановлено');

  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Заменить итоги?' });
  await expect(dialog).toContainText('Ваши вопросы и ответы останутся.');
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  expect(await llmRequests(llmLog)).toHaveLength(1);
  await block(page).getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});

test('own questions are answered, kept in order and deleted', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  const field = block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' });
  // Поле свободно и до того, как запрос пошёл, — вопрос задаём, когда итоги дописаны.
  await expect(block(page).getByRole('status')).toHaveText('Итоги готовы', { timeout: 15_000 });
  await expect(field).toBeEnabled();
  await field.fill('Что решили по срокам?');
  await field.press('Enter');
  await expect(block(page)).toContainText('Ответ: Что решили по срокам?', { timeout: 15_000 });
  await expect(field).toHaveValue('');
  await field.fill('Кто такой Олег?');
  await block(page).getByRole('button', { name: 'Спросить' }).click();
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?', { timeout: 15_000 });
  await expect(block(page).locator('.qa-q')).toHaveText([/^Что решили по срокам\?/, /^Кто такой Олег\?/]);

  await block(page).getByRole('button', { name: 'Удалить вопрос: Что решили по срокам?' }).click();
  await expect(block(page).locator('.qa-q')).toHaveCount(1);
  // Вопросы и итоги — на диске: после перезапуска они на месте.
  await page.reload();
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Ответ: Кто такой Олег?');
});

test('the summary is marked when the text of the meeting changed after it', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { page, libraryDir } = launched;
  const summary = { text: '- Старые итоги', model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-09-27T13:55:00.000Z', status: 'done', sourceHash: 'другой текст' };
  await writeFile(join(libraryDir, ID, 'ai.json'), JSON.stringify({ version: 1, summary, questions: [] }));
  await open(page, /Созвон с Ириной/);
  await expect(block(page)).toContainText('Текст встречи меняли после итогов.');
  await block(page).getByRole('button', { name: 'Обновить итоги' }).click();
  await page.getByRole('dialog', { name: 'Заменить итоги?' }).getByRole('button', { name: 'Заменить' }).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible({ timeout: 15_000 });
  await expect(block(page)).not.toContainText('Текст встречи меняли после итогов.');
});

test('while the model writes for one meeting, another meeting names it and offers to go there', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 300 });
  const { page } = launched;
  await open(page, /Планёрка с дизайнерами/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('пишет…');
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Модель сейчас пишет итоги встречи «Планёрка с дизайнерами».');
  await expect(block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' })).toBeDisabled();
  await block(page).getByRole('button', { name: 'Перейти' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Планёрка с дизайнерами/);
  await expect(block(page).getByRole('button', { name: 'Остановить' })).toBeVisible();
});

test('a meeting too long for the model is not sent', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText(
    'Встреча слишком длинная для Qwen3.5 9B. Выберите другую модель в настройках ИИ или воспользуйтесь «Скопировать для ИИ».',
  );
  expect(await llmRequests(llmLog)).toEqual([]);
});

test('a crashed engine shows the reason and «Повторить» starts it again', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], text: 'УПАДИ, пожалуйста.' });
  const { page, llmLog } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page).getByRole('alert')).toHaveText(/^Модель не смогла ответить — подробности в журнале\./, { timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Повторить' }).click();
  await expect.poll(async () => (await llmRequests(llmLog)).length).toBe(2);
});

test('a busy engine explains itself instead of an empty block', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'] });
  const { app, page } = launched;
  // Модель занята (удаляется, готовится другой запрос, программа закрывается) — main отвечает «busy».
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:summarize');
    ipcMain.handle('ai:summarize', () => 'busy');
  });
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Модель сейчас занята — попробуйте ещё раз через несколько секунд.');
  await block(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(block(page)).toHaveCount(0);
});

test('the busy notice goes away once the model has worked and is free again', async () => {
  launched = await launchWithSummary();
  const { app, page } = launched;
  const busyText = 'Модель сейчас занята — попробуйте ещё раз через несколько секунд.';
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('ai:ask');
    ipcMain.handle('ai:ask', () => 'busy');
  });
  await open(page, /Созвон с Ириной/);
  const field = block(page).getByRole('textbox', { name: 'Свой вопрос к встрече' });
  await field.fill('Что решили?');
  await field.press('Enter');
  await expect(block(page)).toContainText(busyText);
  // Модель занялась и освободилась — сообщение о занятости больше не про сейчас.
  await page.evaluate((id) => window.textmeet.summarize(id), ID);
  await expect(block(page).getByRole('status')).toHaveText('Итоги готовы', { timeout: 15_000 });
  await expect(block(page)).not.toContainText(busyText);
});

test('"Итоги готовы" is announced while the block is collapsed', async () => {
  launched = await launch({ installedModels: ['qwen3.5-9b'], llmTokenMs: 200 });
  const { page } = launched;
  await open(page, /Созвон с Ириной/);
  await summaryButton(page).click();
  await expect(block(page)).toContainText('Qwen3.5 9B · пишет…');
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Итоги готовы' })).toHaveCount(1, { timeout: 20_000 });
});

// Итоги колонкой справа от текста (решения Плана 8, §2.1).
const READY_SUMMARY = {
  text: '### Главное\n- Запуск переносится на пятницу.\n\n### Задачи\n1. Предупредить Олега.',
  model: 'qwen3.5-9b',
  modelTitle: 'Qwen3.5 9B',
  createdAt: '2026-09-27T13:55:00.000Z',
  status: 'done',
  sourceHash: 'x',
};

async function launchWithSummary(): Promise<LaunchedApp> {
  const app = await launch({ installedModels: ['qwen3.5-9b'] });
  await writeFile(join(app.libraryDir, ID, 'ai.json'), JSON.stringify({ version: 1, summary: READY_SUMMARY, questions: [] }));
  return app;
}

/** Размер окна — и дождаться, пока страница его получила (рамка окна — несколько десятков точек). */
/**
 * Окно не бывает больше экрана: на машинах CI экран Mac бывает шириной 1024, и окно 1300 ужимается до него.
 * Поэтому ждём ширину, которую система реально может дать.
 */
async function setWindowSize({ app, page }: LaunchedApp, width: number, height: number): Promise<void> {
  const target = await app.evaluate(({ BrowserWindow, screen }, size) => {
    const area = screen.getPrimaryDisplay().workAreaSize;
    const fitted = { width: Math.min(size.width, area.width), height: Math.min(size.height, area.height) };
    BrowserWindow.getAllWindows()
      .find((w) => /[\/]main[\/]index\.html/.test(w.webContents.getURL()))
      ?.setSize(fitted.width, fitted.height);
    return fitted.width;
  }, { width, height });
  await expect.poll(() => page.evaluate((w) => Math.abs(window.innerWidth - w), target)).toBeLessThan(40);
}

const text = (page: Page) => page.getByRole('region', { name: 'Текст встречи' });
const splitter = (page: Page) => page.getByRole('separator', { name: 'Ширина итогов' });

/** Какую долю области встречи занимает колонка итогов. */
const columnShare = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const side = document.querySelector('.mside')?.getBoundingClientRect().width ?? 0;
    const area = document.querySelector('.mbody')?.getBoundingClientRect().width ?? 1;
    return side / area;
  });

async function boxes(page: Page) {
  const summary = await block(page).boundingBox();
  const transcriptBox = await text(page).boundingBox();
  if (!summary || !transcriptBox) throw new Error('итоги или текст встречи не видны');
  return { summary, text: transcriptBox };
}

test('summary sits to the right of the transcript in a wide window', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  await setWindowSize(launched, 1300, 800);
  await open(page, /Созвон с Ириной/);
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect.poll(async () => {
    const b = await boxes(page);
    return b.summary.x >= b.text.x + b.text.width - 1 && b.summary.height > 400;
  }).toBe(true);
});

test('summary moves above the transcript in a narrow window and back to the right when widened', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  await setWindowSize(launched, 1300, 800);
  await open(page, /Созвон с Ириной/);
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect.poll(async () => (await boxes(page)).summary.x > (await boxes(page)).text.x).toBe(true);
  const wideShare = await columnShare(page);

  await setWindowSize(launched, 760, 700);
  await expect.poll(async () => {
    const b = await boxes(page);
    return b.summary.y + b.summary.height <= b.text.y + 1;
  }).toBe(true);
  await expect(splitter(page)).toBeHidden();

  await setWindowSize(launched, 1300, 800);
  await expect.poll(async () => {
    const b = await boxes(page);
    return b.summary.x >= b.text.x + b.text.width - 1;
  }).toBe(true);
  // Доля колонки прежняя; точные пиксели зависят от окончательного размера окна (на Mac он бывает чуть другим).
  await expect.poll(async () => Math.abs((await columnShare(page)) - wideShare)).toBeLessThan(0.01);
});

test('dragging the splitter changes the summary width and it is remembered after a restart', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  await setWindowSize(launched, 1300, 800);
  await open(page, /Созвон с Ириной/);
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  const before = (await boxes(page)).summary.width;
  const handle = await splitter(page).boundingBox();
  if (!handle) throw new Error('ручки нет');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 150, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await boxes(page)).summary.width).toBeGreaterThan(before + 100);
  const dragged = (await boxes(page)).summary.width;

  // Ширина — настройка окна: после перезапуска окна та же.
  await page.reload();
  await open(page, /Созвон с Ириной/);
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect.poll(async () => Math.abs((await boxes(page)).summary.width - dragged)).toBeLessThanOrEqual(2);

  // С клавиатуры: фокус на ручке, стрелка вправо — итоги уже.
  await splitter(page).focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await boxes(page)).summary.width).toBeLessThan(dragged - 5);
  await expect(splitter(page)).toHaveAttribute('aria-valuenow', /^\d+$/);
});

test('collapse gives the transcript the full width and "Итоги встречи" brings the column back', async () => {
  launched = await launchWithSummary();
  const { page } = launched;
  await setWindowSize(launched, 1300, 800);
  await open(page, /Созвон с Ириной/);
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  const narrow = (await boxes(page)).text.width;
  await block(page).getByRole('button', { name: 'Свернуть' }).click();
  await expect(block(page)).toHaveCount(0);
  await expect(splitter(page)).toHaveCount(0);
  await expect.poll(async () => (await text(page).boundingBox())?.width ?? 0).toBeGreaterThan(narrow + 200);
  await summaryButton(page).click();
  await expect(block(page).getByRole('heading', { name: 'Главное' })).toBeVisible();
  await expect.poll(async () => (await boxes(page)).summary.x >= (await boxes(page)).text.x + (await boxes(page)).text.width - 1).toBe(true);
});
