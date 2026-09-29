export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** ring — кольцо (ожидание), dot — закрашенный круг (идёт запись на macOS, где значок одноцветный). */
export type CircleStyle = 'ring' | 'dot';

/** Красная точка записи на значке Windows. */
export const RECORDING_RED: Rgb = { r: 229, g: 57, b: 53 };

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

/** Кольцо с красной точкой в правом нижнем углу (идёт запись); вокруг точки — прозрачный зазор. */
export function drawRecordingIcon(size: number, ringColor: Rgb): Uint8Array {
  const pixels = drawCircleIcon(size, ringColor, 'ring');
  const cx = size * 0.72;
  const cy = size * 0.72;
  const radius = size * 0.26;
  const gap = size / 16;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const dot = clamp01(radius + 0.5 - distance);
      const cut = clamp01(radius + gap + 0.5 - distance);
      const i = (y * size + x) * 4;
      const ring = ((pixels[i + 3] ?? 0) / 255) * (1 - cut);
      const alpha = dot + ring * (1 - dot);
      const mix = (red: number, base: number): number =>
        alpha === 0 ? 0 : Math.round((red * dot + base * ring * (1 - dot)) / alpha);
      pixels[i] = mix(RECORDING_RED.r, ringColor.r);
      pixels[i + 1] = mix(RECORDING_RED.g, ringColor.g);
      pixels[i + 2] = mix(RECORDING_RED.b, ringColor.b);
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}
