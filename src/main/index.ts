import { join } from 'node:path';
import {
  app,
  dialog,
  globalShortcut,
  Menu,
  powerMonitor,
  protocol,
  session,
  systemPreferences,
  type BrowserWindow,
} from 'electron';
import {
  IPC,
  type MainEventChannel,
  type MainEventContract,
  type RecorderCommandChannel,
  type RecorderCommandContract,
} from '../shared/ipc';
import { macMenuTemplate } from './app-menu';
import { resolveFfmpegPath } from './audio/ffmpeg';
import { meetingsNeedingMix, Mixer } from './audio/mixer';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { HotkeyManager } from './hotkey-manager';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
import { applyPermissionPolicy } from './permissions';
import { RecordingController } from './recording/controller';
import { freeDiskBytes } from './recording/monitors';
import { recoverInterruptedRecordings } from './recording/recovery';
import { createSettingsStore } from './settings/settings-store';
import { dialogTexts, notificationTexts } from './texts';
import { createTray, type AppTray } from './tray';
import { createMainWindow, createRecorderWindow, testMediaMode } from './windows';

// Версия для разработки (npm run dev / npm start) иначе делила бы с установленной программой папку данных
// и блокировку «один экземпляр»: запуск молча уступал бы установленной версии, а тестовые данные попадали
// бы в настоящие. Поэтому у неё своя папка данных и своя библиотека по умолчанию.
const isDevRun = !app.isPackaged && !process.env.TEXTMEET_USER_DATA;

// Только для автотестов: отдельные папки данных и «домашняя» папка, чтобы не трогать настоящие.
// Папка данных задаётся до requestSingleInstanceLock(): блокировка привязана к ней.
if (process.env.TEXTMEET_USER_DATA) app.setPath('userData', process.env.TEXTMEET_USER_DATA);
else if (isDevRun) app.setPath('userData', join(app.getPath('appData'), DEV_FOLDER_NAME));
const homeDir = (): string => process.env.TEXTMEET_HOME ?? app.getPath('home');
const logFile = (): string => join(app.getPath('userData'), 'logs', 'textmeet.log');

// Только для автотестов (TEXTMEET_TEST_MEDIA): поддельный микрофон Chromium вместо настоящего
// и никаких системных запросов разрешений — на машинах GitHub Actions на них некому ответить.
// Разрешение на микрофон по-прежнему решает обработчик программы (permissions.ts).
const testMedia = testMediaMode();
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');

// Протокол плеера регистрируется до готовности приложения — так требует Electron.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

/** Выход подтверждён: окна можно закрывать по-настоящему. */
let quitApproved = false;
let preparingQuit = false;
/** Компьютер выключается или пользователь выходит из системы — без вопросов. */
let systemEnding = false;
let mainWindow: BrowserWindow | null = null;
let recorderWindow: BrowserWindow | null = null;
let tray: AppTray | null = null;
let recorderReady = false;
const recorderCrashes: number[] = [];
// Второй запуск или щелчок по Dock могут прийти, пока start() ещё не создал окна:
// тогда просьбу показать окно только запоминаем, иначе появится второе, «чужое» главное окно.
let windowsCreated = false;
let showRequested = false;

/** Окно записи перезапускается после сбоя, но не бесконечно: 3 сбоя за минуту — больше не пробуем. */
const RECORDER_CRASH_LIMIT = 3;
const RECORDER_CRASH_WINDOW_MS = 60_000;

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
    if (quitApproved) return;
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

const mainVisible = (): boolean =>
  !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized();

// Аргумент void означает «без данных».
type Payload<T> = [T] extends [void] ? [] : [T];

function sendToMain<C extends MainEventChannel>(channel: C, ...payload: Payload<MainEventContract[C]>): void {
  const contents = mainWindow?.webContents;
  if (contents && !contents.isDestroyed()) contents.send(channel, ...payload);
}

function sendToRecorder<C extends RecorderCommandChannel>(channel: C, ...payload: Payload<RecorderCommandContract[C]>): void {
  const contents = recorderWindow?.webContents;
  if (contents && !contents.isDestroyed()) contents.send(channel, ...payload);
}

function startRecorderWindow(logger: Logger, controller: RecordingController): BrowserWindow {
  recorderReady = false;
  const win = createRecorderWindow(logger);
  hideInsteadOfClose(win);
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Окно записи завершилось: ${details.reason} (код ${details.exitCode})`);
    if (quitApproved) return;
    recorderReady = false;
    controller.onRecorderGone();
    const now = Date.now();
    recorderCrashes.push(now);
    while (recorderCrashes.length > 0 && now - (recorderCrashes[0] ?? now) > RECORDER_CRASH_WINDOW_MS) recorderCrashes.shift();
    win.destroy();
    if (recorderCrashes.length >= RECORDER_CRASH_LIMIT) {
      logger.error('Окно записи падает снова и снова — больше не перезапускаем');
      recorderWindow = null;
      return;
    }
    recorderWindow = startRecorderWindow(logger, controller);
  });
  return win;
}

async function confirmLowDisk(freeBytes: number): Promise<boolean> {
  const text = dialogTexts.lowDisk(freeBytes);
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: text.title,
    message: text.message,
    detail: text.detail,
    buttons: text.buttons,
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return response === 1;
}

/** Выход: во время записи — спросить, остановить запись, дописать журнал; отказ оставляет всё как было. */
async function prepareQuit(logger: Logger, controller: RecordingController, hotkeys: HotkeyManager): Promise<void> {
  if (preparingQuit) return;
  preparingQuit = true;
  try {
    if (controller.getState().phase !== 'idle' && !systemEnding) {
      const text = dialogTexts.quitWhileRecording();
      const { response } = await dialog.showMessageBox({
        type: 'question',
        title: text.title,
        message: text.message,
        detail: text.detail,
        buttons: text.buttons,
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response !== 1) return;
    }
    await controller.stopForQuit();
  } catch (err) {
    logger.error('Ошибка при остановке записи перед выходом', err);
  } finally {
    preparingQuit = false;
  }
  if (controller.getState().phase !== 'idle') return;
  hotkeys.dispose();
  logger.info('TextMeet завершает работу');
  await logger.flush();
  quitApproved = true;
  app.quit();
}

/** При запуске: закрыть прерванные сбоем записи и досвести то, что не успело свестись. */
async function recoverAndMix(
  logger: Logger,
  libraryDir: string,
  notify: Notify,
  mixer: Mixer,
  controller: RecordingController,
): Promise<void> {
  try {
    const recovered = await recoverInterruptedRecordings(
      libraryDir,
      logger,
      (id) => controller.getState().meetingId === id,
    );
    if (recovered.length > 0) {
      notify(notificationTexts.recovered(recovered.length));
      sendToMain(IPC.libraryChanged);
    }
    for (const id of meetingsNeedingMix(await listMeetings(libraryDir))) mixer.enqueue(id);
  } catch (err) {
    logger.error('Не удалось проверить прерванные записи', err);
  }
}

async function start(logger: Logger): Promise<void> {
  process.on('uncaughtException', (err) => logger.error('Необработанная ошибка', err));
  process.on('unhandledRejection', (reason) => logger.error('Необработанный отказ промиса', reason));

  app.on('second-instance', () => openMainWindow(logger));
  app.on('activate', () => openMainWindow(logger));
  app.on('window-all-closed', () => {
    // Остаёмся в трее.
  });
  app.on('render-process-gone', (_event, contents, details) => {
    if (contents !== recorderWindow?.webContents) {
      logger.error(`Процесс окна завершился: ${details.reason} (код ${details.exitCode})`);
    }
  });
  if (process.platform === 'win32') app.setAppUserModelId('dev.textmeet.app');

  await app.whenReady();
  const settings = await createSettingsStore(join(app.getPath('userData'), 'settings.json'), logger);
  syncLaunchAtLogin(settings.get().launchAtLogin);
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate(macMenuTemplate()) : null);

  const libraryDir = (): string =>
    resolveLibraryDir(settings.get().libraryDir, homeDir(), isDevRun ? DEV_FOLDER_NAME : LIBRARY_FOLDER_NAME);
  const notify = createNotifier({
    logger,
    openWindow: () => openMainWindow(logger),
    isWindowActive: () => mainVisible() && !!mainWindow?.isFocused(),
  });
  const mixer = new Mixer({
    libraryDir,
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
    onMixed: () => sendToMain(IPC.libraryChanged),
  });

  // Автомату нужна подпись горячей клавиши, а горячей клавише — автомат: связываем через замыкание.
  let hotkeys: HotkeyManager | null = null;
  const controller = new RecordingController({
    platform: process.platform,
    logger,
    recorder: {
      isReady: () => recorderReady && !!recorderWindow && !recorderWindow.isDestroyed(),
      start: (command) => sendToRecorder(IPC.recorderStart, command),
      stop: () => sendToRecorder(IPC.recorderStop),
      playSound: (kind) => sendToRecorder(IPC.recorderPlaySound, kind),
    },
    now: () => Date.now(),
    libraryDir,
    settings: () => settings.get(),
    hotkeyLabel: () => hotkeys?.label ?? '',
    freeBytes: freeDiskBytes,
    confirmLowDisk,
    ensureMicAccess: async () =>
      testMedia !== null || process.platform !== 'darwin' || (await systemPreferences.askForMediaAccess('microphone')),
    notify,
    showMainWindow: () => openMainWindow(logger),
    emitState: (state) => {
      sendToMain(IPC.recordingState, state);
      tray?.update(state.phase, hotkeys?.accelerator ?? '');
    },
    emitPeaks: (peaks) => {
      if (mainVisible()) sendToMain(IPC.recordingPeaks, peaks);
    },
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (id) => mixer.enqueue(id),
  });
  const hotkeyManager = new HotkeyManager(globalShortcut, process.platform, () => void controller.toggle());
  hotkeys = hotkeyManager;
  if (hotkeyManager.init(settings.get().recordHotkey).invalid) {
    logger.warn('Сохранённая горячая клавиша не подходит по правилам — используется стандартная');
  }

  applyPermissionPolicy(session.defaultSession, {
    main: () => mainWindow?.webContents ?? null,
    recorder: () => recorderWindow?.webContents ?? null,
  });
  // Звук компьютера — только окну записи. Источник — сам кадр окна, не экран (вариант Г из спайка):
  // с источником-экраном macOS отвечает «Invalid capture constraints».
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!request.frame || !recorderWindow || request.frame !== recorderWindow.webContents.mainFrame) {
      callback({});
      return;
    }
    callback({ video: request.frame, audio: 'loopback' });
  });
  protocol.handle(MEDIA_SCHEME, (request) => serveMedia(request, libraryDir()));

  registerIpc({
    settings,
    logger,
    platform: process.platform,
    hotkeys: hotkeyManager,
    controller,
    libraryDir,
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
    hotkeyChanged: () => tray?.update(controller.getState().phase, hotkeyManager.accelerator),
  });

  app.on('before-quit', (event) => {
    if (quitApproved) return;
    event.preventDefault();
    void prepareQuit(logger, controller, hotkeyManager);
  });
  const onSystemEnding = (): void => {
    systemEnding = true;
    void controller.stopForQuit();
  };
  powerMonitor.on('shutdown', onSystemEnding);

  recorderWindow = startRecorderWindow(logger, controller);
  mainWindow = createMainWindow(logger, { show: showRequested || !startedAtLogin() });
  hideInsteadOfClose(mainWindow);
  mainWindow.on('session-end', onSystemEnding);
  windowsCreated = true;
  tray = createTray(
    { openWindow: () => openMainWindow(logger), toggleRecording: () => void controller.toggle(), quit: () => app.quit() },
    hotkeyManager.accelerator,
  );
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller);
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
  start(logger).catch((err: unknown) => reportStartupFailure(logger, err).finally(() => app.exit(1)));
} else {
  // Программа уже запущена — она сама покажет окно по событию second-instance.
  app.exit(0);
}
