import type { MenuItemConstructorOptions } from 'electron';

export interface TrayActions {
  openWindow(): void;
  quit(): void;
}

// Пункты «Начать/Остановить запись» добавит План 2.
export function buildTrayMenu(actions: TrayActions): MenuItemConstructorOptions[] {
  return [
    { label: 'Открыть TextMeet', click: () => actions.openWindow() },
    { type: 'separator' },
    { label: 'Выход', click: () => actions.quit() },
  ];
}
