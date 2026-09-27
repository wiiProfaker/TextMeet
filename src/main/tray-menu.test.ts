import type { KeyboardEvent, MenuItem } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenu } from './tray-menu';

describe('buildTrayMenu', () => {
  it('has open and quit items that call the actions', () => {
    const actions = { openWindow: vi.fn(), quit: vi.fn() };
    const items = buildTrayMenu(actions);
    expect(items.map((i) => i.label ?? i.type)).toEqual(['Открыть TextMeet', 'separator', 'Выход']);

    const click = (label: string) =>
      items.find((i) => i.label === label)?.click?.({} as MenuItem, undefined, {} as KeyboardEvent);
    click('Открыть TextMeet');
    click('Выход');
    expect(actions.openWindow).toHaveBeenCalledOnce();
    expect(actions.quit).toHaveBeenCalledOnce();
  });
});
