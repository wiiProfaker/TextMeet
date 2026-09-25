'use strict';
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fsp = require('node:fs/promises');

const AUTO = process.argv.includes('--auto');
const outDir = () => path.join(app.getPath('downloads'), 'textmeet-spike');
const logFile = () => path.join(outDir(), 'spike-log.txt');

let win = null;
let captureMode = 'screen'; // 'screen' — вариант А, 'frame' — вариант Б

function runAsrTest() {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (message) => {
      if (finished) return;
      finished = true;
      resolve(message);
    };
    const child = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], {
      serviceName: 'textmeet-asr-spike',
      allowLoadingUnsignedLibraries: true,
      env: { ...process.env, MODELS_DIR: path.join(app.getPath('userData'), 'models') },
    });
    child.on('message', (msg) => {
      if (msg.type === 'log') win.webContents.send('asr:log', msg.text);
      if (msg.type === 'done') {
        child.kill();
        finish('готово');
      }
    });
    child.on('exit', (code) => finish(`процесс распознавания завершился с кодом ${code}`));
  });
}

app.whenReady().then(async () => {
  await fsp.mkdir(outDir(), { recursive: true });
  if (AUTO) await fsp.writeFile(logFile(), '', 'utf8');

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (captureMode === 'frame') {
        callback({ video: request.frame, audio: 'loopback' });
        return;
      }
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0], audio: 'loopback' });
    } catch (err) {
      console.error('display media handler failed', err);
      callback({});
    }
  });

  ipcMain.handle('capture:set-mode', (_e, mode) => {
    captureMode = mode === 'frame' ? 'frame' : 'screen';
  });
  ipcMain.handle('capture:save', async (_e, name, bytes) => {
    const file = path.join(outDir(), path.basename(name));
    await fsp.writeFile(file, Buffer.from(bytes));
    return file;
  });
  ipcMain.handle('log:append', (_e, line) => fsp.appendFile(logFile(), `${line}\n`, 'utf8'));
  ipcMain.handle('out:open', () => shell.openPath(outDir()));
  ipcMain.handle('asr:run', () => runAsrTest());
  ipcMain.handle('app:info', () => ({
    auto: AUTO,
    platform: process.platform,
    osVersion: process.getSystemVersion(),
    electron: process.versions.electron,
  }));
  ipcMain.handle('app:quit', () => app.quit());

  win = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile('index.html');
});

app.on('window-all-closed', () => app.quit());
