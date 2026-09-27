import { describe, expect, it } from 'vitest';
import { drawCircleIcon } from './circle-icon';

const alphaAt = (pixels: Uint8Array, size: number, x: number, y: number): number => pixels[(y * size + x) * 4 + 3]!;

describe('drawCircleIcon', () => {
  const red = { r: 230, g: 40, b: 40 };

  it('returns size*size RGBA pixels in the given color', () => {
    const pixels = drawCircleIcon(16, red, 'dot');
    expect(pixels.length).toBe(16 * 16 * 4);
    expect([...pixels.subarray(0, 3)]).toEqual([230, 40, 40]);
  });

  it('fills the center of a dot and keeps corners transparent', () => {
    const pixels = drawCircleIcon(16, red, 'dot');
    expect(alphaAt(pixels, 16, 8, 8)).toBe(255);
    expect(alphaAt(pixels, 16, 0, 0)).toBe(0);
  });

  it('keeps the center of a ring transparent and its edge opaque', () => {
    const pixels = drawCircleIcon(32, red, 'ring');
    expect(alphaAt(pixels, 32, 16, 16)).toBe(0);
    expect(alphaAt(pixels, 32, 3, 16)).toBe(255);
    expect(alphaAt(pixels, 32, 0, 0)).toBe(0);
  });
});
