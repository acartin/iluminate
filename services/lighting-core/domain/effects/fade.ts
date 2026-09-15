import { mixColors, parseColor } from "./color.js";
import type { EffectModule } from "./module.js";

export const fadeEffect: EffectModule = {
  definition: {
    id: "fade",
    label: "Fade",
    description: "Interpolates from one color to another across the clip duration.",
    family: "linear",
    parameters: {
      fromColor: { type: "color", label: "From color", required: true, default: "#000000" },
      toColor: { type: "color", label: "To color", required: true, default: "#FFFFFF" }
    }
  },
  render: ({ params, progress }) => mixColors(parseColor(String(params.fromColor)), parseColor(String(params.toColor)), progress)
};
