import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLibraryDir } from './paths';

describe('resolveLibraryDir', () => {
  it('uses the folder from settings', () => {
    expect(resolveLibraryDir('D:\\Встречи', 'C:\\Users\\me')).toBe('D:\\Встречи');
  });

  it('falls back to TextMeet in the home folder', () => {
    expect(resolveLibraryDir(null, join('home', 'me'))).toBe(join('home', 'me', 'TextMeet'));
  });
});
