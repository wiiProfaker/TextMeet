import { describe, expect, it } from 'vitest';
import { errorText } from './errors';

describe('errorText', () => {
  it('strips the Electron IPC wrapper', () => {
    const err = new Error("Error invoking remote method 'library:list': Error: Нет доступа к папке");
    expect(errorText(err)).toBe('Нет доступа к папке');
  });

  it('strips typed error names too', () => {
    const err = new Error("Error invoking remote method 'x': RangeError: Неверный id");
    expect(errorText(err)).toBe('Неверный id');
  });

  it('keeps ordinary messages and handles non-errors', () => {
    expect(errorText(new Error('Сбой'))).toBe('Сбой');
    expect(errorText('строка')).toBe('строка');
    expect(errorText(new Error(''))).toBe('Неизвестная ошибка');
  });
});
