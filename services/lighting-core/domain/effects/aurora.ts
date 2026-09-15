import { mixColors, parseColor } from "./color.js";
import { clamp, fbm, smoothstep } from "./math.js";
import type { EffectModule } from "./module.js";

export const auroraEffect: EffectModule = {
  definition: {
    id: "aurora",
    label: "Aurora",
    description: "Flowing polar-light curtains that ripple across the mapped surface.",
    family: "spatial",
    parameters: {
      color: { type: "color", label: "Curtain color", required: true, default: "#12FF8C" },
      secondaryColor: { type: "color", label: "Secondary color", default: "#0A6CFF" },
      accentColor: { type: "color", label: "Crown color", default: "#B14BFF" },
      backgroundColor: { type: "color", label: "Night sky", default: "#000814" },
      speed: { type: "number", label: "Speed", default: 0.6, min: 0.05, max: 5 },
      intensity: { type: "percent", label: "Intensity", default: 0.85, min: 0, max: 1 },
      scale: { type: "number", label: "Scale", default: 1, min: 0.2, max: 6 }
    }
  },
  render: ({ params, localTimeMs, pixel }) => {
    const base = parseColor(String(params.color ?? "#12FF8C"));
    const cool = parseColor(String(params.secondaryColor ?? "#0A6CFF"));
    const accent = parseColor(String(params.accentColor ?? "#B14BFF"));
    const background = parseColor(String(params.backgroundColor ?? "#000814"));
    const speed = typeof params.speed === "number" ? Math.max(0.001, params.speed) : 0.6;
    const intensity = typeof params.intensity === "number" ? clamp(params.intensity, 0, 1) : 0.85;
    const scale = typeof params.scale === "number" ? Math.max(0.1, params.scale) : 1;
    const time = localTimeMs * 0.001 * speed;
    const x = pixel.normalizedX;
    const y = pixel.normalizedY;

    // Curtains wave horizontally while vertical rays ripple through them.
    const sway = (fbm(x * scale * 1.7 + time * 0.5, time * 0.18) - 0.5) * 1.3;
    const raysA = fbm(x * scale * 5.5 + sway + time * 0.4, y * 1.1 + time * 0.12);
    const raysB = fbm(x * scale * 10.0 - sway * 0.6 - time * 0.25, y * 1.7 + time * 0.28);
    const rays = clamp(raysA * 0.62 + raysB * 0.48, 0, 1);
    const envelope = fbm(x * scale * 1.2 - time * 0.2, time * 0.09);

    // Curtains hang from the top and thin toward the bottom.
    const length = 0.35 + rays * 0.7;
    const vertical = clamp(1 - y * 0.6, 0.35, 1);
    const crest = smoothstep(0.62, 1, rays);
    const body = (0.45 + 0.75 * rays) * vertical * (0.6 + 0.5 * envelope);
    // Bright lower border where each curtain ends.
    const lowerEdge = smoothstep(0.1, 0, Math.abs(y - length)) * (0.4 + 0.6 * rays);

    // Green core, blue body, violet crowns that bloom toward white.
    const mix1 = clamp((rays - 0.5) * 1.8, 0, 1);
    const mix2 = clamp((rays - 0.7) * 3.0 + envelope * 0.25, 0, 1);
    const color = mixColors(mixColors(base, cool, mix1), accent, mix2 * 0.8);
    const shaded = mixColors(color, parseColor("#E8FFF4"), crest * 0.3);

    // Bright stars high in the night sky.
    const shimmer = smoothstep(0.9, 1, fbm(x * 16 - time * 1.4, y * 11 + time * 0.7)) * (1 - y);

    const glow = clamp(body * intensity * 1.6 + lowerEdge * 0.5 + crest * 0.18 + shimmer * 0.5, 0, 1);
    return mixColors(background, shaded, glow);
  }
};
