export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampByte(value: number) {
  return Math.round(clamp(value, 0, 255));
}

export function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

export function modulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function pseudoNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashNoise(xi, yi);
  const b = hashNoise(xi + 1, yi);
  const c = hashNoise(xi, yi + 1);
  const d = hashNoise(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function hashNoise(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function fbm(x: number, y: number) {
  return (
    pseudoNoise(x, y) * 0.5 +
    pseudoNoise(x * 2.03 + 11.7, y * 2.01 - 6.3) * 0.3 +
    pseudoNoise(x * 4.01 - 3.1, y * 4.07 + 19.8) * 0.2
  );
}
