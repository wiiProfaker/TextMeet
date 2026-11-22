// Снимок окна для README (решения Плана 8, §4.2): встреча с текстом, двумя собеседниками и готовыми итогами, окно
// 1100×720, светлая тема → docs/images/meeting.png. Тексты придуманные. Только по просьбе:
// TEXTMEET_README_SHOTS=1 npx playwright test e2e/readme-shots.spec.ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sourceHash } from '../src/main/ai/ai-messages';
import { loadExportDoc } from '../src/main/export/export-meeting';
import { launchApp, meetingJson, type LaunchedApp } from './helpers';

const ID = '2026-10-14_1100_5e7a1b';

const LINES: [string, number, string][] = [
  ['s1', 4, 'Давайте начнём с запуска. Дизайн главной страницы ещё не готов — я бы перенесла запуск на пятницу.'],
  ['me', 15, 'Согласен. Тогда тексты для рассылки тоже успеем вычитать, сейчас там половина черновиков.'],
  ['s1', 27, 'Хорошо. Олег просил предупредить его заранее — он договаривается с подрядчиком по видео.'],
  ['me', 39, 'Напишу ему сегодня. Что с бюджетом на октябрь, укладываемся?'],
  ['s1', 48, 'Пока да: осталась примерно половина. Но если добавим съёмку, нужно будет согласовать отдельно.'],
  ['me', 61, 'Съёмку обсудим на следующей неделе, когда будут макеты. Сейчас главное — успеть к пятнице.'],
  ['s1', 72, 'Тогда я соберу список задач по дизайну и пришлю после обеда.'],
  ['me', 83, 'Отлично, договорились.'],
];

const SUMMARY = [
  '**Главное**',
  '- Запуск переносится на пятницу: дизайн главной страницы ещё не готов.',
  '- Бюджет на октябрь укладывается — осталась примерно половина.',
  '',
  '**Решения**',
  '- Съёмку обсуждаем на следующей неделе, когда будут макеты.',
  '',
  '**Задачи**',
  '1. Предупредить Олега о переносе — сегодня.',
  '2. Прислать список задач по дизайну — после обеда.',
  '',
  '**Открытые вопросы**',
  '- Нужна ли съёмка и сколько она добавит к бюджету.',
].join('\n');

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test('screenshot of a meeting for the README', async () => {
  test.skip(process.env.TEXTMEET_README_SHOTS !== '1', 'снимки README — только с TEXTMEET_README_SHOTS=1');
  launched = await launchApp({
    meetings: [
      {
        id: ID,
        json: meetingJson(ID, {
          title: 'Планёрка: запуск сайта',
          status: 'done',
          model: 'gigaam-v3-e2e-rnnt',
          createdAt: '2026-10-14T08:00:00.000Z',
          durationSec: 95,
          speakerNames: { s1: 'Ирина' },
        }),
      },
    ],
    transcripts: {
      [ID]: {
        schemaVersion: 1,
        model: 'gigaam-v3-e2e-rnnt',
        createdAt: '2026-10-14T08:02:00.000Z',
        speakers: [
          { id: 'me', kind: 'me' },
          { id: 's1', kind: 'other' },
        ],
        segments: LINES.map(([speakerId, start, text], i) => ({
          id: `seg-${i}`,
          start,
          end: start + 9,
          speakerId,
          text,
          edited: false,
        })),
      },
    },
    installedModels: ['qwen3.5-9b'],
  });
  const { app, page, libraryDir } = launched;
  // Итоги — к нынешнему тексту встречи (иначе блок пометил бы «текст меняли после итогов»).
  const hash = sourceHash(await loadExportDoc(libraryDir, ID));
  const summary = { text: SUMMARY, model: 'qwen3.5-9b', modelTitle: 'Qwen3.5 9B', createdAt: '2026-10-14T08:05:00.000Z', status: 'done', sourceHash: hash };
  await writeFile(join(libraryDir, ID, 'ai.json'), JSON.stringify({ version: 1, summary, questions: [] }));

  await page.emulateMedia({ colorScheme: 'light' });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('main'))
      ?.setSize(1100, 720),
  );
  await page.getByRole('navigation', { name: 'Встречи' }).getByRole('button', { name: /Планёрка/ }).click();
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).toContainText('Открытые вопросы');
  await expect(page.getByRole('region', { name: 'Итоги встречи' })).not.toContainText('Текст встречи меняли');
  // На снимке — не имя поддельного микрофона тестов.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('aside *')) {
      if (el.childNodes.length === 1 && el.textContent === 'Fake Default Audio Input') el.textContent = 'Микрофон по умолчанию';
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join('docs', 'images', 'meeting.png') });
});
