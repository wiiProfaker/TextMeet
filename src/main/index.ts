import { join } from 'node:path';
import { app, dialog, Menu, type BrowserWindow, type Tray } from 'electron';
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
const logFile = (): string => join(app.getPath('userData'), 'logs', 'textmeet.log');

let quitting = false;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
// Ссылку на трей держим всё время работы, иначе сборщик мусора уберёт значок.
let tray: Tray | null = null;
let recorderReady = false;
// Второй запуск или щелчок по Dock могут прийти, пока start() ещё не создал окна:
// тогда просьбу показать окно только запоминаем, иначе появится второе, «чужое» главное окно.
let windowsCreated = false;
let showRequested = false;

function openMainWindow(logger: Logger): void {
  if (!windowsCreated) {
    showRequested = true;
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow(logger, { show: true });
    hideInsteadOfClose(mainWindow);
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Закрытие окна прячет его в трей; по-настоящему окна закрываются только при выходе. */
function hideInsteadOfClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    // macOS: окно во весь экран, спрятанное сразу, оставляет пустой чёрный экран — сначала выходим из полноэкранного режима.
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide());
      win.setFullScreen(false);
      return;
    }
    win.hide();
  });
}

async function start(logger: Logger): Promise<void> {
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
      logFile: logFile(),
      recorderReady,
    }),
    onRecorderReady: () => {
      recorderReady = true;
      logger.info('Окно записи готово');
    },
  });

  recorderWindow = createRecorderWindow(logger);
  hideInsteadOfClose(recorderWindow);
  mainWindow = createMainWindow(logger, { show: showRequested || !startedAtLogin() });
  hideInsteadOfClose(mainWindow);
  windowsCreated = true;
  tray = createTray({ openWindow: () => openMainWindow(logger), quit: () => app.quit() });
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
}

/** Сбой запуска не должен быть молчаливым: пишем в журнал и показываем окно с путём к нему. */
async function reportStartupFailure(logger: Logger, err: unknown): Promise<void> {
  logger.error('Не удалось запуститься', err);
  await logger.flush();
  dialog.showErrorBox(
    'TextMeet не запустился',
    `Подробности — в журнале ошибок:\n${logFile()}\n\n${err instanceof Error ? err.message : String(err)}`,
  );
}

if (app.requestSingleInstanceLock()) {
  // Журнал создаём до start(): иначе ошибку самого запуска некуда записать.
  const logger = createLogger(logFile());
  start(logger)
    .catch((err: unknown) => reportStartupFailure(logger, err).finally(() => app.exit(1)));
} else {
  // Программа уже запущена — она сама покажет окно по событию second-instance.
  app.exit(0);
}
