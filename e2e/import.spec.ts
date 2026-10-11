// Импорт файлов (План 5): кнопка «Импорт файла», окно «Файл добавлен», ошибки, перетаскивание, прерванный импорт.
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { chooseFiles, launchApp, meetingJson, readMeetingJson, videoWithSound, type LaunchedApp } from './helpers';

// Копирование звука, запуск процесса расшифровки и ожидания до 20 с — больше обычных 30 с на тест.
test.describe.configure({ timeout: 60_000 });

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

const meetingIds = async (libraryDir: string): Promise<string[]> =>
  (await readdir(libraryDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);

test('a file added with the button becomes a meeting and is transcribed after its dialog', async () => {
  launched = await launchApp();
  const { app, page, root, libraryDir } = launched;
  const file = join(root, 'Созвон с Ириной.mp4');
  await videoWithSound(file, 3, '2026-10-04T13:20:05.000000Z');
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
    'Добавлено 1 файл из 2. Не удалось добавить «отчёт.pdf»: не получилось прочитать звук из файла.',
  );
  const dialog = page.getByRole('dialog', { name: 'Файл добавлен' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Пропустить' }).click();
  await expect(dialog).toBeHidden();
  expect(await meetingIds(libraryDir)).toHaveLength(1);
});

test('the window darkens while files are dragged over it and nothing happens without a real file', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByText('Пока нет встреч.')).toBeVisible();
  const drag = (type: 'dragenter' | 'dragleave' | 'drop') =>
    page.evaluate((eventType) => {
      const data = new DataTransfer();
      data.items.add(new File(['x'], 'запись.mp3', { type: 'audio/mpeg' }));
      document.body.dispatchEvent(new DragEvent(eventType, { dataTransfer: data, bubbles: true, cancelable: true }));
    }, type);

  const overlay = page.getByText('Отпустите — файлы станут встречами');
  await drag('dragenter');
  await expect(overlay).toBeVisible();
  await drag('dragleave');
  await expect(overlay).toBeHidden();
  await drag('dragenter');
  await drag('drop');
  await expect(overlay).toBeHidden();
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
