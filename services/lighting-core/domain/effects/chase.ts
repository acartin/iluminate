import { parseColor } from "./color.js";
import type { EffectModule } from "./module.js";

export const chaseEffect: EffectModule = {
  definition: {
    id: "chase",
    label: "Chase",
    description: "Moves a lit band across the resolved target pixels.",
    family: "linear",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" },
      backgroundColor: { type: "color", label: "Background", default: "#000000" },
      width: { type: "integer", label: "Width", default: 8, min: 1 },
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
    const direction = params.direction === "reverse" ? "reverse" : "forward";
    const head = Math.round(progress * Math.max(0, total - 1));
    const directedIndex = direction === "reverse" ? total - 1 - index : index;
    const active = directedIndex >= head && directedIndex < head + width;
    return active ? parseColor(String(params.color)) : parseColor(String(params.backgroundColor ?? "#000000"));
  }
};
