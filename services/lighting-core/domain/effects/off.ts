import type { EffectModule } from "./module.js";

export const offEffect: EffectModule = {
  definition: {
    id: "off",
    label: "Off",
    description: "Sets the target pixels to black.",
    family: "utility",
    parameters: {}
  },
  render: () => ({ r: 0, g: 0, b: 0 })
};
