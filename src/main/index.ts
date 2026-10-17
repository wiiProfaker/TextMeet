import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import {
  app,
  clipboard,
  ClipboardItem,
  dialog,
  globalShortcut,
  Menu,
  powerMonitor,
  protocol,
  session,
  shell,
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
import { currentAiModel } from './ai/ai-models';
import { clearEnginePid, killOrphanEngine, parseTasklistImage, recordEnginePid, type EnginePidDeps } from './ai/engine-pid';
import { AiRunner, llamaEngine } from './ai/ai-runner';
import { llamaDir, LlamaServer, llamaServerFile, type LlamaCommand } from './ai/llama-server';
import { macMenuTemplate } from './app-menu';
import { resolveFfmpegPath } from './audio/ffmpeg';
import { meetingsNeedingMix, Mixer } from './audio/mixer';
import { currentLaunchAtLoginNotice, startedAtLogin, syncLaunchAtLogin } from './autostart';
import { HotkeyManager } from './hotkey-manager';
import { Importer, recoverInterruptedImports } from './import/importer';
import { registerIpc } from './ipc';
import { listMeetings } from './library/library';
import { SearchIndex } from './library/search-index';
import { folderTrash, type Trash } from './library/trash';
import { createLogger, type Logger } from './logger';
import { MEDIA_SCHEME, serveMedia } from './media-protocol';
import { CatalogDownloads } from './models/catalog-downloads';
import { FakeModelStore } from './models/fake-model-store';
import { ModelManager, type ModelStore } from './models/model-manager';
import { modelsRoot } from './models/models-dir';
import { isModelGroupId, llmFilePath } from './models/registry';
import { createNotifier, type Notify } from './notifications';
import { DEV_FOLDER_NAME, LIBRARY_FOLDER_NAME, resolveLibraryDir } from './paths';
import { applyPermissionPolicy } from './permissions';
import { RecordingController } from './recording/controller';
import { freeDiskBytes } from './recording/monitors';
import { recoverInterruptedRecordings } from './recording/recovery';
import { createSettingsStore } from './settings/settings-store';
import { dialogTexts, notificationTexts } from './texts';
import { TranscriptionQueue } from './transcription/queue';
import { spawnTranscriptionWorker } from './transcription/worker-host';
import { testEnv } from './test-hooks';
import { createTray, type AppTray } from './tray';
import { createMainWindow, createRecorderWindow, testMediaMode } from './windows';

// Тестовые подмены TEXTMEET_*: только в разработке и в тестовой копии сборки (test-hooks.ts). В выпуске — пусто.
const testVars = testEnv({
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  env: process.env,
  exists: existsSync,
});

// Версия для разработки (npm run dev / npm start) иначе делила бы с установленной программой папку данных
// и блокировку «один экземпляр»: запуск молча уступал бы установленной версии, а тестовые данные попадали
// бы в настоящие. Поэтому у неё своя папка данных и своя библиотека по умолчанию.
const isDevRun = !app.isPackaged && !testVars.TEXTMEET_USER_DATA;

// Только для автотестов: отдельные папки данных и «домашняя» папка, чтобы не трогать настоящие.
// Папка данных задаётся до requestSingleInstanceLock(): блокировка привязана к ней.
if (testVars.TEXTMEET_USER_DATA) app.setPath('userData', testVars.TEXTMEET_USER_DATA);
else if (isDevRun) app.setPath('userData', join(app.getPath('appData'), DEV_FOLDER_NAME));
const homeDir = (): string => testVars.TEXTMEET_HOME ?? app.getPath('home');
const logFile = (): string => join(app.getPath('userData'), 'logs', 'textmeet.log');

// Только для автотестов (TEXTMEET_TEST_MEDIA): поддельный микрофон Chromium вместо настоящего
// и никаких системных запросов разрешений — на машинах GitHub Actions на них некому ответить.
// Разрешение на микрофон по-прежнему решает обработчик программы (permissions.ts).
const testMedia = testMediaMode(testVars);
if (testMedia) app.commandLine.appendSwitch('use-fake-device-for-media-stream');
// Только для автотестов: поддельные движки расшифровки (worker.ts) и поддельное хранилище моделей — без моделей и
// их скачивания; TEXTMEET_TEST_DOWNLOAD_MS — сколько длится шаг «скачивания» из каталога (по умолчанию мгновенно).
const fakeAsr = testVars.TEXTMEET_TEST_ASR === 'fake';
const fakeDownloadStepMs = Number(testVars.TEXTMEET_TEST_DOWNLOAD_MS ?? 0) || 0;
/** Только для автотестов: модели, уже «скачанные» в поддельном хранилище (через запятую). */
const fakeInstalled = (testVars.TEXTMEET_TEST_INSTALLED ?? '').split(',').filter(isModelGroupId);
/** Только для автотестов: поддельный llama-server (скрипт src/test-support/fake-llama-server.mjs) вместо настоящего. */
const fakeLlm = testVars.TEXTMEET_TEST_LLM;
/** Идут автотесты: уведомления о расшифровке только в журнал — настоящие всплывали бы на экране у разработчика. */
const testRun = testMedia !== null || !!testVars.TEXTMEET_TEST_ASR;
/** Только для автотестов: «Корзина» — обычная папка (на машинах CI настоящей Корзины может не быть). */
const testTrash = testRun ? testVars.TEXTMEET_TEST_TRASH : undefined;
const trash: Trash = testTrash ? folderTrash(testTrash) : (path) => shell.trashItem(path);

/** Потоков для расшифровки: все ядра, кроме одного (не больше 8); во время записи — 2 (§5.3 решений Плана 3). */
const FULL_THREADS = Math.max(1, Math.min(8, availableParallelism() - 1));
const RECORDING_THREADS = Math.min(2, FULL_THREADS);

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
// Автомату нужна подпись горячей клавиши, а горячей клавише — автомат; главному окну — снятие паузы клавиши.
let hotkeys: HotkeyManager | null = null;
let recorderReady = false;
let transcription: TranscriptionQueue | null = null;
let importer: Importer | null = null;
let aiRunner: AiRunner | null = null;
/** Окно записи падало снова и снова, и его больше не перезапускают. */
let recorderBroken = false;
const recorderCrashes: number[] = [];
// Второй запуск или щелчок по Dock могут прийти, пока start() ещё не создал окна:
// тогда просьбу показать окно только запоминаем, иначе появится второе, «чужое» главное окно.
let windowsCreated = false;
let showRequested = false;
/** Встреча из уведомления для окна, которое ещё загружается (например, пересоздано): покажем, когда догрузится. */
let pendingMeetingId: string | null = null;

/** Окно записи перезапускается после сбоя, но не бесконечно: не больше 3 раз в минуту, 4-й сбой — больше не пробуем. */
const RECORDER_RESTART_LIMIT = 3;
const RECORDER_CRASH_WINDOW_MS = 60_000;

function openMainWindow(logger: Logger): void {
  if (!windowsCreated) {
    showRequested = true;
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = startMainWindow(logger, true);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function startMainWindow(logger: Logger, show: boolean): BrowserWindow {
  const win = createMainWindow(logger, { show });
  hideInsteadOfClose(win);
  // Пока в настройках вводят новую комбинацию, клавиша снята, и вернуть её должна сама страница.
  // Упала или перезагрузилась посреди ввода — вернуть некому: возвращаем здесь.
  const resumeHotkey = (): void => hotkeys?.suspend(false);
  win.webContents.on('render-process-gone', resumeHotkey);
  win.webContents.on('did-start-loading', resumeHotkey);
  // Не did-finish-load: после него страница может ещё грузиться (isLoading() — true), и щелчок в этот момент
  // ждал бы события, которое уже прошло. did-stop-loading наступает, когда isLoading() становится false.
  win.webContents.on('did-stop-loading', () => {
    const id = pendingMeetingId;
    pendingMeetingId = null;
    if (id) win.webContents.send(IPC.showMeeting, id);
  });
  return win;
}

/** Показать встречу в главном окне; загружающаяся страница ещё не подписана на событие — ждём её загрузки. */
function showMeeting(id: string): void {
  const contents = mainWindow?.webContents;
  if (contents && !contents.isDestroyed() && !contents.isLoading()) contents.send(IPC.showMeeting, id);
  else pendingMeetingId = id;
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

function startRecorderWindow(logger: Logger, controller: RecordingController, notify: Notify): BrowserWindow {
  recorderReady = false;
  const win = createRecorderWindow(logger, testMedia);
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
    if (recorderCrashes.length > RECORDER_RESTART_LIMIT) {
      logger.error('Окно записи падает снова и снова — больше не перезапускаем');
      recorderWindow = null;
      // Иначе каждая следующая попытка записи просила бы «подождать пару секунд», а ждать нечего.
      recorderBroken = true;
      notify(notificationTexts.recorderBroken());
      return;
    }
    recorderWindow = startRecorderWindow(logger, controller, notify);
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
    // Выход решён: запись, начатая сейчас кнопкой, треем или клавишей, оборвалась бы вместе с программой.
    controller.lockForQuit();
    hotkeys.dispose();
    await controller.stopForQuit();
  } catch (err) {
    logger.error('Ошибка при остановке записи перед выходом', err);
  } finally {
    preparingQuit = false;
  }
  if (controller.getState().phase !== 'idle') return;
  logger.info('TextMeet завершает работу');
  // Недоделанные встречи из файлов убираются: исходные файлы на месте, добавить их можно снова.
  await importer?.disposeForQuit().catch((err: unknown) => logger.error('Импорт не остановился перед выходом', err));
  // Идущий ответ модели сохраняется как остановленный, движок итогов завершается.
  await aiRunner?.disposeForQuit().catch((err: unknown) => logger.error('Итоги не остановились перед выходом', err));
  await logger.flush();
  // Только когда выход точно состоится: остановленная очередь молча пропускала бы новые встречи.
  // Встречи остаются «в очереди» / «расшифровывается» и продолжатся при следующем запуске.
  transcription?.dispose();
  quitApproved = true;
  app.quit();
}

/**
 * При запуске: закрыть прерванные сбоем записи и импорт, досвести и продолжить расшифровку того, что не успело.
 */
async function recoverAndMix(
  logger: Logger,
  libraryDir: string,
  notify: Notify,
  mixer: Mixer,
  controller: RecordingController,
  queue: TranscriptionQueue,
  imports: Importer,
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
    // Файлы могли начать добавлять сразу после запуска — их встречи не трогаем.
    const interrupted = await recoverInterruptedImports(libraryDir, logger, (id) => imports.isPending(libraryDir, id));
    if (interrupted.length > 0) sendToMain(IPC.libraryChanged);
    const entries = await listMeetings(libraryDir);
    for (const id of meetingsNeedingMix(entries)) mixer.enqueue(libraryDir, id);
    queue.resume(libraryDir, entries);
  } catch (err) {
    logger.error('Не удалось проверить прерванные записи', err);
  }
}

/** Исполняемый файл процесса по номеру (для уборки оставшегося движка итогов); нет процесса или ошибка — null. */
function processImage(pid: number): Promise<string | null> {
  const [file, args] =
    process.platform === 'win32'
      ? ['tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']]
      : ['ps', ['-p', String(pid), '-o', 'comm=']];
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve(null);
      const line = stdout.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
      resolve(process.platform === 'win32' ? parseTasklistImage(line) : line.trim() || null);
    });
  });
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
  const searchIndex = new SearchIndex({ libraryDir, logger });
  const mixer = new Mixer({
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
    onSettled: () => sendToMain(IPC.libraryChanged),
  });

  const modelsDir = modelsRoot({
    platform: process.platform,
    homeDir: app.getPath('home'),
    localAppData: process.env.LOCALAPPDATA,
    override: testVars.TEXTMEET_MODELS_DIR,
  });
  const models: ModelStore = fakeAsr
    ? new FakeModelStore(modelsDir, fakeDownloadStepMs, fakeInstalled)
    : new ModelManager({ root: modelsDir, logger, freeBytes: freeDiskBytes });
  const catalogDownloads = new CatalogDownloads({
    models,
    logger,
    changed: () => sendToMain(IPC.modelsChanged),
    now: () => Date.now(),
  });
  const llamaCommand = (): LlamaCommand =>
    fakeLlm
      ? { file: process.execPath, args: [fakeLlm], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
      : {
          file: join(
            llamaDir({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
            llamaServerFile(process.platform),
          ),
          args: [],
        };
  const enginePid: EnginePidDeps = {
    pidFile: join(app.getPath('userData'), 'llama-server.pid'),
    platform: process.platform,
    processImage,
    kill: (pid) => process.kill(pid),
    logger,
  };
  // Движок итогов, оставшийся после падения программы, держал бы видеопамять — завершаем до первого запроса.
  await killOrphanEngine(enginePid).catch((err: unknown) =>
    logger.warn('Не удалось проверить движок итогов, оставшийся с прошлого запуска', err),
  );
  const llamaServer = new LlamaServer({
    command: llamaCommand,
    logger,
    onSpawn: (pid, file) => {
      recordEnginePid(enginePid, pid, file).catch((err: unknown) => logger.warn('Не удалось записать номер движка итогов', err));
    },
    onExit: () => {
      clearEnginePid(enginePid).catch((err: unknown) => logger.warn('Не удалось стереть номер движка итогов', err));
    },
  });
  const ai = new AiRunner({
    libraryDir,
    model: async () => {
      const { selected } = await currentAiModel({ models, settings, logger });
      return selected && { id: selected, path: llmFilePath(models.root, selected) };
    },
    engine: llamaEngine(llamaServer),
    aiPrompt: () => settings.settled().then(() => settings.get().aiPrompt),
    now: () => new Date(),
    logger,
    changed: (state) => sendToMain(IPC.aiState, state),
    saved: (id) => {
      // Слова итогов и ответов сразу ищутся.
      searchIndex.invalidate(id);
      searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не обновился', err));
      sendToMain(IPC.aiChanged, id);
    },
  });
  aiRunner = ai;
  const queue = new TranscriptionQueue({
    spawn: () => spawnTranscriptionWorker(logger, { fakeEngines: fakeAsr }),
    models,
    ffmpegPath: () => resolveFfmpegPath(),
    // Запись начинается и кончается по ходу расшифровки: число потоков спрашивается каждый раз.
    threads: () => (controller.getState().phase === 'idle' ? FULL_THREADS : RECORDING_THREADS),
    now: () => Date.now(),
    logger,
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    progressChanged: (progress) => sendToMain(IPC.transcriptionProgress, progress),
    finished: ({ meeting, ok }) => {
      const text = ok ? notificationTexts.transcribed(meeting.title) : notificationTexts.transcribeFailed(meeting.title);
      if (testRun) logger.info(`Уведомление не показано (автотест): ${text.title}`);
      else notify(text, true, () => showMeeting(meeting.id));
    },
  });
  transcription = queue;
  let lastPhase = 'idle';

  const controller = new RecordingController({
    platform: process.platform,
    logger,
    recorder: {
      isReady: () => recorderReady && !!recorderWindow && !recorderWindow.isDestroyed(),
      isBroken: () => recorderBroken,
      start: (command) => sendToRecorder(IPC.recorderStart, command),
      stop: () => sendToRecorder(IPC.recorderStop),
      playSound: (kind) => sendToRecorder(IPC.recorderPlaySound, kind),
    },
    now: () => Date.now(),
    libraryDir,
    settings: () => settings.get(),
    hotkeyLabel: () => (hotkeys && !hotkeys.busy ? hotkeys.label : null),
    freeBytes: freeDiskBytes,
    confirmLowDisk,
    ensureMicAccess: async () =>
      testMedia !== null || process.platform !== 'darwin' || (await systemPreferences.askForMediaAccess('microphone')),
    notify,
    showMainWindow: () => openMainWindow(logger),
    emitState: (state) => {
      sendToMain(IPC.recordingState, state);
      tray?.update(state.phase, hotkeys?.accelerator ?? '');
      if ((state.phase === 'idle') !== (lastPhase === 'idle')) queue.threadsChanged();
      lastPhase = state.phase;
    },
    emitPeaks: (peaks) => {
      if (mainVisible()) sendToMain(IPC.recordingPeaks, peaks);
    },
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    enqueueMix: (dir, id) => mixer.enqueue(dir, id),
    // Модель — из настроек на момент ответа в окне «Запись остановлена» / «Файл добавлен».
    enqueueTranscription: (dir, id) => queue.enqueue(dir, id, undefined, settings.get().asrModel),
  });
  const imports = new Importer({
    ffmpegPath: () => resolveFfmpegPath(),
    logger,
    now: () => new Date(),
    freeBytes: freeDiskBytes,
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    progressChanged: (progress) => sendToMain(IPC.importProgress, progress),
    imported: ({ libraryDir: dir, meeting }) => {
      mixer.enqueue(dir, meeting.id);
      controller.queueDialog({
        kind: 'import',
        meetingId: meeting.id,
        title: meeting.title,
        durationSec: meeting.durationSec,
        fileName: meeting.sourceFileName,
      });
    },
    failed: (failure) => sendToMain(IPC.importFailed, failure),
  });
  importer = imports;
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
    mixFailed: (dir, id) => mixer.hasFailed(dir, id),
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
    libraryChanged: () => sendToMain(IPC.libraryChanged),
    search: searchIndex,
    deletion: {
      libraryDir,
      trash,
      isRecording: (id) => {
        const state = controller.getState();
        return state.phase !== 'idle' && state.meetingId === id;
      },
      transcription: queue,
      mixer,
      importer: imports,
      logger,
      dropStopDialog: (id) => controller.dropStopDialog(id),
    },
    importer: imports,
    exporting: {
      libraryDir,
      chooseSavePath: async (defaultPath, format) => {
        const options: Electron.SaveDialogOptions = {
          title: format === 'docx' ? 'Сохранить в Word' : 'Сохранить как текст',
          defaultPath,
          filters: [
            format === 'docx' ? { name: 'Документ Word', extensions: ['docx'] } : { name: 'Текст', extensions: ['txt'] },
          ],
        };
        const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      writeClipboard: (data) =>
        clipboard.write([
          new ClipboardItem(
            data.html === undefined ? { 'text/plain': data.text } : { 'text/plain': data.text, 'text/html': data.html },
          ),
        ]),
      exportDir: () => settings.get().exportDir,
      aiPrompt: () => settings.settled().then(() => settings.get().aiPrompt),
      rememberExportDir: (dir) => settings.update({ exportDir: dir }),
      confirmReplace: async (path) => {
        const text = dialogTexts.replaceExport(basename(path));
        const options: Electron.MessageBoxOptions = {
          type: 'question',
          title: text.title,
          message: text.message,
          detail: text.detail,
          buttons: text.buttons,
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        };
        const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        const { response } = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
        return response === 1;
      },
      documentsDir: () => app.getPath('documents'),
      platform: process.platform,
      logger,
    },
    transcription: queue,
    models,
    ai,
    downloads: catalogDownloads,
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
  // macOS: выключение ещё можно отменить — остановленная очередь молча пропускала бы новые встречи до перезапуска.
  // Состоявшийся выход и так пройдёт через before-quit → prepareQuit, а он остановит очередь.
  powerMonitor.on('shutdown', onSystemEnding);

  recorderWindow = startRecorderWindow(logger, controller, notify);
  mainWindow = startMainWindow(logger, showRequested || !startedAtLogin());
  mainWindow.on('session-end', () => {
    // Windows: сеанс уже заканчивается, а before-quit может и не наступить: система закроет процесс расшифровки
    // сама, и без dispose() очередь посчитала бы это сбоем. Остановленная очередь оставляет встречу
    // «расшифровывается» — до следующего запуска.
    transcription?.dispose();
    void importer?.stop();
    void aiRunner?.disposeForQuit();
    onSystemEnding();
  });
  windowsCreated = true;
  tray = createTray(
    { openWindow: () => openMainWindow(logger), toggleRecording: () => void controller.toggle(), quit: () => app.quit() },
    hotkeyManager.accelerator,
  );
  if (hotkeyManager.busy) notify(notificationTexts.hotkeyBusy(hotkeyManager.label));
  logger.info(`TextMeet ${app.getVersion()} запущен (${process.platform})`);
  void recoverAndMix(logger, libraryDir(), notify, mixer, controller, queue, imports);
  searchIndex.refresh().catch((err: unknown) => logger.warn('Поиск не построился при запуске', err));
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
