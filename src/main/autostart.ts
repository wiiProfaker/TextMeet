import { app } from 'electron';
import type { LaunchAtLoginNotice } from '../shared/ipc';
import { HIDDEN_ARG, launchAtLoginNotice, shouldStartHidden, type LoginItemState } from './startup';

const WINDOWS_LOGIN_OPTIONS = { args: [HIDDEN_ARG] };

const isSupported = (): boolean => process.platform === 'win32' || process.platform === 'darwin';

function readLoginItem(): LoginItemState {
  return process.platform === 'win32' ? app.getLoginItemSettings(WINDOWS_LOGIN_OPTIONS) : app.getLoginItemSettings();
}

/**
 * Приводит автозапуск в системе к значению из настроек. Только для установленной программы:
 * версия для разработки не должна прописывать в автозагрузку electron.exe.
 * Если значение уже совпадает — ничего не трогаем, чтобы не отменять выбор пользователя в Диспетчере задач.
 */
export function syncLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged || !isSupported()) return;
  if (readLoginItem().openAtLogin === enabled) return;
  const settings = process.platform === 'win32' ? { openAtLogin: enabled, ...WINDOWS_LOGIN_OPTIONS } : { openAtLogin: enabled };
  app.setLoginItemSettings(settings);
}

export function currentLaunchAtLoginNotice(enabled: boolean): LaunchAtLoginNotice {
  const state = app.isPackaged && isSupported() ? readLoginItem() : null;
  return launchAtLoginNotice({ enabled, isPackaged: app.isPackaged, platform: process.platform, state });
}

export function startedAtLogin(): boolean {
  return shouldStartHidden({
    platform: process.platform,
    argv: process.argv,
    wasOpenedAtLogin: process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin,
  });
}
