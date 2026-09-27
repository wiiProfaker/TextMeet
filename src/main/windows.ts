import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { Logger } from './logger';

type Page = 'main' | 'recorder';

// Один preload на оба окна; какое окно что может — проверяет main (ipc.ts).
const PRELOAD = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: Page, logger: Logger): void {
  // В режиме разработки (npm run dev) страницы отдаёт dev-сервер electron-vite.
  const devUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
  const loading = devUrl
    ? win.loadURL(`${devUrl}/${page}/index.html`)
    : win.loadFile(join(__dirname, `../renderer/${page}/index.html`));
  loading.catch((err: unknown) => logger.error(`Не удалось загрузить окно ${page}`, err));
}

/** Окна показывают только свои страницы: никаких новых окон и переходов по ссылкам. */
function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

export function createMainWindow(logger: Logger, options: { show: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'TextMeet',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockDown(win);
  if (options.show) win.once('ready-to-show', () => win.show());
  loadPage(win, 'main', logger);
  return win;
}

/** Скрытое окно записи: живёт всё время работы программы, не зависит от главного окна. */
export function createRecorderWindow(logger: Logger): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    skipTaskbar: true,
    title: 'TextMeet — запись',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Скрытое окно не должно «засыпать»: иначе запись будет рваться.
      backgroundThrottling: false,
    },
  });
  lockDown(win);
  loadPage(win, 'recorder', logger);
  return win;
}
