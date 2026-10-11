import { describe, expect, it } from 'vitest';
import { exportFileName } from './file-name';

describe('exportFileName', () => {
  it('names the file after the meeting', () => {
    expect(exportFileName('Созвон с Ириной', 'docx')).toBe('Созвон с Ириной.docx');
  });

  it('replaces characters that Windows and macOS do not allow in names', () => {
    expect(exportFileName('План: Q4 / бюджет? "черновик" <v2>|*', 'txt')).toBe('План Q4 бюджет черновик v2.txt');
    expect(exportFileName('a\u0000b\tc\nd', 'txt')).toBe('a b c d.txt');
  });

  it('removes dots and spaces at the ends', () => {
    expect(exportFileName('  ..Итоги...  ', 'txt')).toBe('Итоги.txt');
  });

  it('keeps reserved Windows names from turning into devices', () => {
    expect(exportFileName('CON', 'txt')).toBe('CON_.txt');
    expect(exportFileName('com1', 'docx')).toBe('com1_.docx');
    expect(exportFileName('Console', 'txt')).toBe('Console.txt');
  });

  it('shortens a long title without cutting a letter in half', () => {
    const name = exportFileName('😀'.repeat(200), 'txt');
    expect(Array.from(name.replace(/\.txt$/, ''))).toHaveLength(120);
    expect(name).toBe(`${'😀'.repeat(120)}.txt`);
  });

  it('falls back to «Встреча» when nothing is left', () => {
    expect(exportFileName('???', 'docx')).toBe('Встреча.docx');
    expect(exportFileName(' . ', 'txt')).toBe('Встреча.txt');
  });
});
