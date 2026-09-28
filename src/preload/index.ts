// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type RecorderBridge, type TextMeetApi } from '../shared/ipc';

const api: TextMeetApi = {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC.setLaunchAtLogin, enabled),
  chooseLibraryDir: () => ipcRenderer.invoke(IPC.chooseLibraryDir),
  openLibraryDir: () => ipcRenderer.invoke(IPC.openLibraryDir),
  listMeetings: () => ipcRenderer.invoke(IPC.listMeetings),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
};

const recorder: RecorderBridge = {
  ready: () => ipcRenderer.send(IPC.recorderReady),
};

contextBridge.exposeInMainWorld('textmeet', api);
contextBridge.exposeInMainWorld('recorder', recorder);
