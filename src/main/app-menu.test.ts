import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { macMenuTemplate } from './app-menu';

const roles = (items: MenuItemConstructorOptions[]): string[] =>
  items.flatMap((item) => [
    ...(item.role ? [item.role] : []),
    ...(Array.isArray(item.submenu) ? roles(item.submenu) : []),
  ]);

describe('macMenuTemplate', () => {
  it('has the app, edit and window menus', () => {
    expect(macMenuTemplate().map((m) => m.label)).toEqual(['TextMeet', 'Правка', 'Окно']);
  });

  it('keeps copy and paste and quitting', () => {
    expect(roles(macMenuTemplate())).toEqual(
      expect.arrayContaining(['copy', 'paste', 'selectAll', 'quit', 'close']),
    );
  });

  it('has no reload and no developer tools', () => {
    const all = roles(macMenuTemplate());
    for (const role of ['reload', 'forceReload', 'toggleDevTools', 'viewMenu']) expect(all).not.toContain(role);
  });
});
