import { describe, expect, it } from 'vitest';
import {
  NO_IMPORT_NOTES,
  importFailedText,
  importNotesText,
  importOutcome,
  importResultText,
  importView,
  withCopyFailure,
} from './import-format';

const noSound = { name: 'отчёт.pdf', reason: 'в файле нет звука' };

describe('importResultText', () => {
  it('says nothing when every file was added', () => {
    expect(importResultText({ added: ['a', 'b'], failed: [] })).toBeNull();
  });

  it('names the file and the reason', () => {
    expect(importResultText({ added: [], failed: [noSound] })).toBe('Не удалось добавить «отчёт.pdf»: в файле нет звука.');
  });

  it('first says how many were added', () => {
    expect(importResultText({ added: ['a', 'b'], failed: [noSound] })).toBe(
      'Добавлено 2 файла из 3. Не удалось добавить «отчёт.pdf»: в файле нет звука.',
    );
    expect(importResultText({ added: ['a'], failed: [noSound] })).toBe(
      'Добавлен 1 файл из 2. Не удалось добавить «отчёт.pdf»: в файле нет звука.',
    );
    const many = Array.from({ length: 21 }, (_, i) => String(i));
    expect(importResultText({ added: many, failed: [noSound] })).toMatch(/^Добавлен 21 файл из 22\. /);
    expect(importResultText({ added: many.slice(0, 5), failed: [noSound] })).toMatch(/^Добавлено 5 файлов из 6\. /);
  });

  it('lists three failures and counts the rest', () => {
    const failed = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: `${n}.mp3`, reason: 'файл пустой' }));
    expect(importResultText({ added: [], failed })).toBe(
      'Не удалось добавить «a.mp3»: файл пустой; «b.mp3»: файл пустой; «c.mp3»: файл пустой и ещё 3 файла.',
    );
  });
});

describe('importOutcome', () => {
  const noSpace = { meetingId: 'a', name: 'a.mp4', reason: 'на диске закончилось место' };
  const noSpaceText = 'Не удалось добавить «a.mp4»: на диске закончилось место.';
  const refused = 'Добавлено 2 файла из 3. Не удалось добавить «отчёт.pdf»: в файле нет звука.';

  it('opens the first added meeting and leaves the error line alone when every file was added', () => {
    const outcome = importOutcome({ added: ['a', 'b'], failed: [] }, NO_IMPORT_NOTES);
    expect(outcome.open).toBe('a');
    expect(outcome.message).toBeNull();
  });

  it('does not open a meeting whose sound could not be copied — it is already removed', () => {
    const notes = withCopyFailure(NO_IMPORT_NOTES, noSpace);
    expect(importOutcome({ added: ['a', 'b'], failed: [] }, notes).open).toBe('b');
    expect(importOutcome({ added: ['a'], failed: [] }, notes).open).toBeNull();
  });

  it('keeps a copy failure that came while the files were checked next to the refused files', () => {
    const outcome = importOutcome({ added: ['a', 'b'], failed: [noSound] }, withCopyFailure(NO_IMPORT_NOTES, noSpace));
    expect(outcome.message).toBe(`${refused} ${noSpaceText}`);
  });

  it('a copy failure after the result adds to it, and every failed copy is named', () => {
    const { notes } = importOutcome({ added: ['a', 'b'], failed: [noSound] }, NO_IMPORT_NOTES);
    const once = withCopyFailure(notes, noSpace);
    expect(importNotesText(once)).toBe(`${refused} ${noSpaceText}`);
    const twice = withCopyFailure(once, { meetingId: 'b', name: 'b.mp4', reason: 'файл повреждён' });
    expect(importNotesText(twice)).toBe(`${refused} ${noSpaceText} Не удалось добавить «b.mp4»: файл повреждён.`);
  });

  it('a later batch without refusals keeps the earlier refusal', () => {
    const first = importOutcome({ added: ['a', 'b'], failed: [noSound] }, NO_IMPORT_NOTES);
    const second = importOutcome({ added: ['c'], failed: [] }, first.notes);
    expect(second.message).toBeNull();
    expect(importNotesText(withCopyFailure(second.notes, noSpace))).toBe(`${refused} ${noSpaceText}`);
  });
});

describe('importFailedText', () => {
  it('names the file whose sound could not be copied', () => {
    expect(importFailedText({ name: 'Созвон.mp4', reason: 'на диске закончилось место' })).toBe(
      'Не удалось добавить «Созвон.mp4»: на диске закончилось место.',
    );
  });
});

describe('importView', () => {
  it('shows the share copied', () => {
    expect(importView('Созвон.mp4', { meetingId: 'a', fraction: 0.354, waiting: false })).toEqual({
      text: 'Копируем звук из файла',
      note: '«Созвон.mp4» · 35%',
      value: 35,
    });
  });

  it('shows no percentage when the duration is unknown or the progress has not come yet', () => {
    expect(importView('a.amr', { meetingId: 'a', fraction: null, waiting: false })).toEqual({
      text: 'Копируем звук из файла',
      note: '«a.amr»',
      value: null,
    });
    expect(importView('a.amr', null).value).toBeNull();
  });

  it('a file waiting for its turn', () => {
    expect(importView('b.mp4', { meetingId: 'b', fraction: null, waiting: true })).toEqual({
      text: 'Ждёт очереди',
      note: '«b.mp4» — сначала копируются файлы, добавленные раньше',
      value: null,
    });
  });
});
