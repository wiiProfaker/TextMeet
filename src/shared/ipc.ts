// Контракт между окнами и main. Здесь только типы и имена каналов:
// preload работает в песочнице и не может подключать zod и другие пакеты.
import type { MeetingListEntry } from './meeting';
import type { Settings } from './settings';

export const IPC = {
  getSettings: 'settings:get',
  setLaunchAtLogin: 'settings:set-launch-at-login',
  chooseLibraryDir: 'settings:choose-library-dir',
  openLibraryDir: 'library:open-dir',
  listMeetings: 'library:list',
  getAppInfo: 'app:info',
  recorderReady: 'recorder:ready',
} as const;

/** Что показать под переключателем «Запускать при входе в систему». */
export type LaunchAtLoginNotice = 'none' | 'dev-build' | 'needs-approval' | 'blocked-by-system' | 'unsupported';

export interface SettingsState {
  settings: Settings;
  /** Итоговая папка библиотеки (с учётом значения по умолчанию). */
  libraryDir: string;
  launchAtLoginNotice: LaunchAtLoginNotice;
}

export interface AppInfo {
  version: string;
  platform: string;
  logFile: string;
  recorderReady: boolean;
}

/** API главного окна: window.textmeet */
export interface TextMeetApi {
  getSettings(): Promise<SettingsState>;
  setLaunchAtLogin(enabled: boolean): Promise<SettingsState>;
  chooseLibraryDir(): Promise<SettingsState>;
  openLibraryDir(): Promise<void>;
  listMeetings(): Promise<MeetingListEntry[]>;
  getAppInfo(): Promise<AppInfo>;
}

/** API скрытого окна записи: window.recorder */
export interface RecorderBridge {
  ready(): void;
}
