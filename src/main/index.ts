import { join } from 'node:path';
import { app, Menu, type BrowserWindow, type Tray } from 'electron';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { registerIpc } from './ipc';
import { createLogger, type Logger } from './logger';
import { resolveLibraryDir } from './paths';
import { createSettingsStore } from './settings/settings-store';
import { createTray } from './tray';
import { createMainWindow, createRecorderWindow } from './windows';

// Только для автотестов: отдельные папки данных и «домашняя» папка, чтобы не трогать настоящие.
if (process.env.TEXTMEET_USER_DATA) app.setPath('userData', process.env.TEXTMEET_USER_DATA);
const homeDir = (): string => process.env.TEXTMEET_HOME ?? app.getPath('home');

let quitting = false;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
// Ссылку на трей держим всё время работы, иначе сборщик мусора уберёт значок.
let tray: Tray | null = null;
let recorderReady = false;

function openMainWindow(logger: Logger): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow(logger, { show: true });
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Закрытие окна прячет его в трей; по-настоящему окна закрываются только при выходе. */
function hideInsteadOfClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
}

async function start(): Promise<void> {
  const logger = createLogger(join(app.getPath('userData'), 'logs', 'textmeet.log'));
  process.on('uncaughtException', (err) => logger.error('Необработанная ошибка', err));
  process.on('unhandledRejection', (reason) => logger.error('Необработанный отказ промиса', reason));

  app.on('second-instance', () => openMainWindow(logger));
  app.on('activate', () => openMainWindow(logger));
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => {
    // Остаёмся в трее.
  });
  app.on('render-process-gone', (_event, _contents, details) =>
    logger.error(`Процесс окна завершился: ${details.reason} (код ${details.exitCode})`),
  );
  if (process.platform === 'win32') app.setAppUserModelId('dev.textmeet.app');

  await app.whenReady();
  const settings = await createSettingsStore(join(app.getPath('userData'), 'settings.json'), logger);
  syncLaunchAtLogin(settings.get().launchAtLogin);
  // На Windows меню «Файл / Правка» не нужно; на macOS оставляем стандартное (⌘Q, копирование).
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

  registerIpc({
    settings,
    logger,
    libraryDir: () => resolveLibraryDir(settings.get().libraryDir, homeDir()),
    launchAtLoginNotice: currentLaunchAtLoginNotice,
    applyLaunchAtLogin: syncLaunchAtLogin,
    mainContents: () => mainWindow?.webContents ?? null,
    recorderContents: () => recorderWindow?.webContents ?? null,
    appInfo: () => ({
      version: app.getVersion(),
      platform: process.platform,
      logFile: join(app.getPath('userData'), 'logs', 'textmeet.log'),
      recorderReady,
    }),
    onRecorderReady: () => {
      recorderReady = true;
      logger.info('Окно записи готово');
    },
  });

  recorderWindow = createRecorderWindow(logger);
  hideInsteadOfClose(recorderWindow);
  mainWindow = createMainWindow(logger, { show: !startedAtLogin() });
  hideInsteadOfClose(mainWindow);
  tray = createTray({ openWindow: () => openMainWindow(logger), quit: () => app.quit() });
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
}

if (app.requestSingleInstanceLock()) {
  start().catch((err: unknown) => {
    console.error('TextMeet: не удалось запуститься', err);
    app.exit(1);
  });
} else {
  // Программа уже запущена — она сама покажет окно по событию second-instance.
  app.exit(0);
}
