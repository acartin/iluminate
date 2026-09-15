import { parseColor } from "./color.js";
import type { EffectModule } from "./module.js";

export const solidEffect: EffectModule = {
  definition: {
    id: "solid",
    label: "Solid",
    description: "Applies one constant color to the target.",
    family: "utility",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" }
    }
  },
  render: ({ params }) => parseColor(String(params.color))
};
