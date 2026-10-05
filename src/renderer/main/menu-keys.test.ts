import { describe, expect, it } from 'vitest';
import { menuFocusStep } from './menu-keys';

describe('menuFocusStep', () => {
  it('goes round the menu', () => {
    expect(menuFocusStep(0, 3, 1)).toBe(1);
    expect(menuFocusStep(2, 3, 1)).toBe(0);
    expect(menuFocusStep(0, 3, -1)).toBe(2);
  });

  it('starts at the first item going down and at the last going up when nothing is focused', () => {
    expect(menuFocusStep(-1, 3, 1)).toBe(0);
    expect(menuFocusStep(-1, 3, -1)).toBe(2);
  });

  it('has nowhere to go in an empty menu', () => {
    expect(menuFocusStep(-1, 0, 1)).toBe(-1);
  });
});
