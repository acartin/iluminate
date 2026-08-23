import { EffectDefinition, EffectId } from "../partituras/types.js";

export const effectCatalog: Record<EffectId, EffectDefinition> = {
  off: {
    id: "off",
    label: "Off",
    description: "Sets the target pixels to black.",
    parameters: {}
  },
  solid: {
    id: "solid",
    label: "Solid",
    description: "Applies one constant color to the target.",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" }
    }
  },
  fade: {
    id: "fade",
    label: "Fade",
    description: "Interpolates from one color to another across the clip duration.",
    parameters: {
      fromColor: { type: "color", label: "From color", required: true, default: "#000000" },
      toColor: { type: "color", label: "To color", required: true, default: "#FFFFFF" }
    }
  },
  pulse: {
    id: "pulse",
    label: "Pulse",
    description: "Breathes a color in and out over time.",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" },
      minIntensity: { type: "percent", label: "Min intensity", default: 0, min: 0, max: 1 },
      maxIntensity: { type: "percent", label: "Max intensity", default: 1, min: 0, max: 1 }
    }
  },
  chase: {
    id: "chase",
    label: "Chase",
    description: "Moves a lit band across the resolved target pixels.",
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
  toggle: {
    id: "toggle",
    label: "Toggle",
    description: "Switches the target between an on color and an off color over time.",
    parameters: {
      onColor: { type: "color", label: "On color", required: true, default: "#FFFFFF" },
      offColor: { type: "color", label: "Off color", default: "#000000" },
      periodMs: { type: "integer", label: "Period", unit: "ms", default: 1000, min: 1 },
      dutyCycle: { type: "percent", label: "Duty", default: 0.5, min: 0, max: 1 },
      groupCount: { type: "integer", label: "Groups", default: 1, min: 1 }
    }
  }
};

export function isSupportedEffect(effect: string): effect is EffectId {
  return Object.prototype.hasOwnProperty.call(effectCatalog, effect);
}
