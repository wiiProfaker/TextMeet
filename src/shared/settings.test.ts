import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsSchema } from './settings';

describe('SettingsSchema', () => {
  it('fills defaults for an empty object', () => {
    expect(DEFAULT_SETTINGS).toEqual({ schemaVersion: 1, libraryDir: null, launchAtLogin: true });
  });

  it('keeps provided values', () => {
    const parsed = SettingsSchema.parse({ libraryDir: 'D:\\Встречи', launchAtLogin: false });
    expect(parsed).toEqual({ schemaVersion: 1, libraryDir: 'D:\\Встречи', launchAtLogin: false });
  });

  it('rejects wrong types and empty paths', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
  });
});
