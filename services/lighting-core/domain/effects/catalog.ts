import { EffectDefinition, EffectId } from "../partituras/types.js";

export const effectCatalog: Record<EffectId, EffectDefinition> = {
  off: {
    id: "off",
    label: "Off",
    description: "Sets the target pixels to black.",
    family: "utility",
    parameters: {}
  },
  solid: {
    id: "solid",
    label: "Solid",
    description: "Applies one constant color to the target.",
    family: "utility",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#FFFFFF" }
    }
  },
  fade: {
    id: "fade",
    label: "Fade",
    description: "Interpolates from one color to another across the clip duration.",
    family: "linear",
    parameters: {
      fromColor: { type: "color", label: "From color", required: true, default: "#000000" },
      toColor: { type: "color", label: "To color", required: true, default: "#FFFFFF" }
    }
  },
  pulse: {
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
  chase: {
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
  toggle: {
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
  flame: {
    id: "flame",
    label: "Flame",
    description: "Generates rising flame tongues using spatial x/y coordinates.",
    family: "spatial",
    parameters: {
      baseColor: { type: "color", label: "Base color", required: true, default: "#FF1A00" },
      tipColor: { type: "color", label: "Tip color", required: true, default: "#FFC43A" },
      cooling: { type: "percent", label: "Cooling", default: 0.24, min: 0, max: 1 },
      speed: { type: "number", label: "Speed", default: 1.15, min: 0.1, max: 5 },
      turbulence: { type: "percent", label: "Turbulence", default: 0.68, min: 0, max: 1 },
      height: { type: "percent", label: "Height", default: 0.96, min: 0.1, max: 1 }
    }
  },
  spatial_fill: {
    id: "spatial_fill",
    label: "Spatial Fill",
    description: "Fills a mapped surface along its x/y coordinate space.",
    family: "spatial",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#00AAFF" },
      backgroundColor: { type: "color", label: "Background", default: "#000000" },
      axis: {
        type: "select",
        label: "Axis",
        default: "y",
        options: [
          { value: "x", label: "Left / Right" },
          { value: "y", label: "Up / Down" }
        ]
      },
      direction: {
        type: "select",
        label: "Direction",
        default: "reverse",
        options: [
          { value: "forward", label: "Forward" },
          { value: "reverse", label: "Reverse" }
        ]
      },
      softness: { type: "percent", label: "Softness", default: 0.12, min: 0, max: 1 }
    }
  },
  spatial_wave: {
    id: "spatial_wave",
    label: "Spatial Wave",
    description: "Moves an electric wave field across mapped x/y coordinates.",
    family: "spatial",
    parameters: {
      color: { type: "color", label: "Color", required: true, default: "#18E8FF" },
      backgroundColor: { type: "color", label: "Background", default: "#00112E" },
      axis: {
        type: "select",
        label: "Axis",
        default: "y",
        options: [
          { value: "x", label: "Horizontal" },
          { value: "y", label: "Vertical" }
        ]
      },
      speed: { type: "number", label: "Speed", default: 0.9, min: 0.1, max: 5 },
      wavelength: { type: "number", label: "Wavelength", default: 1.15, min: 0.2, max: 6 },
      contrast: { type: "percent", label: "Contrast", default: 0.72, min: 0, max: 1 }
    }
  }
};

export function isSupportedEffect(effect: string): effect is EffectId {
  return Object.prototype.hasOwnProperty.call(effectCatalog, effect);
}
