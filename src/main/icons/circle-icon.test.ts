import { describe, expect, it } from 'vitest';
import { drawCircleIcon, drawRecordingIcon, RECORDING_RED } from './circle-icon';

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

describe('drawRecordingIcon', () => {
  const blue = { r: 59, g: 130, b: 246 };
  const rgbaAt = (pixels: Uint8Array, size: number, x: number, y: number) => [...pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];

  it('puts an opaque red dot in the lower right corner', () => {
    const pixels = drawRecordingIcon(32, blue);
    expect(rgbaAt(pixels, 32, 23, 23)).toEqual([RECORDING_RED.r, RECORDING_RED.g, RECORDING_RED.b, 255]);
  });

  it('keeps the rest of the ring in its own color', () => {
    const pixels = drawRecordingIcon(32, blue);
    expect(rgbaAt(pixels, 32, 3, 16)).toEqual([59, 130, 246, 255]);
    expect(alphaAt(pixels, 32, 0, 0)).toBe(0);
  });

  it('cuts a transparent gap between the ring and the dot', () => {
    const ring = drawCircleIcon(32, blue, 'ring');
    const pixels = drawRecordingIcon(32, blue);
    let cut = 0;
    for (let i = 3; i < ring.length; i += 4) if (ring[i] === 255 && pixels[i] === 0) cut += 1;
    expect(cut).toBeGreaterThan(4);
  });
});
