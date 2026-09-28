// Горячая клавиша записи: разбор нажатия в формат Electron (accelerator), правила и показ человеку.
// Здесь нет ни Electron, ни DOM: модуль нужен и main (проверка), и окну настроек (ввод).

export const DEFAULT_HOTKEY_WINDOWS = 'Control+Space';
export const DEFAULT_HOTKEY_MAC = 'Alt+Space';

export function defaultHotkey(platform: string): string {
  return platform === 'darwin' ? DEFAULT_HOTKEY_MAC : DEFAULT_HOTKEY_WINDOWS;
}

/** Нужные поля KeyboardEvent. */
export interface KeyInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type HotkeyResult =
  /** Пока нажаты только модификаторы — ждём клавишу. */
  | { kind: 'pending' }
  /** Esc без модификаторов — отмена ввода. */
  | { kind: 'cancel' }
  | { kind: 'ok'; accelerator: string }
  | { kind: 'rejected'; message: string };

type Modifier = 'Control' | 'Alt' | 'Shift' | 'Super' | 'Command';
const MODIFIER_ORDER: readonly Modifier[] = ['Control', 'Alt', 'Shift', 'Super', 'Command'];
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};
const NAMED_KEY_NAMES = new Set(Object.values(NAMED_KEYS));

const isFunctionKey = (key: string): boolean => /^F([1-9]|1\d|2[0-4])$/.test(key);

/** KeyboardEvent.code → имя клавиши в accelerator; null — клавиша не поддерживается. */
export function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? null;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] ?? null;
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return `num${numpad[1]}`;
  if (isFunctionKey(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

function isSupportedKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || /^num\d$/.test(key) || isFunctionKey(key) || NAMED_KEY_NAMES.has(key);
}

const isMac = (platform: string): boolean => platform === 'darwin';

function modifierWords(platform: string): string {
  return isMac(platform) ? 'Control, Option или Command' : 'Ctrl, Alt или Win';
}

export function needsModifierMessage(platform: string): string {
  return (
    `Одну клавишу без ${modifierWords(platform)} назначить нельзя — она мешала бы печатать. ` +
    `Подойдёт ${modifierWords(platform)} вместе с клавишей или одна из F1–F24.`
  );
}

export function shiftOnlyMessage(platform: string): string {
  return (
    'Shift с этой клавишей нужен для обычной работы — заглавные буквы, знаки, выделение текста. ' +
    `Добавьте ${modifierWords(platform)}.`
  );
}

export const UNSUPPORTED_KEY_MESSAGE = 'Эту клавишу назначить нельзя. Подойдут буквы, цифры, пробел, стрелки и F1–F24.';

/** Проверка правил для уже разобранной комбинации. */
function checkRules(modifiers: ReadonlySet<Modifier>, key: string, platform: string): string | null {
  if (isFunctionKey(key)) return null;
  const hasStrong = modifiers.has('Control') || modifiers.has('Alt') || modifiers.has('Super') || modifiers.has('Command');
  if (hasStrong) return null;
  return modifiers.has('Shift') ? shiftOnlyMessage(platform) : needsModifierMessage(platform);
}

function buildAccelerator(modifiers: ReadonlySet<Modifier>, key: string): string {
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join('+');
}

/** Нажатие в поле «Горячая клавиша» → accelerator или объяснение, почему нельзя. */
export function hotkeyFromKey(input: KeyInput, platform: string): HotkeyResult {
  if (MODIFIER_CODES.has(input.code)) return { kind: 'pending' };
  const modifiers = new Set<Modifier>();
  if (input.ctrlKey) modifiers.add('Control');
  if (input.altKey) modifiers.add('Alt');
  if (input.shiftKey) modifiers.add('Shift');
  if (input.metaKey) modifiers.add(isMac(platform) ? 'Command' : 'Super');
  if (input.code === 'Escape' && modifiers.size === 0) return { kind: 'cancel' };

  const key = keyName(input.code);
  if (key === null) return { kind: 'rejected', message: UNSUPPORTED_KEY_MESSAGE };
  const problem = checkRules(modifiers, key, platform);
  if (problem) return { kind: 'rejected', message: problem };
  return { kind: 'ok', accelerator: buildAccelerator(modifiers, key) };
}

/** Проверка значения, пришедшего из окна или из settings.json. */
export function checkAccelerator(accelerator: string, platform: string): { ok: true } | { ok: false; message: string } {
  const parts = accelerator.split('+');
  const key = parts.pop() ?? '';
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    if (!(MODIFIER_ORDER as readonly string[]).includes(part) || modifiers.has(part as Modifier)) {
      return { ok: false, message: UNSUPPORTED_KEY_MESSAGE };
    }
    modifiers.add(part as Modifier);
  }
  if (!isSupportedKey(key)) return { ok: false, message: UNSUPPORTED_KEY_MESSAGE };
  const problem = checkRules(modifiers, key, platform);
  return problem ? { ok: false, message: problem } : { ok: true };
}

const WINDOWS_MODIFIER_LABELS: Record<Modifier, string> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Super: 'Win',
  Command: 'Win',
};
const MAC_MODIFIER_LABELS: Record<Modifier, string> = {
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Super: '⌘',
  Command: '⌘',
};
const KEY_LABELS: Record<string, string> = { Up: '↑', Down: '↓', Left: '←', Right: '→' };

function keyLabel(key: string): string {
  const numpad = /^num(\d)$/.exec(key);
  if (numpad) return `Num ${numpad[1]}`;
  return KEY_LABELS[key] ?? key;
}

/** «Control+Space» → «Ctrl+Space» (Windows) или «⌃ Space» (Mac). */
export function formatHotkey(accelerator: string, platform: string): string {
  const parts = accelerator.split('+');
  const key = keyLabel(parts.pop() ?? '');
  const modifiers = parts.map((p) => {
    const labels = isMac(platform) ? MAC_MODIFIER_LABELS : WINDOWS_MODIFIER_LABELS;
    return labels[p as Modifier] ?? p;
  });
  if (isMac(platform)) return modifiers.length > 0 ? `${modifiers.join('')} ${key}` : key;
  return [...modifiers, key].join('+');
}
