import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import type { Logger } from '../logger';
import { createSettingsStore, loadSettings } from './settings-store';
import { makeTempDir } from '../../test-support/temp-dir';

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn(async () => undefined) };
}
const tempDir = () => makeTempDir('textmeet-settings-');

describe('loadSettings', () => {
  it('returns defaults when the file is missing', async () => {
    expect(await loadSettings(join(tempDir(), 'settings.json'), fakeLogger())).toEqual(DEFAULT_SETTINGS);
  });

  it('reads a valid file and fills new fields with defaults', async () => {
    const file = join(tempDir(), 'settings.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, libraryDir: 'D:\\Lib' }));
    expect(await loadSettings(file, fakeLogger())).toEqual({ ...DEFAULT_SETTINGS, libraryDir: 'D:\\Lib' });
  });

  it('moves a broken file aside, warns and returns defaults', async () => {
    const dir = tempDir();
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{oops');
    const logger = fakeLogger();
    const settings = await loadSettings(file, logger, () => new Date(1000));
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(readdirSync(dir)).toEqual(['settings.json.broken-1000']);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('logs an error when the broken file cannot be moved', async () => {
    const dir = tempDir();
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{oops');
    // Имя копии занято непустой папкой — переименование файла поверх неё упадёт.
    const backup = `${file}.broken-1000`;
    mkdirSync(backup);
    writeFileSync(join(backup, 'keep'), 'x');
    const logger = fakeLogger();
    expect(await loadSettings(file, logger, () => new Date(1000))).toEqual(DEFAULT_SETTINGS);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

describe('createSettingsStore', () => {
  it('updates, persists and returns the new settings', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    const next = await store.update({ launchAtLogin: false });
    expect(next.launchAtLogin).toBe(false);
    expect(store.get()).toEqual(next);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(next);
  });

  it('applies concurrent updates in order without losing any', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    await Promise.all([store.update({ launchAtLogin: false }), store.update({ libraryDir: 'D:\\A' })]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      ...DEFAULT_SETTINGS,
      libraryDir: 'D:\\A',
      launchAtLogin: false,
    });
  });

  it('rejects invalid values and keeps the old ones', async () => {
    const file = join(tempDir(), 'settings.json');
    const store = await createSettingsStore(file, fakeLogger());
    await expect(store.update({ libraryDir: '' })).rejects.toThrow();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    await expect(store.update({ launchAtLogin: false })).resolves.toMatchObject({ launchAtLogin: false });
  });
});
