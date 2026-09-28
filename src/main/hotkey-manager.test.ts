import { describe, expect, it, vi } from 'vitest';
import { needsModifierMessage } from '../shared/hotkey';
import { HotkeyManager, type ShortcutRegistry } from './hotkey-manager';

/** Поддельный globalShortcut: taken — комбинации, занятые «другими программами». */
function fakeRegistry(taken: string[] = []) {
  const active = new Map<string, () => void>();
  const registry: ShortcutRegistry = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (taken.includes(accelerator) || active.has(accelerator)) return false;
      active.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => {
      active.delete(accelerator);
    }),
  };
  return { registry, active, press: (accelerator: string) => active.get(accelerator)?.() };
}

describe('HotkeyManager', () => {
  it('registers the default combination for the platform', () => {
    const { registry, active } = fakeRegistry();
    const onPress = vi.fn();
    const manager = new HotkeyManager(registry, 'win32', onPress);

    expect(manager.init(null)).toEqual({ invalid: false });

    expect([...active.keys()]).toEqual(['Control+Space']);
    expect(manager.label).toBe('Ctrl+Space');
    expect(manager.isDefault).toBe(true);
    expect(manager.busy).toBe(false);
  });

  it('calls back when the combination is pressed', () => {
    const { registry, press } = fakeRegistry();
    const onPress = vi.fn();
    new HotkeyManager(registry, 'darwin', onPress).init(null);
    press('Alt+Space');
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('uses the saved combination', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init('Control+Alt+R');
    expect([...active.keys()]).toEqual(['Control+Alt+R']);
    expect(manager.isDefault).toBe(false);
  });

  it('falls back to the default when the saved value breaks the rules', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    expect(manager.init('R')).toEqual({ invalid: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('reports a combination taken by another program', () => {
    const { registry } = fakeRegistry(['Alt+Space']);
    const manager = new HotkeyManager(registry, 'darwin', vi.fn());
    manager.init(null);
    expect(manager.busy).toBe(true);
    expect(manager.label).toBe('⌥ Space');
  });

  it('treats an exception from Electron as a failed registration', () => {
    const registry: ShortcutRegistry = {
      register: () => {
        throw new Error('bad accelerator');
      },
      unregister: vi.fn(),
    };
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    expect(manager.busy).toBe(true);
  });

  it('switches to a new combination', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    expect(manager.change('Control+Shift+F9')).toEqual({ ok: true });

    expect([...active.keys()]).toEqual(['Control+Shift+F9']);
    expect(manager.accelerator).toBe('Control+Shift+F9');
  });

  it('keeps the old combination when the new one is taken', () => {
    const { registry, active } = fakeRegistry(['Control+Shift+R']);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    expect(manager.change('Control+Shift+R')).toEqual({
      ok: false,
      message: 'Ctrl+Shift+R занята другой программой. Осталась прежняя: Ctrl+Space.',
    });

    expect([...active.keys()]).toEqual(['Control+Space']);
    expect(manager.accelerator).toBe('Control+Space');
    expect(manager.busy).toBe(false);
  });

  it('refuses combinations that break the rules without touching the current one', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    expect(manager.change('R')).toEqual({ ok: false, message: needsModifierMessage('win32') });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('resets to the default with null', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init('F9');
    expect(manager.change(null)).toEqual({ ok: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('retries registering the same combination when it was busy', () => {
    const taken = ['Control+Space'];
    const { registry, active } = fakeRegistry(taken);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    taken.length = 0; // другая программа закрылась
    expect(manager.change('Control+Space')).toEqual({ ok: true });
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('releases the combination while a new one is being typed and restores it afterwards', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);

    manager.suspend(true);
    expect(active.size).toBe(0);
    expect(manager.busy).toBe(false);

    manager.suspend(false);
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('saves a change made while suspended and registers it on resume', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(true);
    expect(manager.change('F8')).toEqual({ ok: true });
    expect(active.size).toBe(0);
    manager.suspend(false);
    expect([...active.keys()]).toEqual(['F8']);
  });

  it('detects a taken combination even while suspended and keeps the old one', () => {
    const { registry, active } = fakeRegistry(['Control+Shift+R']);
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(true);

    expect(manager.change('Control+Shift+R')).toMatchObject({ ok: false });
    expect(active.size).toBe(0);
    expect(manager.accelerator).toBe('Control+Space');

    manager.suspend(false);
    expect([...active.keys()]).toEqual(['Control+Space']);
  });

  it('ignores repeated suspend calls and releases everything on dispose', () => {
    const { registry, active } = fakeRegistry();
    const manager = new HotkeyManager(registry, 'win32', vi.fn());
    manager.init(null);
    manager.suspend(false);
    expect(registry.register).toHaveBeenCalledTimes(1);
    manager.dispose();
    expect(active.size).toBe(0);
  });
});
