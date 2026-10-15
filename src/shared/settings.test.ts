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
      asrModel: 'gigaam-v3-e2e-rnnt',
      exportDir: null,
      aiPrompt: null,
      aiModel: null,
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

  it('keeps the chosen transcription model', () => {
    expect(SettingsSchema.parse({ asrModel: 'parakeet-tdt-0.6b-v3' }).asrModel).toBe('parakeet-tdt-0.6b-v3');
  });

  it('reads an unknown or broken model as the default one without dropping the other settings', () => {
    const parsed = SettingsSchema.parse({ asrModel: 'whisper-tiny', recordSounds: false });
    expect(parsed).toMatchObject({ asrModel: 'gigaam-v3-e2e-rnnt', recordSounds: false });
    expect(SettingsSchema.parse({ asrModel: 42 }).asrModel).toBe('gigaam-v3-e2e-rnnt');
  });

  it('keeps the folder of the last export', () => {
    expect(SettingsSchema.parse({ exportDir: '/Users/kirill/Documents' }).exportDir).toBe('/Users/kirill/Documents');
  });

  it('forgets a broken export folder without dropping the other settings', () => {
    expect(SettingsSchema.parse({ exportDir: '', recordSounds: false })).toMatchObject({ exportDir: null, recordSounds: false });
    expect(SettingsSchema.parse({ exportDir: 42 }).exportDir).toBeNull();
  });

  it('keeps an own AI prompt and an empty one', () => {
    expect(SettingsSchema.parse({ aiPrompt: 'Кратко: о чём договорились?' }).aiPrompt).toBe('Кратко: о чём договорились?');
    expect(SettingsSchema.parse({ aiPrompt: '' }).aiPrompt).toBe('');
  });

  it('forgets a broken AI prompt without dropping the other settings', () => {
    expect(SettingsSchema.parse({ aiPrompt: 42, recordSounds: false })).toMatchObject({ aiPrompt: null, recordSounds: false });
    expect(SettingsSchema.parse({ aiPrompt: 'я'.repeat(4001) }).aiPrompt).toBeNull();
  });

  it('rejects wrong types and empty values', () => {
    expect(SettingsSchema.safeParse({ launchAtLogin: 'yes' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ libraryDir: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ schemaVersion: 2 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ microphoneId: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordHotkey: '' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ recordSounds: 1 }).success).toBe(false);
  });

  it('keeps the model for summaries and forgets an unknown or broken one', () => {
    expect(SettingsSchema.parse({ aiModel: 'qwen3.5-4b' }).aiModel).toBe('qwen3.5-4b');
    expect(SettingsSchema.parse({ aiModel: 'llama-70b', recordSounds: false })).toMatchObject({ aiModel: null, recordSounds: false });
    expect(SettingsSchema.parse({ aiModel: 7 }).aiModel).toBeNull();
  });
});
