// Импорт файлов (План 5): кнопка «Импорт файла», окно «Файл добавлен», ошибки, перетаскивание, прерванный импорт.
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  chooseFiles,
  launchApp,
  meetingJson,
  readMeetingJson,
  videoWithSound,
  waitForRecorder,
  type LaunchedApp,
} from './helpers';

// Копирование звука, запуск процесса расшифровки и ожидания до 20 с — больше обычных 30 с на тест.
test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const meetingIds = async (libraryDir: string): Promise<string[]> =>
  (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

/** Окно выбора файлов при каждом открытии «выбирает» следующую группу файлов. */
async function chooseFilesInTurn(app: ElectronApplication, batches: string[][]): Promise<void> {
  await app.evaluate(({ dialog }, answers) => {
    const left = [...answers];
    const answer = async () => ({ canceled: false, filePaths: left.shift() ?? [] });
    dialog.showOpenDialog = answer as typeof dialog.showOpenDialog;
  }, batches);
}

/**
 * Бросить файлы в окно: paths — файлы с диска (у File, выбранного через поле файла, есть путь, как у перетащенного
 * из папки), names — файлы без пути (из архива, вложение письма).
 */
async function dropFiles(page: Page, paths: string[], names: string[] = []): Promise<void> {
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.id = 'e2e-drop-files';
    input.hidden = true;
    document.body.append(input);
  });
  await page.locator('#e2e-drop-files').setInputFiles(paths);
  await page.evaluate((pathless) => {
    const input = document.querySelector<HTMLInputElement>('#e2e-drop-files');
    const files = [...(input?.files ?? []), ...pathless.map((name) => new File(['x'], name, { type: 'audio/mpeg' }))];
    input?.remove();
    // Новые данные у каждого события — как при настоящем перетаскивании.
    for (const type of ['dragenter', 'drop']) {
      const data = new DataTransfer();
      for (const file of files) data.items.add(file);
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
    }
  }, names);
}

test('a file added with the button becomes a meeting and is transcribed after its dialog', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const file = join(root, 'Созвон с Ириной.mp4');
  // Утро по UTC: 4 октября в часовых поясах от UTC−9 до UTC+14.
  await videoWithSound(file, 3, '2026-10-04T09:20:05.000000Z');
  await chooseFiles(app, [file]);

  await page.getByRole('button', { name: 'Импорт файла' }).click();
  const dialog = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByLabel('Название')).toHaveValue('Созвон с Ириной');
  await expect(dialog.getByText('«Созвон с Ириной.mp4»')).toBeVisible();
  await expect(dialog.getByText('Сколько человек говорит на записи?')).toBeVisible();
  await dialog.getByRole('button', { name: '2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Расшифровать' }).click();

  const text = page.getByLabel('Текст встречи');
  await expect(text).toBeVisible({ timeout: 20_000 });
  await expect(text).toContainText('Проверка расшифровки');
  await expect(text).toContainText('Спикер 1');
  await expect(page.locator('.head .meta')).toContainText('4 октября 2026');
  await expect(page.locator('.head .meta')).toContainText('из файла');
  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.getByRole('button', { name: /Созвон с Ириной/ })).toBeVisible();

  const [id = ''] = await meetingIds(libraryDir);
  expect(await readMeetingJson(libraryDir, id)).toMatchObject({
    source: 'import',
    sourceFileName: 'Созвон с Ириной.mp4',
    participantsHint: 2,
    status: 'done',
    tracks: [{ kind: 'file', file: 'source.mka', startOffsetMs: 0 }],
  });
  expect(existsSync(join(libraryDir, id, 'audio', 'mix.opus'))).toBe(true);
  expect(existsSync(file)).toBe(true);
});

test('a file without sound is refused with a plain reason, the others are added', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const video = join(root, 'созвон.mp4');
  await videoWithSound(video, 1);
  const pdf = join(root, 'отчёт.pdf');
  await writeFile(pdf, 'не видео');
  await chooseFiles(app, [pdf, video]);

  await page.getByRole('button', { name: 'Импорт файла' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Добавлен 1 файл из 2. Не удалось добавить «отчёт.pdf»: не получилось прочитать звук из файла.',
  );
  const dialog = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Пропустить' }).click();
  await expect(dialog).toBeHidden();
  expect(await meetingIds(libraryDir)).toHaveLength(1);
});

test('a refusal stays while the next files are checked; the button is free once the picker closes', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const pdf = join(root, 'отчёт.pdf');
  await writeFile(pdf, 'не видео');
  const videos = ['a.mp4', 'b.mp4', 'c.mp4', 'd.mp4'].map((name) => join(root, name));
  for (const video of videos) await videoWithSound(video, 1);
  // Первая группа проверяется долго (несколько файлов) — вторую добавляют, пока она ещё идёт.
  await chooseFilesInTurn(app, [[pdf, ...videos.slice(0, 3)], [videos[3] ?? '']]);

  const button = page.getByRole('button', { name: 'Импорт файла' });
  await button.click();
  await button.click({ timeout: 2_000 });
  await expect.poll(() => meetingIds(libraryDir), { timeout: 20_000 }).toHaveLength(4);
  await expect(page.getByRole('alert')).toHaveText(
    'Добавлено 3 файла из 4. Не удалось добавить «отчёт.pdf»: не получилось прочитать звук из файла.',
  );
});

test('files added during a recording or with a dialog open do not take its place', async () => {
  const id = '2026-10-04_1620_a1b2c3';
  launched = await launchApp({ meetings: [{ id, json: meetingJson(id, { title: 'Созвон с Ириной' }) }] });
  const { app, page, root } = launched;
  const first = join(root, 'первый.mp4');
  const second = join(root, 'второй.mp4');
  await videoWithSound(first, 1);
  await videoWithSound(second, 1);
  const list = page.getByRole('navigation', { name: 'Встречи' });

  // Открыто окно «Удалить встречу?» — брошенный файл добавляется, окно остаётся.
  await list.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.getByRole('menuitem', { name: 'Удалить встречу…' }).click();
  const confirm = page.getByRole('dialog', { name: 'Удалить встречу «Созвон с Ириной»?' });
  await expect(confirm).toBeVisible();
  await dropFiles(page, [first]);
  await expect(list.getByRole('button', { name: /первый/ })).toBeVisible({ timeout: 15_000 });
  await expect(confirm).toBeVisible();
  // Звук скопирован — открывается и «Файл добавлен»; подтверждение остаётся, закрываем оба окна.
  const added = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(added).toBeVisible({ timeout: 15_000 });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Отмена' }).click();
  await added.getByRole('button', { name: 'Пропустить' }).click();
  await expect(added).toBeHidden();

  // Идёт запись — файл из окна выбора добавляется, а окно показывает запись.
  await waitForRecorder(page);
  await page.getByRole('button', { name: /Начать запись/ }).click();
  const live = page.getByRole('main', { name: 'Идёт запись' });
  await expect(live).toBeVisible();
  await chooseFiles(app, [second]);
  await page.getByRole('button', { name: 'Импорт файла' }).click();
  await expect(list.getByRole('button', { name: /второй/ })).toBeVisible({ timeout: 15_000 });
  await expect(live).toBeVisible();
});

test('files added while «Файл добавлен» is open still open the first new meeting', async () => {
  launched = await launchApp();
  const { app, page, root } = launched;
  const first = join(root, 'первый.mp4');
  const second = join(root, 'второй.mp4');
  await videoWithSound(first, 1);
  await videoWithSound(second, 1);
  const list = page.getByRole('navigation', { name: 'Встречи' });

  await chooseFiles(app, [first]);
  await page.getByRole('button', { name: 'Импорт файла' }).click();
  await expect(page.getByRole('dialog', { name: 'Файл добавлен' })).toBeVisible({ timeout: 15_000 });
  await expect(list.getByRole('button', { name: /первый/ })).toHaveAttribute('aria-current', 'true');
  // Окно «Файл добавлен» не связано с открытой встречей — новая встреча открывается и при нём.
  await dropFiles(page, [second]);
  const added = list.getByRole('button', { name: /второй/ });
  await expect(added).toHaveAttribute('aria-current', 'true', { timeout: 15_000 });
});

test('a dropped file without a path is reported together with the files dropped with it', async () => {
  launched = await launchApp();
  const { page, root, libraryDir } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  const video = join(root, 'созвон.mp4');
  await videoWithSound(video, 1);
  await dropFiles(page, [video], ['запись.mp3']);
  await expect(page.getByRole('alert')).toHaveText(
    'Добавлен 1 файл из 2. Не удалось добавить «запись.mp3»: у файла нет пути на диске — перетащите его из папки ' +
      'или нажмите «Импорт файла».',
  );
  await expect.poll(() => meetingIds(libraryDir)).toHaveLength(1);
});

test('the window darkens while files are dragged over it, not for dragged text', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  /** Событие перетаскивания над списком встреч; inside — переход между элементами внутри окна. */
  const drag = (type: 'dragenter' | 'dragleave' | 'drop', what: 'file' | 'text' = 'file', inside = true) =>
    page.evaluate(
      ([eventType, kind, within]) => {
        const data = new DataTransfer();
        if (kind === 'file') data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
        else data.setData('text/plain', 'кусок текста');
        const target = document.querySelector('.list') ?? document.body;
        const relatedTarget = within ? document.body : null;
        target.dispatchEvent(new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true, relatedTarget }));
      },
      [type, what, inside] as const,
    );

  const overlay = page.getByText('Отпустите — файлы станут встречами');
  await drag('dragenter', 'text');
  await expect(overlay).toBeHidden();
  await drag('dragenter');
  await drag('dragenter');
  await drag('dragleave');
  await expect(overlay).toBeVisible();
  // Ушли из окна — затемнение снимается, даже если пары событий не сошлись.
  await drag('dragleave', 'file', false);
  await expect(overlay).toBeHidden();
});

test('a dropped file without a path on disk is explained', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  await page.evaluate(() => {
    // Новые данные у каждого события — как при настоящем перетаскивании.
    for (const type of ['dragenter', 'drop']) {
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
      document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
    }
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Не удалось получить путь к файлу — перетащите его из папки или нажмите «Импорт файла».',
  );
  await expect(page.getByText('Отпустите — файлы станут встречами')).toBeHidden();
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
});

test('an import broken off by a crash is marked and the meeting can be deleted', async () => {
  const id = '2026-10-04_1620_a1b2c3';
  launched = await launchApp({
    meetings: [
      {
        id,
        json: meetingJson(id, {
          title: 'Созвон с Ириной',
          source: 'import',
          status: 'importing',
          sourceFileName: 'Созвон с Ириной.mp4',
        }),
      },
    ],
  });
  const { page, libraryDir, trashDir } = launched;
  const list = page.getByRole('navigation', { name: 'Встречи' });
  await expect(list.getByText('импорт прервался')).toBeVisible();
  await list.getByRole('button', { name: /Созвон с Ириной/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Импорт прервался' })).toContainText('Добавьте файл ещё раз.');

  await page.getByRole('button', { name: 'Ещё' }).click();
  await expect(page.getByRole('menuitem', { name: 'Удалить аудио…' })).toBeHidden();
  await page.getByRole('menuitem', { name: 'Удалить встречу…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Удалить встречу' }).click();
  await expect(list.getByRole('button', { name: /Созвон с Ириной/ })).toBeHidden();
  expect(existsSync(join(libraryDir, id))).toBe(false);
  expect(await readdir(trashDir)).toHaveLength(1);
});
