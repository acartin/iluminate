import { parseColor, scaleColor } from "./color.js";
import type { EffectModule } from "./module.js";

export const pulseEffect: EffectModule = {
  definition: {
    id: "pulse",
    label: "Pulse",
    description: "Breathes a color in and out over time.",
    family: "linear",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" },
      minIntensity: { type: "percent", label: "Min intensity", default: 0, min: 0, max: 1 },
      maxIntensity: { type: "percent", label: "Max intensity", default: 1, min: 0, max: 1 }
    }
  },
  render: ({ params, progress }) => {
    const color = parseColor(String(params.color));
    const min = typeof params.minIntensity === "number" ? params.minIntensity : 0;
    const max = typeof params.maxIntensity === "number" ? params.maxIntensity : 1;
    const intensity = min + (max - min) * ((Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) / 2);
    return scaleColor(color, intensity);
  }
};
