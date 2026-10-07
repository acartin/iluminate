import type { EffectModule } from "./module.js";

export const offEffect: EffectModule = {
  definition: {
    id: "off",
    label: "Off",
    description: "Sets the target pixels to black.",
    family: "utility",
    parameters: {}
  },
  render: (_context, output = { r: 0, g: 0, b: 0 }) => {
    output.r = 0;
    output.g = 0;
    output.b = 0;
    return output;
  }
};
