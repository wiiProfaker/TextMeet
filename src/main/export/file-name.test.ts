import { describe, expect, it } from 'vitest';
import { exportFileName } from './file-name';

describe('exportFileName', () => {
  it('names the file after the meeting', () => {
    expect(exportFileName('Созвон с Ириной', 'docx')).toBe('Созвон с Ириной.docx');
  });

  it('replaces characters that Windows and macOS do not allow in names', () => {
    expect(exportFileName('План: Q4 / бюджет? "черновик" <v2>|*', 'txt')).toBe('План Q4 бюджет черновик v2.txt');
    expect(exportFileName('Отчёт\\итоги', 'docx')).toBe('Отчёт итоги.docx');
    expect(exportFileName('a\u0000b\tc\nd', 'txt')).toBe('a b c d.txt');
  });

  it('removes dots and spaces at the ends', () => {
    expect(exportFileName('  ..Итоги...  ', 'txt')).toBe('Итоги.txt');
  });

  it('keeps reserved Windows names from turning into devices', () => {
    expect(exportFileName('CON', 'txt')).toBe('_CON.txt');
    expect(exportFileName('com1', 'docx')).toBe('_com1.docx');
    expect(exportFileName('con.report', 'docx')).toBe('_con.report.docx');
    expect(exportFileName('Console', 'txt')).toBe('Console.txt');
  });

  it('shortens a long title without cutting a letter in half', () => {
    expect(exportFileName('Итоги '.repeat(40), 'txt')).toBe(`${'Итоги '.repeat(20).trim()}.txt`);
    // macOS разрешает 255 байт UTF-8 на имя: эмодзи — 4 байта.
    const name = exportFileName('😀'.repeat(200), 'txt');
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(255);
    expect(name).toBe(`${'😀'.repeat(62)}.txt`);
  });

  it('keeps a long CJK title within 255 bytes for macOS', () => {
    const name = exportFileName('会议记录'.repeat(40), 'docx');
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(255);
    expect(name).toBe(`${'会议记录'.repeat(40).slice(0, 83)}.docx`);
  });

  it('falls back to «Встреча» when nothing is left', () => {
    expect(exportFileName('???', 'docx')).toBe('Встреча.docx');
    expect(exportFileName(' . ', 'txt')).toBe('Встреча.txt');
  });
});
