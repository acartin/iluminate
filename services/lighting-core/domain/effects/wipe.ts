import { mixColors, parseColor } from "./color.js";
import { clamp, modulo } from "./math.js";
import type { EffectModule } from "./module.js";

export const wipeEffect: EffectModule = {
  definition: {
    id: "wipe",
    label: "Wipe",
    description: "A filling sweep: a bright head advances and everything it leaves behind stays filled.",
    family: "linear",
    parameters: {
      color: { type: "color", label: "Fill color", required: true, default: "#2E9BFF" },
      headColor: { type: "color", label: "Head color", default: "#EAFBFF" },
      backgroundColor: { type: "color", label: "Background", default: "#00040F" },
      softness: { type: "percent", label: "Edge softness", default: 0.05, min: 0, max: 1 },
      headWidth: { type: "percent", label: "Head width", default: 0.04, min: 0, max: 0.5 },
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
    const fill = parseColor(String(params.color ?? "#2E9BFF"));
    const headColor = parseColor(String(params.headColor ?? "#EAFBFF"));
    const background = parseColor(String(params.backgroundColor ?? "#00040F"));
    const softness = clamp(typeof params.softness === "number" ? params.softness : 0.05, 0, 1);
    const headWidth = clamp(typeof params.headWidth === "number" ? params.headWidth : 0.04, 0, 0.5);
    const cycles = typeof params.cycles === "number" ? Math.max(1, Math.round(params.cycles)) : 1;
    const direction = params.direction === "reverse" ? "reverse" : "forward";
    const count = Math.max(1, total);

    const headPos = modulo(progress * cycles * count, count);
    const directedIndex = direction === "reverse" ? count - 1 - index : index;
    // Signed distance to the head: negative = already passed (behind), positive = ahead.
    const d = directedIndex - headPos;

    // Fill: everything behind the head is fully lit; a soft edge trails the front.
    const edge = Math.max(0.001, softness * count);
    const fillAmount = clamp(1 - d / edge, 0, 1);
    // Bright head band centered on the front.
    const headEdge = Math.max(0.001, headWidth * count);
    const headAmount = clamp(1 - Math.abs(d) / headEdge, 0, 1);

    const shade = mixColors(fill, headColor, headAmount);
    return mixColors(background, shade, fillAmount);
  }
};
