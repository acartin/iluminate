import { mixColors, parseColor, scaleColor } from "./color.js";
import { clamp, fbm, smoothstep } from "./math.js";
import type { EffectModule } from "./module.js";

export const flameEffect: EffectModule = {
  definition: {
    id: "flame",
    label: "Flame",
    description: "Generates rising flame tongues using spatial x/y coordinates.",
    family: "spatial",
    parameters: {
      baseColor: { type: "color", label: "Base color", required: true, default: "#FF1A00" },
      tipColor: { type: "color", label: "Tip color", required: true, default: "#FFC43A" },
      cooling: { type: "percent", label: "Cooling", default: 0.24, min: 0, max: 1 },
      speed: { type: "number", label: "Speed", default: 1.15, min: 0.1, max: 5 },
      turbulence: { type: "percent", label: "Turbulence", default: 0.68, min: 0, max: 1 },
      height: { type: "percent", label: "Height", default: 0.96, min: 0.1, max: 1 }
    }
  },
  render: ({ params, localTimeMs, pixel }) => {
    const ember = parseColor("#300000");
    const base = parseColor(String(params.baseColor ?? "#FF1A00"));
    const mid = parseColor("#FF6200");
    const tip = parseColor(String(params.tipColor ?? "#FFC43A"));
    const white = parseColor("#FFF0B8");
    const cooling = typeof params.cooling === "number" ? clamp(params.cooling, 0, 1) : 0.24;
    const speed = typeof params.speed === "number" ? Math.max(0.001, params.speed) : 1.15;
    const turbulence = typeof params.turbulence === "number" ? clamp(params.turbulence, 0, 1) : 0.68;
    const height = typeof params.height === "number" ? clamp(params.height, 0.1, 1) : 0.96;
    const time = localTimeMs * 0.001 * speed;
    const x = pixel.normalizedX;
    const y = 1 - pixel.normalizedY;
    const distanceFromBase = y;
    const proximityToBase = 1 - y;
    const sway = (fbm(x * 1.6 + time * 0.55, y * 1.2 - time * 0.2) - 0.5) * turbulence * 0.5;
    const warpedX = x + sway;
    const rolling = fbm(warpedX * 4.4, y * 5.4 - time * 1.65);
    const rising = fbm(warpedX * 2.2 + time * 0.1, y * 3.1 - time * 1.1);
    const fine = fbm(warpedX * 13.0 + time * 0.35, y * 10.0 - time * 2.9);
    const heightMask = 1 - smoothstep(height, 1, distanceFromBase);
    const edgeMask = smoothstep(0.04, 0.22, x) * (1 - smoothstep(0.78, 0.96, x));
    const tongues = smoothstep(0.42, 0.82, rolling + proximityToBase * 0.22) * heightMask;
    const columns = smoothstep(0.48, 0.88, rising) * heightMask * edgeMask;
    const core = smoothstep(0.25, 0.95, 1 - Math.abs(warpedX - 0.5) * 1.35);
    const baseGlow = Math.pow(proximityToBase, 1.45);
    const heat = clamp(baseGlow * 0.86 + tongues * 0.72 + columns * 0.5 + core * 0.12 + fine * 0.16 - cooling * distanceFromBase * 0.24, 0, 1);
    const color = heat < 0.34
      ? mixColors(ember, base, heat / 0.34)
      : heat < 0.72
        ? mixColors(base, mid, (heat - 0.34) / 0.38)
        : heat < 0.94
          ? mixColors(mid, tip, (heat - 0.72) / 0.22)
          : mixColors(tip, white, (heat - 0.94) / 0.06);
    return scaleColor(color, 0.12 + smoothstep(0.02, 1, heat) * 0.88);
  }
};
