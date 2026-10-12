import { menuFocusStep } from './menu-keys';

/** Вкладки настроек по порядку (просьба пользователя 2026-10-12: разделы, а не всё на одной странице). */
export const SETTINGS_TABS = [
  { id: 'record', label: 'Запись' },
  { id: 'transcription', label: 'Расшифровка' },
  { id: 'ai', label: 'ИИ' },
  { id: 'general', label: 'Общие' },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

/** Вкладка при первом открытии настроек после запуска. */
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'record';

/** Вкладка после клавиши в строке вкладок: ←/→ — по кругу, Home/End — первая и последняя; другая клавиша — null. */
export function tabAfterKey(current: SettingsTab, key: string): SettingsTab | null {
  const at = SETTINGS_TABS.findIndex((t) => t.id === current);
  let next: number;
  if (key === 'ArrowRight') next = menuFocusStep(at, SETTINGS_TABS.length, 1);
  else if (key === 'ArrowLeft') next = menuFocusStep(at, SETTINGS_TABS.length, -1);
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = SETTINGS_TABS.length - 1;
  else return null;
  return SETTINGS_TABS[next]?.id ?? null;
}
