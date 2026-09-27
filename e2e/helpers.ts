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

/** Главное окно ищем по адресу: скрытое окно записи может открыться раньше. */
export async function mainWindow(app: ElectronApplication): Promise<Page> {
  const isMain = (page: Page) => page.url().includes('/main/index.html');
  return app.windows().find(isMain) ?? (await app.waitForEvent('window', { predicate: isMain }));
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

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, TEXTMEET_USER_DATA: userDataDir, TEXTMEET_HOME: homeDir },
  });
  const page = await mainWindow(app);
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
