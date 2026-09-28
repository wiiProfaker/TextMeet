import { describe, expect, it } from 'vitest';
import {
  checkAccelerator,
  defaultHotkey,
  formatHotkey,
  hotkeyFromKey,
  keyName,
  needsModifierMessage,
  shiftOnlyMessage,
  UNSUPPORTED_KEY_MESSAGE,
  type KeyInput,
} from './hotkey';

const key = (code: string, mods: Partial<Omit<KeyInput, 'code'>> = {}): KeyInput => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('defaultHotkey', () => {
  it('is Ctrl+Space on Windows and Option+Space on macOS', () => {
    expect(defaultHotkey('win32')).toBe('Control+Space');
    expect(defaultHotkey('darwin')).toBe('Alt+Space');
    expect(defaultHotkey('linux')).toBe('Control+Space');
  });
});

describe('keyName', () => {
  it.each([
    ['KeyR', 'R'],
    ['Digit7', '7'],
    ['Numpad3', 'num3'],
    ['F1', 'F1'],
    ['F24', 'F24'],
    ['Space', 'Space'],
    ['NumpadEnter', 'Enter'],
    ['ArrowUp', 'Up'],
    ['PageDown', 'PageDown'],
  ])('%s → %s', (code, name) => {
    expect(keyName(code)).toBe(name);
  });

  it.each(['F25', 'Minus', 'CapsLock', 'IntlBackslash', 'MediaPlayPause'])('does not support %s', (code) => {
    expect(keyName(code)).toBeNull();
  });
});

describe('hotkeyFromKey', () => {
  it('waits while only modifiers are held', () => {
    expect(hotkeyFromKey(key('ControlLeft', { ctrlKey: true }), 'win32')).toEqual({ kind: 'pending' });
    expect(hotkeyFromKey(key('MetaRight', { metaKey: true }), 'darwin')).toEqual({ kind: 'pending' });
  });

  it('cancels on a bare Escape', () => {
    expect(hotkeyFromKey(key('Escape'), 'win32')).toEqual({ kind: 'cancel' });
  });

  it('builds accelerators with modifiers in a fixed order', () => {
    expect(hotkeyFromKey(key('Space', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'ok',
      accelerator: 'Control+Space',
    });
    expect(hotkeyFromKey(key('KeyR', { shiftKey: true, altKey: true, ctrlKey: true }), 'win32')).toEqual({
      kind: 'ok',
      accelerator: 'Control+Alt+Shift+R',
    });
  });

  it('maps the Win key to Super and the Mac Command key to Command', () => {
    expect(hotkeyFromKey(key('KeyM', { metaKey: true }), 'win32')).toEqual({ kind: 'ok', accelerator: 'Super+M' });
    expect(hotkeyFromKey(key('KeyM', { metaKey: true }), 'darwin')).toEqual({ kind: 'ok', accelerator: 'Command+M' });
  });

  it('accepts a function key alone or with Shift', () => {
    expect(hotkeyFromKey(key('F9'), 'win32')).toEqual({ kind: 'ok', accelerator: 'F9' });
    expect(hotkeyFromKey(key('F9', { shiftKey: true }), 'win32')).toEqual({ kind: 'ok', accelerator: 'Shift+F9' });
  });

  it.each(['KeyR', 'Digit1', 'Space', 'Enter', 'Tab', 'Escape'])('rejects %s without a modifier', (code) => {
    // Escape с Shift — тоже не отмена, а отказ по правилу.
    const input = code === 'Escape' ? key(code, { shiftKey: true }) : key(code);
    const result = hotkeyFromKey(input, 'win32');
    expect(result.kind).toBe('rejected');
  });

  it('explains why a single key is not allowed, in platform words', () => {
    expect(hotkeyFromKey(key('KeyR'), 'win32')).toEqual({ kind: 'rejected', message: needsModifierMessage('win32') });
    expect(needsModifierMessage('win32')).toContain('Ctrl, Alt или Win');
    expect(needsModifierMessage('darwin')).toContain('Control, Option или Command');
  });

  it('rejects Shift with a letter — it is just a capital letter', () => {
    expect(hotkeyFromKey(key('KeyR', { shiftKey: true }), 'win32')).toEqual({
      kind: 'rejected',
      message: shiftOnlyMessage('win32'),
    });
  });

  it('rejects keys it cannot register', () => {
    expect(hotkeyFromKey(key('Minus', { ctrlKey: true }), 'win32')).toEqual({
      kind: 'rejected',
      message: UNSUPPORTED_KEY_MESSAGE,
    });
  });
});

describe('checkAccelerator', () => {
  it.each(['Control+Space', 'Alt+Space', 'Control+Alt+Shift+R', 'F12', 'Shift+F3', 'Super+num5', 'Command+Up'])(
    'accepts %s',
    (accelerator) => {
      expect(checkAccelerator(accelerator, 'win32')).toEqual({ ok: true });
    },
  );

  it.each([
    ['R', needsModifierMessage('win32')],
    ['Shift+R', shiftOnlyMessage('win32')],
    ['Control+Plus', UNSUPPORTED_KEY_MESSAGE],
    ['Ctrl+Space', UNSUPPORTED_KEY_MESSAGE],
    ['Control+Control+Space', UNSUPPORTED_KEY_MESSAGE],
    ['', UNSUPPORTED_KEY_MESSAGE],
  ])('rejects %s', (accelerator, message) => {
    expect(checkAccelerator(accelerator, 'win32')).toEqual({ ok: false, message });
  });
});

describe('formatHotkey', () => {
  it('shows Windows combinations with plus signs', () => {
    expect(formatHotkey('Control+Space', 'win32')).toBe('Ctrl+Space');
    expect(formatHotkey('Control+Alt+Shift+Super+R', 'win32')).toBe('Ctrl+Alt+Shift+Win+R');
    expect(formatHotkey('F9', 'win32')).toBe('F9');
    expect(formatHotkey('Control+num4', 'win32')).toBe('Ctrl+Num 4');
  });

  it('shows Mac combinations with symbols', () => {
    expect(formatHotkey('Alt+Space', 'darwin')).toBe('⌥ Space');
    expect(formatHotkey('Control+Alt+Shift+Command+Up', 'darwin')).toBe('⌃⌥⇧⌘ ↑');
    expect(formatHotkey('F5', 'darwin')).toBe('F5');
  });
});
