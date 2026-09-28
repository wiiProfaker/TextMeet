import { promises as fsp } from 'node:fs';
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';
import { IPC, type AppInfo, type LaunchAtLoginNotice, type SettingsState } from '../shared/ipc';
import { listMeetings } from './library/library';
import type { Logger } from './logger';
import type { SettingsStore } from './settings/settings-store';

export interface IpcDeps {
  settings: SettingsStore;
  logger: Logger;
  libraryDir(): string;
  launchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice;
  applyLaunchAtLogin(enabled: boolean): void;
  mainContents(): WebContents | null;
  recorderContents(): WebContents | null;
  appInfo(): AppInfo;
  onRecorderReady(): void;
}

export function registerIpc(deps: IpcDeps): void {
  /** Каналы главного окна отвечают только главному окну; ошибки пишутся в журнал и уходят в окно. */
  const handleFromMain = <T>(channel: string, handler: (event: IpcMainInvokeEvent, arg: unknown) => Promise<T> | T) => {
    ipcMain.handle(channel, async (event, arg: unknown) => {
      try {
        // Проверка внутри try — чтобы отказ «чужому» окну тоже попал в журнал.
        if (event.sender !== deps.mainContents()) throw new Error(`IPC ${channel}: запрос не из главного окна`);
        return await handler(event, arg);
      } catch (err) {
        deps.logger.error(`IPC ${channel} завершился ошибкой`, err);
        throw err;
      }
    });
  };

  const settingsState = (): SettingsState => {
    const settings = deps.settings.get();
    return {
      settings,
      libraryDir: deps.libraryDir(),
      launchAtLoginNotice: deps.launchAtLoginNotice(settings.launchAtLogin),
    };
  };

  handleFromMain(IPC.getSettings, () => settingsState());

  handleFromMain(IPC.setLaunchAtLogin, async (_event, arg) => {
    const enabled = z.boolean().parse(arg);
    await deps.settings.update({ launchAtLogin: enabled });
    deps.applyLaunchAtLogin(enabled);
    return settingsState();
  });

  handleFromMain(IPC.chooseLibraryDir, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Папка библиотеки TextMeet',
      defaultPath: deps.libraryDir(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (!result.canceled && picked) await deps.settings.update({ libraryDir: picked });
    return settingsState();
  });

  handleFromMain(IPC.openLibraryDir, async () => {
    const dir = deps.libraryDir();
    await fsp.mkdir(dir, { recursive: true });
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(`Не удалось открыть папку: ${failure}`);
  });

  handleFromMain(IPC.listMeetings, () => listMeetings(deps.libraryDir()));

  handleFromMain(IPC.getAppInfo, () => deps.appInfo());

  ipcMain.on(IPC.recorderReady, (event) => {
    if (event.sender === deps.recorderContents()) deps.onRecorderReady();
    else deps.logger.warn(`IPC ${IPC.recorderReady}: сообщение не из окна записи`);
  });
}
