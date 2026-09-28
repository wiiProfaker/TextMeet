import type { LaunchAtLoginNotice } from '../shared/ipc';

/** Аргумент, с которым Windows запускает TextMeet при входе в систему. */
export const HIDDEN_ARG = '--hidden';

export interface StartContext {
  platform: NodeJS.Platform;
  argv: readonly string[];
  /** macOS: app.getLoginItemSettings().wasOpenedAtLogin */
  wasOpenedAtLogin: boolean;
}

/** При автозапуске окно не показываем — программа сидит в трее. */
export function shouldStartHidden(ctx: StartContext): boolean {
  if (ctx.platform === 'darwin') return ctx.wasOpenedAtLogin;
  return ctx.argv.includes(HIDDEN_ARG);
}

export interface LoginItemState {
  openAtLogin: boolean;
  /** Windows: false, если автозапуск отключён в Диспетчере задач. */
  executableWillLaunchAtLogin?: boolean;
  /** macOS: 'enabled' | 'requires-approval' | 'not-registered' | 'not-found' */
  status?: string;
}

export interface NoticeInput {
  enabled: boolean;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  state: LoginItemState | null;
}

export function launchAtLoginNotice(input: NoticeInput): LaunchAtLoginNotice {
  if (input.platform !== 'win32' && input.platform !== 'darwin') return 'unsupported';
  if (!input.isPackaged) return 'dev-build';
  if (!input.enabled || input.state === null) return 'none';
  if (input.platform === 'darwin') {
    if (input.state.status === 'requires-approval') return 'needs-approval';
    return input.state.openAtLogin ? 'none' : 'blocked-by-system';
  }
  return input.state.openAtLogin && input.state.executableWillLaunchAtLogin !== false ? 'none' : 'blocked-by-system';
}
