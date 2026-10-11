import { describe, expect, it } from 'vitest';
import { importFailedText, importResultText, importView } from './import-format';

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
      'Добавлено 1 файл из 2. Не удалось добавить «отчёт.pdf»: в файле нет звука.',
    );
  });

  it('lists three failures and counts the rest', () => {
    const failed = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: `${n}.mp3`, reason: 'файл пустой' }));
    expect(importResultText({ added: [], failed })).toBe(
      'Не удалось добавить «a.mp3»: файл пустой; «b.mp3»: файл пустой; «c.mp3»: файл пустой и ещё 3 файла.',
    );
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
