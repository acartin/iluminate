import { parseColor } from "./color.js";
import { clamp, modulo } from "./math.js";
import type { EffectModule } from "./module.js";

export const toggleEffect: EffectModule = {
  definition: {
    id: "toggle",
    label: "Toggle",
    description: "Switches the target between an on color and an off color over time.",
    family: "linear",
    parameters: {
      onColor: { type: "color", label: "On color", required: true, default: "#FFFFFF" },
      offColor: { type: "color", label: "Off color", default: "#000000" },
      periodMs: { type: "integer", label: "Period", unit: "ms", default: 1000, min: 1 },
      dutyCycle: { type: "percent", label: "Duty", default: 0.5, min: 0, max: 1 },
      groupCount: { type: "integer", label: "Groups", default: 1, min: 1 }
    }
  },
  render: ({ params, localTimeMs, index, total }) => {
    const periodMs = typeof params.periodMs === "number" ? Math.max(1, params.periodMs) : 1000;
    const dutyCycle = typeof params.dutyCycle === "number" ? clamp(params.dutyCycle, 0, 1) : 0.5;
    const groupCount = typeof params.groupCount === "number" ? Math.max(1, Math.round(params.groupCount)) : 1;
    const phase = modulo(localTimeMs, periodMs) / periodMs;
    if (groupCount > 1) {
      const groupIndex = Math.min(groupCount - 1, Math.floor((index / Math.max(1, total)) * groupCount));
      const start = groupIndex / groupCount;
      const end = Math.min(1, start + dutyCycle);
      return phase >= start && phase < end ? parseColor(String(params.onColor)) : parseColor(String(params.offColor ?? "#000000"));
    }
    return phase < dutyCycle ? parseColor(String(params.onColor)) : parseColor(String(params.offColor ?? "#000000"));
  }
};
