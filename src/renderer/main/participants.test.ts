import { describe, expect, it } from 'vitest';
import { choiceFor, EMPTY_CHOICE, readChoice } from './participants';

describe('participants choice', () => {
  it('reads a button, the «other» field or nothing', () => {
    expect(readChoice({ choice: 3, other: '' })).toBe(3);
    expect(readChoice({ choice: 3, other: ' 12 ' })).toBe(12);
    expect(readChoice({ choice: null, other: 'много' })).toBe('invalid');
    expect(readChoice({ choice: null, other: '51' })).toBe('invalid');
    expect(readChoice(EMPTY_CHOICE)).toBeNull();
  });

  it('shows an earlier answer as a button or in the «other» field', () => {
    expect(choiceFor(null)).toEqual(EMPTY_CHOICE);
    expect(choiceFor(4)).toEqual({ choice: 4, other: '' });
    expect(choiceFor(1)).toEqual({ choice: null, other: '1' });
    expect(choiceFor(9)).toEqual({ choice: null, other: '9' });
  });
});
