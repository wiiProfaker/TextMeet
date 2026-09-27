export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** ring — кольцо (ожидание), dot — закрашенный круг (идёт запись, План 2). */
export type CircleStyle = 'ring' | 'dot';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Рисует сглаженный круг или кольцо на прозрачном квадрате size×size, возвращает RGBA. */
export function drawCircleIcon(size: number, color: Rgb, style: CircleStyle): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const center = size / 2;
  const outer = size / 2 - size / 16;
  const inner = outer - size / 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      let coverage = clamp01(outer + 0.5 - distance);
      if (style === 'ring') coverage = Math.min(coverage, clamp01(distance - inner + 0.5));
      const i = (y * size + x) * 4;
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}
