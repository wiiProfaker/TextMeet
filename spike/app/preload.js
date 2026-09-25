'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  info: () => ipcRenderer.invoke('app:info'),
  setCaptureMode: (mode) => ipcRenderer.invoke('capture:set-mode', mode),
  save: (name, bytes) => ipcRenderer.invoke('capture:save', name, bytes),
  appendLog: (line) => ipcRenderer.invoke('log:append', line),
  openOutDir: () => ipcRenderer.invoke('out:open'),
  runAsr: () => ipcRenderer.invoke('asr:run'),
  onAsrLog: (callback) => ipcRenderer.on('asr:log', (_e, text) => callback(text)),
  quit: () => ipcRenderer.invoke('app:quit'),
});
