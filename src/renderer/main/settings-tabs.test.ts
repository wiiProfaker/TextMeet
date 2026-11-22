import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, tabAfterKey } from './settings-tabs';

describe('SETTINGS_TABS', () => {
  it('lists the sections in order, the first one opens by default', () => {
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual(['Запись', 'Расшифровка', 'ИИ', 'Общие']);
    expect(DEFAULT_SETTINGS_TAB).toBe('record');
  });
});

describe('tabAfterKey with modifiers', () => {
  it('arrows with Alt, Ctrl or Cmd do not switch tabs', () => {
    expect(tabAfterKey('record', 'ArrowRight', { alt: true, ctrl: false, meta: false })).toBeNull();
    expect(tabAfterKey('record', 'ArrowLeft', { alt: false, ctrl: true, meta: false })).toBeNull();
    expect(tabAfterKey('record', 'Home', { alt: false, ctrl: false, meta: true })).toBeNull();
    expect(tabAfterKey('record', 'ArrowRight', { alt: false, ctrl: false, meta: false })).toBe('transcription');
  });
});

describe('tabAfterKey', () => {
  it('goes right and left round the tabs', () => {
    expect(tabAfterKey('record', 'ArrowRight')).toBe('transcription');
    expect(tabAfterKey('general', 'ArrowRight')).toBe('record');
    expect(tabAfterKey('record', 'ArrowLeft')).toBe('general');
    expect(tabAfterKey('ai', 'ArrowLeft')).toBe('transcription');
  });

  it('goes to the first and the last tab with Home and End', () => {
    expect(tabAfterKey('ai', 'Home')).toBe('record');
    expect(tabAfterKey('transcription', 'End')).toBe('general');
  });

  it('ignores other keys', () => {
    expect(tabAfterKey('ai', 'ArrowDown')).toBeNull();
    expect(tabAfterKey('ai', 'Enter')).toBeNull();
  });
});
