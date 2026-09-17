import { mixColors, parseColor } from "./color.js";
import { clamp, fbm, modulo } from "./math.js";
import type { EffectModule } from "./module.js";

export const cometEffect: EffectModule = {
  definition: {
    id: "comet",
    label: "Comet",
    description: "A bright organic head travels the target leaving a fading trail, wrapping around closed loops.",
    family: "linear",
    parameters: {
      color: { type: "color", label: "Trail color", required: true, default: "#2E9BFF" },
      headColor: { type: "color", label: "Head color", default: "#FFFFFF" },
      backgroundColor: { type: "color", label: "Background", default: "#00040F" },
      tail: { type: "percent", label: "Tail length", default: 0.35, min: 0.02, max: 1 },
      cycles: { type: "integer", label: "Cycles", default: 1, min: 1, max: 50 },
      turbulence: { type: "percent", label: "Turbulence", default: 0.35, min: 0, max: 1 },
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
  render: ({ params, progress, localTimeMs, index, total }) => {
    const color = parseColor(String(params.color ?? "#2E9BFF"));
    const headColor = parseColor(String(params.headColor ?? "#FFFFFF"));
    const background = parseColor(String(params.backgroundColor ?? "#00040F"));
    const tail = clamp(typeof params.tail === "number" ? params.tail : 0.35, 0.02, 1);
    const cycles = typeof params.cycles === "number" ? Math.max(1, Math.round(params.cycles)) : 1;
    const turbulence = clamp(typeof params.turbulence === "number" ? params.turbulence : 0.35, 0, 1);
    const direction = params.direction === "reverse" ? "reverse" : "forward";
    const count = Math.max(1, total);

    // Continuous head position so leading pixels ramp up smoothly.
    const headPos = modulo(progress * cycles * count, count);
    const directedIndex = direction === "reverse" ? count - 1 - index : index;
    // Distance behind the head along the travel direction, wrapping around loops.
    const behind = modulo(headPos - directedIndex, count);
    const tailLength = Math.max(1, tail * count);
    const time = localTimeMs * 0.001;
    const wobble = (fbm(directedIndex * 0.35 + time * 0.6, time * 0.5) - 0.5) * turbulence;
    const tailWobble = 1 + (fbm(directedIndex * 0.14 + time * 0.3, time * 0.2 + 4.7) - 0.5) * turbulence * 0.7;
    const t = behind / (tailLength * Math.max(0.35, tailWobble));
    if (t >= 1) return background;

    const flicker = 1 - turbulence * 0.35 * (0.5 - fbm(directedIndex * 0.9 - time * 1.4, time * 0.9 + 7.3));
    const core = Math.exp(-((t / 0.16) ** 2));
    const body = Math.exp(-t * (2.6 + wobble * 2));
    const intensity = clamp((body * 0.8 + core * 0.95) * flicker, 0, 1);
    const shade = mixColors(color, headColor, clamp(core * 0.95 + Math.max(0, wobble) * 0.2, 0, 1));
    return mixColors(background, shade, intensity);
  }
};
