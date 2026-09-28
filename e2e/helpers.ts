import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface MeetingFixture {
  id: string;
  /** Объект пишется как JSON, строка — как есть (для повреждённых файлов). */
  json: unknown;
}

export interface LaunchOptions {
  /** Объект пишется как JSON, строка — как есть. По умолчанию библиотека — во временной папке. */
  settings?: unknown;
  meetings?: MeetingFixture[];
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

const serialize = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value, null, 2));

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

async function windowByPage(app: ElectronApplication, pagePath: string): Promise<Page> {
  const matches = (page: Page) => page.url().includes(pagePath);
  return app.windows().find(matches) ?? (await app.waitForEvent('window', { predicate: matches }));
}

/** Главное окно ищем по адресу: скрытое окно записи может открыться раньше. */
export function mainWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/main/index.html');
}

export function recorderWindow(app: ElectronApplication): Promise<Page> {
  return windowByPage(app, '/recorder/index.html');
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
  }

  let app: ElectronApplication | undefined;
  let page: Page;
  try {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, TEXTMEET_USER_DATA: userDataDir, TEXTMEET_HOME: homeDir },
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
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
