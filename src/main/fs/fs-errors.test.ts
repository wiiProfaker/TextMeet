import { describe, expect, it } from 'vitest';
import { fsErrorReason, humanFsError } from './fs-errors';

const withCode = (code: string): NodeJS.ErrnoException => Object.assign(new Error(`${code}: raw`), { code });

describe('fsErrorReason', () => {
  it.each([
    ['EACCES', 'нет прав на эту папку'],
    ['EPERM', 'нет прав на эту папку'],
    ['ENOSPC', 'на диске закончилось место'],
    ['EBUSY', 'файл занят другой программой'],
    ['ENOENT', 'папка не найдена'],
    ['EROFS', 'диск доступен только для чтения'],
  ])('%s → %s', (code, reason) => {
    expect(fsErrorReason(withCode(code))).toBe(reason);
  });

  it('falls back to the error text for unknown codes and non-errors', () => {
    expect(fsErrorReason(withCode('EWHATEVER'))).toBe('EWHATEVER: raw');
    expect(fsErrorReason('строка')).toBe('строка');
    expect(fsErrorReason(null)).toBe('null');
  });
});

describe('humanFsError', () => {
  it('prefixes the action and keeps the original error as the cause', () => {
    const original = withCode('EACCES');
    const err = humanFsError('Не удалось открыть папку', original);
    expect(err.message).toBe('Не удалось открыть папку: нет прав на эту папку');
    expect(err.cause).toBe(original);
  });

  it('shows no system text or path for an unknown code; the full error stays in the cause', () => {
    const original = Object.assign(new Error("UNKNOWN: unknown error, open 'C:/Users/Ирина/Library/meeting.json'"), {
      code: 'UNKNOWN',
    });
    const err = humanFsError('Не удалось сохранить правку', original);
    expect(err.message).toBe('Не удалось сохранить правку: файл занят или недоступен');
    expect(err.message).not.toMatch(/UNKNOWN|Users|meeting\.json/);
    expect(err.cause).toBe(original);
  });
});
