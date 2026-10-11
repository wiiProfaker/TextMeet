// Один preload на оба окна. Preload работает в песочнице: подключать можно только 'electron'
// и собственный код без пакетов (zod сюда не тянуть). Кому что разрешено, проверяет main (ipc.ts).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { heldEvent } from '../shared/held-event';
import {
  IPC,
  type InvokeArg,
  type InvokeResult,
  type MainEventChannel,
  type MainEventContract,
  type MainInvokeChannel,
  type RecorderBridge,
  type RecorderCommandChannel,
  type RecorderCommandContract,
  type RecorderMessageChannel,
  type RecorderMessageContract,
  type TextMeetApi,
} from '../shared/ipc';

// Аргумент void означает «без аргумента»: такие каналы вызываются без второго параметра.
type ArgList<T> = [T] extends [void] ? [] : [T];

const invoke = <C extends MainInvokeChannel>(channel: C, ...arg: ArgList<InvokeArg<C>>): Promise<InvokeResult<C>> =>
  ipcRenderer.invoke(channel, ...arg);

function subscribe<C extends MainEventChannel | RecorderCommandChannel>(
  channel: C,
  listener: (payload: (MainEventContract & RecorderCommandContract)[C]) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: (MainEventContract & RecorderCommandContract)[C]) =>
    listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

// Щелчок по уведомлению «Текст встречи готов»: main шлёт встречу, когда страница загрузилась, а React
// подписывается позже (в useEffect) — просьба держится до подписки и не теряется.
const showMeeting = heldEvent<string>();
ipcRenderer.on(IPC.showMeeting, (_event: IpcRendererEvent, id: string) => showMeeting.emit(id));

const send = <C extends RecorderMessageChannel>(channel: C, ...payload: ArgList<RecorderMessageContract[C]>): void =>
  ipcRenderer.send(channel, ...payload);

const api: TextMeetApi = {
  getSettings: () => invoke(IPC.getSettings),
  setLaunchAtLogin: (enabled) => invoke(IPC.setLaunchAtLogin, enabled),
  chooseLibraryDir: () => invoke(IPC.chooseLibraryDir),
  setMicrophone: (deviceId) => invoke(IPC.setMicrophone, deviceId),
  setRecordSounds: (enabled) => invoke(IPC.setRecordSounds, enabled),
  setHotkey: (accelerator) => invoke(IPC.setHotkey, accelerator),
  suspendHotkey: (suspended) => invoke(IPC.suspendHotkey, suspended),
  openLibraryDir: () => invoke(IPC.openLibraryDir),
  openMeetingDir: (id) => invoke(IPC.openMeetingDir, id),
  listMeetings: () => invoke(IPC.listMeetings),
  renameMeeting: (request) => invoke(IPC.renameMeeting, request),
  renameSpeaker: (request) => invoke(IPC.renameSpeaker, request),
  editTranscript: (request) => invoke(IPC.editTranscript, request),
  search: (query) => invoke(IPC.search, query),
  audioSize: (meetingId) => invoke(IPC.audioSize, meetingId),
  deleteAudio: (meetingId) => invoke(IPC.deleteAudio, meetingId),
  deleteMeeting: (meetingId) => invoke(IPC.deleteMeeting, meetingId),
  getAppInfo: () => invoke(IPC.getAppInfo),
  getRecordingState: () => invoke(IPC.getRecordingState),
  toggleRecording: () => invoke(IPC.toggleRecording),
  setSystemAudio: (enabled) => invoke(IPC.setSystemAudio, enabled),
  dismissStartProblem: () => invoke(IPC.dismissStartProblem),
  finishStopDialog: (answer) => invoke(IPC.finishStopDialog, answer),
  openSystemSettings: (kind) => invoke(IPC.openSystemSettings, kind),
  transcribe: (request) => invoke(IPC.transcribe, request),
  getTranscript: (meetingId) => invoke(IPC.getTranscript, meetingId),
  getTranscriptionProgress: () => invoke(IPC.getTranscriptionProgress),
  getModels: () => invoke(IPC.getModels),
  deleteModels: (group) => invoke(IPC.deleteModels, group),
  downloadModel: (id) => invoke(IPC.downloadModel, id),
  cancelModelDownload: (id) => invoke(IPC.cancelModelDownload, id),
  selectModel: (id) => invoke(IPC.selectModel, id),
  copyMeeting: (meetingId) => invoke(IPC.copyMeeting, meetingId),
  saveMeeting: (request) => invoke(IPC.saveMeeting, request),
  onRecordingState: (listener) => subscribe(IPC.recordingState, listener),
  onPeaks: (listener) => subscribe(IPC.recordingPeaks, listener),
  onLibraryChanged: (listener) => subscribe(IPC.libraryChanged, () => listener()),
  onTranscriptionProgress: (listener) => subscribe(IPC.transcriptionProgress, listener),
  onModelsChanged: (listener) => subscribe(IPC.modelsChanged, () => listener()),
  onShowMeeting: (listener) => showMeeting.subscribe(listener),
};

const recorder: RecorderBridge = {
  ready: () => send(IPC.recorderReady),
  started: (message) => send(IPC.recorderStarted, message),
  startFailed: (message) => send(IPC.recorderStartFailed, message),
  chunk: (message) => send(IPC.recorderChunk, message),
  peaks: (message) => send(IPC.recorderPeaks, message),
  trackEnded: (message) => send(IPC.recorderTrackEnded, message),
  stopped: (message) => send(IPC.recorderStopped, message),
  onStart: (listener) => subscribe(IPC.recorderStart, listener),
  onStop: (listener) => subscribe(IPC.recorderStop, () => listener()),
  onPlaySound: (listener) => subscribe(IPC.recorderPlaySound, listener),
};

contextBridge.exposeInMainWorld('textmeet', api);
contextBridge.exposeInMainWorld('recorder', recorder);
