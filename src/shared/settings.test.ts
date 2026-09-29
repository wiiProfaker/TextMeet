import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings';

describe('SettingsSchema', () => {
  it('fills defaults for an empty object', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      schemaVersion: 1,
      libraryDir: null,
      launchAtLogin: true,
      microphoneId: null,
      recordHotkey: null,
      recordSounds: true,
    });
  });

  it('reads a settings file written by the previous version', () => {
    const parsed = SettingsSchema.parse({ schemaVersion: 1, libraryDir: 'D:\\Встречи', launchAtLogin: false });
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, libraryDir: 'D:\\Встречи', launchAtLogin: false });
  });

  it('keeps recording settings', () => {
    const parsed = SettingsSchema.parse({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
    expect(parsed).toMatchObject({ microphoneId: 'abc', recordHotkey: 'Control+Alt+R', recordSounds: false });
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ microphoneId: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });
});
