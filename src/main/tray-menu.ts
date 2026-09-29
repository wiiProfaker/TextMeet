import type { MenuItemConstructorOptions } from 'electron';
import type { RecordingPhase } from '../shared/recording';

export interface TrayActions {
  openWindow(): void;
  toggleRecording(): void;
  quit(): void;
}

export interface TrayMenuState {
  phase: RecordingPhase;
  /** Горячая клавиша (accelerator) — показывается рядом с пунктом записи. */
  hotkey: string;
}

export function buildTrayMenu(actions: TrayActions, state: TrayMenuState): MenuItemConstructorOptions[] {
  const recording = state.phase === 'recording' || state.phase === 'stopping';
  const record: MenuItemConstructorOptions = {
    label: recording ? 'Остановить запись' : 'Начать запись',
    // Клавиша регистрируется глобально (hotkey-manager), в меню она только подсказка.
    accelerator: state.hotkey,
    registerAccelerator: false,
    enabled: state.phase === 'idle' || state.phase === 'recording',
    click: () => actions.toggleRecording(),
  };
  return [
    ...(recording ? [{ label: '● Идёт запись', enabled: false } satisfies MenuItemConstructorOptions] : []),
    record,
    { label: 'Открыть TextMeet', click: () => actions.openWindow() },
    { type: 'separator' },
    { label: 'Выход', click: () => actions.quit() },
  ];
}
