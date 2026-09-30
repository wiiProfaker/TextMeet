import { isAbsolute, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT, fixturePath, MODELS_ROOT } from './model-fixtures';

const inside = (dir: string, path: string): boolean => {
  const rel = relative(dir, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

describe('model fixtures', () => {
  it('keeps the test recordings out of the models folder of the app', () => {
    expect(inside(MODELS_ROOT, FIXTURES_ROOT)).toBe(false);
    expect(inside(FIXTURES_ROOT, MODELS_ROOT)).toBe(false);
    expect(inside(FIXTURES_ROOT, fixturePath('gigaamExample'))).toBe(true);
    expect(inside(MODELS_ROOT, fixturePath('fourSpeakers'))).toBe(false);
  });
});
