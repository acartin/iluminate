import type { Rgb } from "./module.js";
import { clampByte } from "./math.js";

export function parseColor(value: string): Rgb {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

export function mixColors(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: clampByte(from.r + (to.r - from.r) * amount),
    g: clampByte(from.g + (to.g - from.g) * amount),
    b: clampByte(from.b + (to.b - from.b) * amount)
  };
}

export function scaleColor(color: Rgb, intensity: number): Rgb {
  return {
    r: clampByte(color.r * intensity),
    g: clampByte(color.g * intensity),
    b: clampByte(color.b * intensity)
  };
}
