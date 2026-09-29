import type { KeyboardEvent, MenuItem, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu } from './tray-menu';

const actions = () => ({ openWindow: vi.fn(), toggleRecording: vi.fn(), quit: vi.fn() });
const labels = (items: MenuItemConstructorOptions[]) => items.map((i) => i.label ?? i.type);
const find = (items: MenuItemConstructorOptions[], label: string) => items.find((i) => i.label === label);
const click = (items: MenuItemConstructorOptions[], label: string) =>
  find(items, label)?.click?.({} as MenuItem, undefined, {} as KeyboardEvent);

describe('buildTrayMenu', () => {
  it('offers to start a recording when idle', () => {
    const a = actions();
    const items = buildTrayMenu(a, { phase: 'idle', hotkey: 'Control+Space' });
    expect(labels(items)).toEqual(['Начать запись', 'Открыть TextMeet', 'separator', 'Выход']);
    expect(find(items, 'Начать запись')).toMatchObject({
      accelerator: 'Control+Space',
      registerAccelerator: false,
      enabled: true,
    });

    click(items, 'Начать запись');
    click(items, 'Открыть TextMeet');
    click(items, 'Выход');
    expect(a.toggleRecording).toHaveBeenCalledOnce();
    expect(a.openWindow).toHaveBeenCalledOnce();
    expect(a.quit).toHaveBeenCalledOnce();
  });

  it('shows the recording and offers to stop it', () => {
    const items = buildTrayMenu(actions(), { phase: 'recording', hotkey: 'Alt+Space' });
    expect(labels(items)).toEqual(['● Идёт запись', 'Остановить запись', 'Открыть TextMeet', 'separator', 'Выход']);
    expect(find(items, '● Идёт запись')?.enabled).toBe(false);
    expect(find(items, 'Остановить запись')?.enabled).toBe(true);
  });

  it('disables the record item while starting or stopping', () => {
    expect(find(buildTrayMenu(actions(), { phase: 'starting', hotkey: 'F9' }), 'Начать запись')?.enabled).toBe(false);
    expect(find(buildTrayMenu(actions(), { phase: 'stopping', hotkey: 'F9' }), 'Остановить запись')?.enabled).toBe(false);
  });
});
