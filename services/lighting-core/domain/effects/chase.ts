import { parseColor } from "./color.js";
import { modulo } from "./math.js";
import type { EffectModule } from "./module.js";

export const chaseEffect: EffectModule = {
  definition: {
    id: "chase",
    label: "Chase",
    description: "Moves a lit band across the resolved target pixels and wraps around, so it flows continuously on closed loops.",
    family: "linear",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" },
      backgroundColor: { type: "color", label: "Background", default: "#000000" },
      width: { type: "integer", label: "Width", default: 8, min: 1 },
      cycles: { type: "integer", label: "Cycles", default: 1, min: 1, max: 50 },
      direction: {
        type: "select",
        label: "Direction",
        default: "forward",
        options: [
          { value: "forward", label: "Forward" },
          { value: "reverse", label: "Reverse" }
        ]
      }
    }
  },
  render: ({ params, progress, index, total }) => {
    const width = typeof params.width === "number" ? Math.max(1, Math.round(params.width)) : 8;
    const cycles = typeof params.cycles === "number" ? Math.max(1, Math.round(params.cycles)) : 1;
    const direction = params.direction === "reverse" ? "reverse" : "forward";
    const count = Math.max(1, total);
    // Full loop(s) per clip, wrapping so a closed target (square, circle, string
    // loop) keeps flowing instead of stalling at the last pixel and jumping back.
    const head = Math.floor(modulo(progress * cycles * count, count));
    const directedIndex = direction === "reverse" ? count - 1 - index : index;
    const active = modulo(directedIndex - head, count) < width;
    return active ? parseColor(String(params.color)) : parseColor(String(params.backgroundColor ?? "#000000"));
  }
};
