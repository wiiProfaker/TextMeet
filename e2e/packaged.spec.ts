import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, waitForRecorder, type LaunchedApp } from './helpers';

// Только после сборки установщика: TEXTMEET_PACKAGED_APP — путь к исполняемому файлу собранной программы
// (Windows: release/win-unpacked/TextMeet.exe; Mac: …/TextMeet.app/Contents/MacOS/TextMeet).
const executablePath = process.env.TEXTMEET_PACKAGED_APP;

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('the packaged app records, mixes with its bundled ffmpeg and runs the transcription process', async () => {
  test.skip(!executablePath, 'проверяется только собранная программа (TEXTMEET_PACKAGED_APP)');
  launched = await launchApp({ executablePath });
  const { page, libraryDir, userDataDir } = launched;
  await waitForRecorder(page);

  await page.getByRole('button', { name: /Начать запись/ }).click();
  await expect(page.getByTestId('live-timer')).toHaveText(/00:00:0[2-9]/, { timeout: 15_000 });
  await page.getByRole('button', { name: /Остановить запись/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Пропустить' }).click();

  const [id] = await readdir(libraryDir);
  // mix.opus появляется, только если ffmpeg из app.asar.unpacked запустился.
  await expect.poll(() => existsSync(join(libraryDir, id!, 'audio', 'mix.opus')), { timeout: 30_000 }).toBe(true);
  // «Пропустить» тоже ставит встречу в очередь. Текст появляется, только если процесс расшифровки запустился
  // из собранной программы и загрузил sherpa-onnx из app.asar.unpacked (движки — поддельные, без моделей).
  await expect.poll(() => existsSync(join(libraryDir, id!, 'transcript.json')), { timeout: 30_000 }).toBe(true);
  const log = await readFile(join(userDataDir, 'logs', 'textmeet.log'), 'utf8');
  expect(log).toMatch(/Процесс расшифровки запущен \(поддельные движки, sherpa-onnx \d/);
});
