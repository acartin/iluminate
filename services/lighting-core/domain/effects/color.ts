import type { Rgb } from "./module.js";
import { clampByte } from "./math.js";

const colorCache = new Map<string, Readonly<Rgb>>();

export function parseColor(value: string): Rgb {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  const cached = colorCache.get(normalized);
  if (cached) return cached;
  const parsed = Object.freeze({
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  });
  if (colorCache.size >= 256) colorCache.clear();
  colorCache.set(normalized, parsed);
  return parsed;
}

export function mixColors(from: Rgb, to: Rgb, amount: number, output: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  output.r = clampByte(from.r + (to.r - from.r) * amount);
  output.g = clampByte(from.g + (to.g - from.g) * amount);
  output.b = clampByte(from.b + (to.b - from.b) * amount);
  return output;
}

export function scaleColor(color: Rgb, intensity: number, output: Rgb = { r: 0, g: 0, b: 0 }): Rgb {
  output.r = clampByte(color.r * intensity);
  output.g = clampByte(color.g * intensity);
  output.b = clampByte(color.b * intensity);
  return output;
}
