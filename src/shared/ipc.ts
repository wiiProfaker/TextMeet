// Контракт между окнами и main: имена каналов и таблицы «канал → что передаётся → что возвращается».
// preload и main пользуются типизированными обёртками над этими таблицами, поэтому расхождение ловит
// проверка типов. preload работает в песочнице и не может подключать zod и другие пакеты:
// здесь только константы и типы, из других файлов — только `import type`.
import type { AsrModelId } from './asr-models';
import type { Meeting, MeetingListEntry } from './meeting';
import type {
  Peaks,
  RecorderChunk,
  RecorderPeaks,
  RecorderStartCommand,
  RecorderStarted,
  RecorderStartFailed,
  RecorderStopped,
  RecorderTrackEnded,
  RecordingState,
  SoundKind,
  StopDialogAnswer,
  SystemSettingsKind,
} from './recording';
import type { SearchResult } from './search';
import type { Settings } from './settings';
import type { SpeakerId, Transcript } from './transcript';
import type { TranscriptEdit } from './transcript-edit';
import type { ModelGroupId, ModelsState, TranscribeRequest, TranscriptionProgress } from './transcription';

export const IPC = {
  // Главное окно → main (запрос — ответ).
  getSettings: 'settings:get',
  setLaunchAtLogin: 'settings:set-launch-at-login',
  chooseLibraryDir: 'settings:choose-library-dir',
  setMicrophone: 'settings:set-microphone',
  setRecordSounds: 'settings:set-record-sounds',
  setHotkey: 'settings:set-hotkey',
  suspendHotkey: 'settings:suspend-hotkey',
  openLibraryDir: 'library:open-dir',
  openMeetingDir: 'library:open-meeting-dir',
  listMeetings: 'library:list',
  renameMeeting: 'library:rename-meeting',
  renameSpeaker: 'library:rename-speaker',
  editTranscript: 'library:edit-transcript',
  search: 'library:search',
  audioSize: 'library:audio-size',
  deleteAudio: 'library:delete-audio',
  deleteMeeting: 'library:delete-meeting',
  getAppInfo: 'app:info',
  getRecordingState: 'recording:get-state',
  toggleRecording: 'recording:toggle',
  setSystemAudio: 'recording:set-system-audio',
  dismissStartProblem: 'recording:dismiss-problem',
  finishStopDialog: 'recording:finish-stop-dialog',
  openSystemSettings: 'system:open-settings',
  transcribe: 'transcription:start',
  getTranscript: 'transcription:get-transcript',
  getTranscriptionProgress: 'transcription:get-progress',
  getModels: 'models:get',
  deleteModels: 'models:delete',
  downloadModel: 'models:download',
  cancelModelDownload: 'models:cancel-download',
  selectModel: 'models:select',
  // main → главное окно (события).
  recordingState: 'recording:state',
  recordingPeaks: 'recording:peaks',
  libraryChanged: 'library:changed',
  transcriptionProgress: 'transcription:progress',
  /** Скачивание из каталога продвинулось, началось или закончилось — перечитать модели. */
  modelsChanged: 'models:changed',
  /** Щелчок по уведомлению о расшифровке: показать эту встречу. */
  showMeeting: 'app:show-meeting',
  // main → окно записи (команды).
  recorderStart: 'recorder:start',
  recorderStop: 'recorder:stop',
  recorderPlaySound: 'recorder:play-sound',
  // Окно записи → main (сообщения).
  recorderReady: 'recorder:ready',
  recorderStarted: 'recorder:started',
  recorderStartFailed: 'recorder:start-failed',
  recorderChunk: 'recorder:chunk',
  recorderPeaks: 'recorder:peaks',
  recorderTrackEnded: 'recorder:track-ended',
  recorderStopped: 'recorder:stopped',
} as const;

/** Что показать под переключателем «Запускать при входе в систему». */
export type LaunchAtLoginNotice = 'none' | 'dev-build' | 'needs-approval' | 'blocked-by-system' | 'unsupported';

export interface HotkeyState {
  /** Действующая комбинация (accelerator). */
  accelerator: string;
  /** Как показать человеку: «Ctrl+Space», «⌥ Space». */
  label: string;
  isDefault: boolean;
  /** Не удалось зарегистрировать — занята другой программой. */
  busy: boolean;
}

export interface SettingsState {
  settings: Settings;
  /** Итоговая папка библиотеки (с учётом значения по умолчанию). */
  libraryDir: string;
  launchAtLoginNotice: LaunchAtLoginNotice;
  hotkey: HotkeyState;
}

export type HotkeyChange = { ok: true; state: SettingsState } | { ok: false; message: string; state: SettingsState };

export interface AppInfo {
  version: string;
  platform: string;
  logFile: string;
  recorderReady: boolean;
}

export interface RenameMeetingRequest {
  meetingId: string;
  title: string;
}

export interface RenameSpeakerRequest {
  meetingId: string;
  speakerId: SpeakerId;
  /** null или пусто — вернуть «Спикер N» / «Я». */
  name: string | null;
}

export interface EditTranscriptRequest {
  meetingId: string;
  edit: TranscriptEdit;
}

export interface EditedTranscript {
  meeting: Meeting;
  transcript: Transcript;
}

/** Запросы главного окна: канал → аргумент (void — без аргумента) → ответ. */
export interface MainInvokeContract {
  [IPC.getSettings]: { arg: void; result: SettingsState };
  [IPC.setLaunchAtLogin]: { arg: boolean; result: SettingsState };
  [IPC.chooseLibraryDir]: { arg: void; result: SettingsState };
  [IPC.setMicrophone]: { arg: string | null; result: SettingsState };
  [IPC.setRecordSounds]: { arg: boolean; result: SettingsState };
  [IPC.setHotkey]: { arg: string | null; result: HotkeyChange };
  [IPC.suspendHotkey]: { arg: boolean; result: void };
  [IPC.openLibraryDir]: { arg: void; result: void };
  [IPC.openMeetingDir]: { arg: string; result: void };
  [IPC.listMeetings]: { arg: void; result: MeetingListEntry[] };
  [IPC.renameMeeting]: { arg: RenameMeetingRequest; result: Meeting };
  [IPC.renameSpeaker]: { arg: RenameSpeakerRequest; result: Meeting };
  [IPC.editTranscript]: { arg: EditTranscriptRequest; result: EditedTranscript };
  [IPC.search]: { arg: string; result: SearchResult };
  [IPC.audioSize]: { arg: string; result: number };
  [IPC.deleteAudio]: { arg: string; result: void };
  [IPC.deleteMeeting]: { arg: string; result: void };
  [IPC.getAppInfo]: { arg: void; result: AppInfo };
  [IPC.getRecordingState]: { arg: void; result: RecordingState };
  [IPC.toggleRecording]: { arg: void; result: void };
  [IPC.setSystemAudio]: { arg: boolean; result: RecordingState };
  [IPC.dismissStartProblem]: { arg: void; result: void };
  [IPC.finishStopDialog]: { arg: StopDialogAnswer; result: void };
  [IPC.openSystemSettings]: { arg: SystemSettingsKind; result: void };
  [IPC.transcribe]: { arg: TranscribeRequest; result: void };
  [IPC.getTranscript]: { arg: string; result: Transcript | null };
  [IPC.getTranscriptionProgress]: { arg: void; result: TranscriptionProgress[] };
  [IPC.getModels]: { arg: void; result: ModelsState };
  [IPC.deleteModels]: { arg: ModelGroupId; result: ModelsState };
  [IPC.downloadModel]: { arg: AsrModelId; result: ModelsState };
  [IPC.cancelModelDownload]: { arg: AsrModelId; result: ModelsState };
  [IPC.selectModel]: { arg: AsrModelId; result: ModelsState };
}
export type MainInvokeChannel = keyof MainInvokeContract;
export type InvokeArg<C extends MainInvokeChannel> = MainInvokeContract[C]['arg'];
export type InvokeResult<C extends MainInvokeChannel> = MainInvokeContract[C]['result'];

/** События main → главное окно. */
export interface MainEventContract {
  [IPC.recordingState]: RecordingState;
  [IPC.recordingPeaks]: Peaks;
  [IPC.libraryChanged]: void;
  [IPC.transcriptionProgress]: TranscriptionProgress[];
  [IPC.modelsChanged]: void;
  [IPC.showMeeting]: string;
}
export type MainEventChannel = keyof MainEventContract;

/** Команды main → окно записи. */
export interface RecorderCommandContract {
  [IPC.recorderStart]: RecorderStartCommand;
  [IPC.recorderStop]: void;
  [IPC.recorderPlaySound]: SoundKind;
}
export type RecorderCommandChannel = keyof RecorderCommandContract;

/** Сообщения окна записи → main. */
export interface RecorderMessageContract {
  [IPC.recorderReady]: void;
  [IPC.recorderStarted]: RecorderStarted;
  [IPC.recorderStartFailed]: RecorderStartFailed;
  [IPC.recorderChunk]: RecorderChunk;
  [IPC.recorderPeaks]: RecorderPeaks;
  [IPC.recorderTrackEnded]: RecorderTrackEnded;
  [IPC.recorderStopped]: RecorderStopped;
}
export type RecorderMessageChannel = keyof RecorderMessageContract;

type Listener<T> = (payload: T) => void;
type Unsubscribe = () => void;

/** API главного окна: window.textmeet */
export interface TextMeetApi {
  getSettings(): Promise<SettingsState>;
  setLaunchAtLogin(enabled: boolean): Promise<SettingsState>;
  chooseLibraryDir(): Promise<SettingsState>;
  setMicrophone(deviceId: string | null): Promise<SettingsState>;
  setRecordSounds(enabled: boolean): Promise<SettingsState>;
  /** null — вернуть комбинацию по умолчанию. */
  setHotkey(accelerator: string | null): Promise<HotkeyChange>;
  /** Пока в настройках вводят новую комбинацию, действующая снимается. */
  suspendHotkey(suspended: boolean): Promise<void>;
  openLibraryDir(): Promise<void>;
  openMeetingDir(id: string): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  renameMeeting(request: RenameMeetingRequest): Promise<Meeting>;
  renameSpeaker(request: RenameSpeakerRequest): Promise<Meeting>;
  /** Правка текста встречи; ответ — встреча и сохранённый текст. */
  editTranscript(request: EditTranscriptRequest): Promise<EditedTranscript>;
  /** Поиск по всем встречам. */
  search(query: string): Promise<SearchResult>;
  /** Сколько байт занимает аудио встречи (для окна «Удалить аудио?»). */
  audioSize(meetingId: string): Promise<number>;
  /** «Удалить аудио»: папка audio/ — в Корзину, текст остаётся. */
  deleteAudio(meetingId: string): Promise<void>;
  /** «Удалить встречу»: папка встречи — в Корзину (и папка, которую не удалось прочитать). */
  deleteMeeting(meetingId: string): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  getRecordingState(): Promise<RecordingState>;
  toggleRecording(): Promise<void>;
  setSystemAudio(enabled: boolean): Promise<RecordingState>;
  dismissStartProblem(): Promise<void>;
  finishStopDialog(answer: StopDialogAnswer): Promise<void>;
  openSystemSettings(kind: SystemSettingsKind): Promise<void>;
  /** «Расшифровать», «Расшифровать заново», «Повторить». */
  transcribe(request: TranscribeRequest): Promise<void>;
  /** Текст встречи; null — ещё не расшифрована. */
  getTranscript(meetingId: string): Promise<Transcript | null>;
  getTranscriptionProgress(): Promise<TranscriptionProgress[]>;
  getModels(): Promise<ModelsState>;
  deleteModels(group: ModelGroupId): Promise<ModelsState>;
  /** «Скачать» в карточке модели. */
  downloadModel(id: AsrModelId): Promise<ModelsState>;
  /** «Отменить» скачивание: недокачанное стирается. */
  cancelModelDownload(id: AsrModelId): Promise<ModelsState>;
  /** «Выбрать»: модель для новых встреч. */
  selectModel(id: AsrModelId): Promise<ModelsState>;
  onRecordingState(listener: Listener<RecordingState>): Unsubscribe;
  onPeaks(listener: Listener<Peaks>): Unsubscribe;
  onLibraryChanged(listener: () => void): Unsubscribe;
  onTranscriptionProgress(listener: Listener<TranscriptionProgress[]>): Unsubscribe;
  onModelsChanged(listener: () => void): Unsubscribe;
  onShowMeeting(listener: Listener<string>): Unsubscribe;
}

/** API скрытого окна записи: window.recorder */
export interface RecorderBridge {
  ready(): void;
  started(message: RecorderStarted): void;
  startFailed(message: RecorderStartFailed): void;
  chunk(message: RecorderChunk): void;
  peaks(message: RecorderPeaks): void;
  trackEnded(message: RecorderTrackEnded): void;
  stopped(message: RecorderStopped): void;
  onStart(listener: Listener<RecorderStartCommand>): Unsubscribe;
  onStop(listener: () => void): Unsubscribe;
  onPlaySound(listener: Listener<SoundKind>): Unsubscribe;
}
