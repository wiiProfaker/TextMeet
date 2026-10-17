// Список чужих частей программы (licenses/third-party.json, решения Плана 8, §4.3): всё, что входит в программу и
// скачивается в неё, — с лицензией. Тест следит, чтобы новая модель или зависимость не осталась без записи.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_GROUP_IDS } from '../models/registry';

interface Entry {
  name: string;
  author: string;
  license: string;
  url: string;
  kind: 'bundled' | 'downloaded';
  models?: string[];
  licenseFile?: string;
}

const root = join(__dirname, '..', '..', '..');
const entries = JSON.parse(readFileSync(join(root, 'licenses', 'third-party.json'), 'utf8')) as Entry[];
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };

describe('third-party licenses', () => {
  it('every model a person can download has a license entry', () => {
    for (const id of MODEL_GROUP_IDS) {
      expect(
        entries.some((e) => e.kind === 'downloaded' && e.models?.includes(id)),
        id,
      ).toBe(true);
    }
  });

  it('every runtime part of the app has a license entry', () => {
    const required = [
      ...Object.keys(pkg.dependencies),
      'electron',
      'react',
      'react-dom',
      '@fontsource/golos-text',
      '@fontsource/literata',
      'llama.cpp',
      'ffmpeg',
    ];
    for (const name of required) expect(entries.some((e) => e.kind === 'bundled' && e.name === name), name).toBe(true);
  });

  it('license files named in the list exist', () => {
    for (const e of entries) {
      // vendor/ скачивается (npm run fetch:llama), node_modules/ ставит npm ci.
      if (!e.licenseFile || e.licenseFile.startsWith('vendor/')) continue;
      expect(existsSync(join(root, e.licenseFile)), e.licenseFile).toBe(true);
    }
  });

  it('every entry says who made it, under which license and where it comes from', () => {
    for (const e of entries) {
      expect(e.name.trim(), JSON.stringify(e)).not.toBe('');
      expect(e.author.trim(), e.name).not.toBe('');
      expect(e.license.trim(), e.name).not.toBe('');
      expect(e.url, e.name).toMatch(/^https:\/\//);
    }
  });
});
