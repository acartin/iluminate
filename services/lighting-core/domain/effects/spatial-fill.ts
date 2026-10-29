import { mixColors, parseColor } from "./color.js";
import { clamp } from "./math.js";
import type { EffectModule } from "./module.js";

export const spatialFillEffect: EffectModule = {
  definition: {
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
  render: ({ params, progress, pixel }, output) => {
    const color = parseColor(String(params.color ?? "#00AAFF"));
    const background = parseColor(String(params.backgroundColor ?? "#000000"));
    const axis = params.axis === "x" ? "x" : "y";
    const direction = params.direction === "forward" ? "forward" : "reverse";
    const softness = typeof params.softness === "number" ? clamp(params.softness, 0, 1) : 0.12;
    const coordinate = axis === "x" ? pixel.normalizedX : pixel.normalizedY;
    const directedCoordinate = direction === "reverse" ? 1 - coordinate : coordinate;
    // Move the complete feathered front through the target over the clip's
    // normalized duration: fully outside before 0, centered at 0.5, and fully
    // outside after 1. Softness changes only the front width, not its schedule.
    const leadingEdge = progress * (1 + softness);
    const intensity = softness <= 0
      ? (directedCoordinate <= progress ? 1 : 0)
      : clamp((leadingEdge - directedCoordinate) / softness, 0, 1);
    return mixColors(background, color, intensity, output);
  }
};
