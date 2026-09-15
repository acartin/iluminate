import { mixColors, parseColor } from "./color.js";
import { clamp, fbm, smoothstep } from "./math.js";
import type { EffectModule } from "./module.js";

export const spatialWaveEffect: EffectModule = {
  definition: {
    id: "spatial_wave",
    label: "Spatial Wave",
    description: "Moves an electric wave field across mapped x/y coordinates.",
    family: "spatial",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#18E8FF" },
      backgroundColor: { type: "color", label: "Background", default: "#00112E" },
      axis: {
        type: "select",
        label: "Axis",
        default: "y",
        options: [
          { value: "x", label: "Horizontal" },
          { value: "y", label: "Vertical" }
        ]
      },
      speed: { type: "number", label: "Speed", default: 0.9, min: 0.1, max: 5 },
      wavelength: { type: "number", label: "Wavelength", default: 1.15, min: 0.2, max: 6 },
      contrast: { type: "percent", label: "Contrast", default: 0.72, min: 0, max: 1 }
    }
  },
  render: ({ params, localTimeMs, pixel }) => {
    const color = parseColor(String(params.color ?? "#18E8FF"));
    const background = parseColor(String(params.backgroundColor ?? "#00112E"));
    const white = parseColor("#E8FFFF");
    const axis = params.axis === "x" ? "x" : "y";
    const speed = typeof params.speed === "number" ? Math.max(0.001, params.speed) : 0.9;
    const wavelength = typeof params.wavelength === "number" ? Math.max(0.001, params.wavelength) : 1.15;
    const contrast = typeof params.contrast === "number" ? clamp(params.contrast, 0, 1) : 0.72;
    const primary = axis === "x" ? pixel.normalizedX : pixel.normalizedY;
    const secondary = axis === "x" ? pixel.normalizedY : pixel.normalizedX;
    const time = localTimeMs * 0.001 * speed;
    const warp = (fbm(secondary * 3.4 + time * 0.35, primary * 2.1 - time * 0.24) - 0.5) * 0.24;
    const diagonal = secondary * 0.28;
    const travel = primary * wavelength + diagonal + warp - time;
    const main = Math.pow((Math.sin(travel * Math.PI * 2) + 1) / 2, 1.6 + contrast * 3.2);
    const harmonic = Math.pow((Math.sin((travel * 2.1 + secondary * 0.55) * Math.PI * 2) + 1) / 2, 3.5);
    const spark = smoothstep(0.76, 1, fbm(primary * 10.0 - time * 2.0, secondary * 8.0 + time));
    const glow = clamp(main * 0.72 + harmonic * 0.22 + spark * main * 0.3, 0, 1);
    const core = smoothstep(0.74, 1, glow);
    return mixColors(mixColors(background, color, glow), white, core * 0.34);
  }
};
