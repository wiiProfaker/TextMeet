import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';

export interface MeetingFixture {
  id: string;
  /** Объект пишется как JSON, строка — как есть (для повреждённых файлов). */
  json: unknown;
  /** Файлы в папке audio/: имя → сколько секунд тона записать (WebM/Opus, как у MediaRecorder). */
  audio?: Record<string, number>;
}

export interface LaunchOptions {
  /** Объект пишется как JSON, строка — как есть. По умолчанию библиотека — во временной папке. */
  settings?: unknown;
  meetings?: MeetingFixture[];
  /** Звук компьютера в тестовом режиме: тон или отказ. Настоящие устройства в тестах не трогаем. */
  media?: 'tone' | 'fail';
  /** Собранная программа вместо out/ (проверка установщика). */
  executablePath?: string;
  /** Уже расшифрованные встречи: id → transcript.json. */
  transcripts?: Record<string, unknown>;
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  root: string;
  userDataDir: string;
  homeDir: string;
  libraryDir: string;
  close(): Promise<void>;
}

// Меньше тайм-аута теста: если окно не появилось, уборка в launchApp ещё успеет выполниться.
const WINDOW_TIMEOUT_MS = 15_000;

const serialize = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const run = promisify(execFile);

/** Тон нужной длины в WebM/Opus — как дорожка, записанная MediaRecorder. */
export async function toneWebm(file: string, seconds: number): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg для этой системы не найден');
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:a',
    'libopus',
    '-f',
    'webm',
    file,
  ]);
}

export function meetingJson(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    title: `Встреча ${id}`,
    createdAt: '2026-09-25T11:30:00.000Z',
    durationSec: 125,
    source: 'recording',
    participantsHint: null,
    model: null,
    status: 'recorded',
    errorMessage: null,
    speakerNames: {},
    ...overrides,
  };
}

export async function readMeetingJson(libraryDir: string, id: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(libraryDir, id, 'meeting.json'), 'utf8')) as Record<string, unknown>;
}

async function windowByPage(app: ElectronApplication, pagePath: string): Promise<Page> {
  const matches = (page: Page) => page.url().includes(pagePath);
  return (
    app.windows().find(matches) ??
    (await app.waitForEvent('window', { predicate: matches, timeout: WINDOW_TIMEOUT_MS }))
  );
}

/** Главное окно ищем по адресу: скрытое окно записи может открыться раньше. */
export function mainWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/main/index.html');
}

export function recorderWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/recorder/index.html');
}

/** Окно записи загрузилось и сообщило main, что готово. */
export async function waitForRecorder(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.textmeet.getAppInfo().then((i) => i.recorderReady))).toBe(true);
}

export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const root = await mkdtemp(join(tmpdir(), 'textmeet-e2e-'));
  const userDataDir = join(root, 'userData');
  const homeDir = join(root, 'home');
  const libraryDir = join(root, 'library');
  await mkdir(userDataDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(libraryDir, { recursive: true });

  const settings = options.settings ?? { schemaVersion: 1, libraryDir, launchAtLogin: true };
  await writeFile(join(userDataDir, 'settings.json'), serialize(settings));

  for (const meeting of options.meetings ?? []) {
    await mkdir(join(libraryDir, meeting.id, 'audio'), { recursive: true });
    await writeFile(join(libraryDir, meeting.id, 'meeting.json'), serialize(meeting.json));
    for (const [file, seconds] of Object.entries(meeting.audio ?? {})) {
      await toneWebm(join(libraryDir, meeting.id, 'audio', file), seconds);
    }
  }
  for (const [id, transcript] of Object.entries(options.transcripts ?? {})) {
    await writeFile(join(libraryDir, id, 'transcript.json'), serialize(transcript));
  }

  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    app = await electron.launch({
      ...(options.executablePath ? { executablePath: options.executablePath, args: [] } : { args: ['.'] }),
      env: {
        ...process.env,
        TEXTMEET_USER_DATA: userDataDir,
        TEXTMEET_HOME: homeDir,
        TEXTMEET_TEST_MEDIA: options.media ?? 'tone',
        // Расшифровка — поддельными движками, без моделей; папка моделей — своя (настройки её показывают).
        TEXTMEET_TEST_ASR: 'fake',
        TEXTMEET_MODELS_DIR: join(root, 'models'),
      },
    });
    page = await mainWindow(app);
  } catch (err) {
    // Запуск не удался — не оставляем за собой ни процесс, ни временные папки.
    await app?.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
    throw err;
  }
  return {
    app,
    page,
    root,
    userDataDir,
    homeDir,
    libraryDir,
    close: async () => {
      // Если запись ещё идёт, при выходе программа спросит системным окном — отвечаем «Остановить и выйти».
      // Тест мог уже закрыть программу сам (выход из меню) — тогда закрывать нечего.
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
        })
        .catch(() => undefined);
      await app.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
