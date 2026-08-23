import { Clip, Partitura, PartituraTarget, Segment } from "../domain/partituras/types.js";
import { validatePartitura } from "../validators/partitura-validator.js";

export type Rgb = {
  r: number;
  g: number;
  b: number;
};

export type PixelAddress = {
  chainId: string;
  output: number;
  index: number;
};

export type FramePixel = PixelAddress & {
  color: Rgb;
};

export type RenderFrame = {
  sceneId: string;
  timeMs: number;
  pixels: FramePixel[];
};

type PixelBuffer = Map<string, FramePixel>;

export function renderSceneFrame(partitura: Partitura, sceneId: string, timeMs: number): RenderFrame {
  const validation = validatePartitura(partitura);
  if (!validation.ok) {
    throw new Error(`Cannot render invalid partitura: ${validation.errors[0]?.message ?? "unknown error"}`);
  }

  const scene = partitura.scenes.find((entry) => entry.id === sceneId);
  if (!scene) {
    throw new Error(`Scene ${sceneId} does not exist.`);
  }

  const sceneTime = scene.loop ? modulo(timeMs, scene.durationMs) : Math.min(timeMs, scene.durationMs);
  const buffer: PixelBuffer = new Map();

  const activeClips = scene.tracks
    .flatMap((track) =>
      track.clips.map((clip) => ({
        clip,
        target: clip.target ?? track.target
      }))
    )
    .filter(({ clip }) => clipIsActive(clip, sceneTime))
    .sort((left, right) => left.clip.layer - right.clip.layer);

  for (const { clip, target } of activeClips) {
    const addresses = resolveTarget(partitura, target);
    const localTimeMs = sceneTime - clip.startMs;
    const progress = clamp(localTimeMs / clip.durationMs, 0, 1);

    addresses.forEach((address, index) => {
      const color = renderEffectColor(clip, progress, localTimeMs, index, addresses.length);
      const key = pixelKey(address);
      const current = buffer.get(key);
      buffer.set(key, {
        ...address,
        color: compose(current?.color ?? { r: 0, g: 0, b: 0 }, color, clip.blend)
      });
    });
  }

  return {
    sceneId: scene.id,
    timeMs: sceneTime,
    pixels: Array.from(buffer.values()).sort((left, right) => left.output - right.output || left.index - right.index)
  };
}

export function resolveTarget(partitura: Partitura, target: PartituraTarget): PixelAddress[] {
  if (target.type === "installation") {
    return partitura.chains.flatMap((chain) =>
      range(chain.pixelCount).map((index) => ({ chainId: chain.id, output: chain.output, index }))
    );
  }

  if (target.type === "chain") {
    const chain = partitura.chains.find((entry) => entry.id === target.id);
    return chain ? range(chain.pixelCount).map((index) => ({ chainId: chain.id, output: chain.output, index })) : [];
  }

  if (target.type === "segment") {
    const segment = partitura.segments.find((entry) => entry.id === target.id);
    return segment ? resolveSegment(partitura, segment) : [];
  }

  const zone = partitura.zones.find((entry) => entry.id === target.id);
  if (!zone) return [];

  const ownPixels = zone.segments.flatMap((segmentId) => resolveTarget(partitura, { type: "segment", id: segmentId }));
  const childPixels = (zone.zones ?? []).flatMap((zoneId) => resolveTarget(partitura, { type: "zone", id: zoneId }));
  return [...ownPixels, ...childPixels];
}

function resolveSegment(partitura: Partitura, segment: Segment): PixelAddress[] {
  const chain = partitura.chains.find((entry) => entry.id === segment.chainId);
  if (!chain) return [];
  const indexes = range(segment.length).map((offset) => segment.start + offset);
  const directed = segment.reverse ? indexes.reverse() : indexes;
  return directed.map((index) => ({ chainId: chain.id, output: chain.output, index }));
}

function clipIsActive(clip: Clip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
}

function renderEffectColor(clip: Clip, progress: number, localTimeMs: number, index: number, total: number): Rgb {
  if (clip.effect === "off") return { r: 0, g: 0, b: 0 };
  if (clip.effect === "solid") return parseColor(String(clip.params.color));
  if (clip.effect === "fade") {
    return mixColors(parseColor(String(clip.params.fromColor)), parseColor(String(clip.params.toColor)), progress);
  }
  if (clip.effect === "pulse") {
    const color = parseColor(String(clip.params.color));
    const min = typeof clip.params.minIntensity === "number" ? clip.params.minIntensity : 0;
    const max = typeof clip.params.maxIntensity === "number" ? clip.params.maxIntensity : 1;
    const intensity = min + (max - min) * ((Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) / 2);
    return scaleColor(color, intensity);
  }
  if (clip.effect === "chase") {
    const width = typeof clip.params.width === "number" ? Math.max(1, Math.round(clip.params.width)) : 8;
    const direction = clip.params.direction === "reverse" ? "reverse" : "forward";
    const head = Math.round(progress * Math.max(0, total - 1));
    const directedIndex = direction === "reverse" ? total - 1 - index : index;
    const active = directedIndex >= head && directedIndex < head + width;
    return active ? parseColor(String(clip.params.color)) : parseColor(String(clip.params.backgroundColor ?? "#000000"));
  }
  if (clip.effect === "toggle") {
    const periodMs = typeof clip.params.periodMs === "number" ? Math.max(1, clip.params.periodMs) : 1000;
    const dutyCycle = typeof clip.params.dutyCycle === "number" ? clamp(clip.params.dutyCycle, 0, 1) : 0.5;
    const groupCount = typeof clip.params.groupCount === "number" ? Math.max(1, Math.round(clip.params.groupCount)) : 1;
    const phase = modulo(localTimeMs, periodMs) / periodMs;
    if (groupCount > 1) {
      const groupIndex = Math.min(groupCount - 1, Math.floor((index / Math.max(1, total)) * groupCount));
      const start = groupIndex / groupCount;
      const end = Math.min(1, start + dutyCycle);
      return phase >= start && phase < end ? parseColor(String(clip.params.onColor)) : parseColor(String(clip.params.offColor ?? "#000000"));
    }
    return phase < dutyCycle ? parseColor(String(clip.params.onColor)) : parseColor(String(clip.params.offColor ?? "#000000"));
  }
  return { r: 0, g: 0, b: 0 };
}

function compose(base: Rgb, next: Rgb, blend: string): Rgb {
  if (blend === "add") return { r: clampByte(base.r + next.r), g: clampByte(base.g + next.g), b: clampByte(base.b + next.b) };
  if (blend === "max") return { r: Math.max(base.r, next.r), g: Math.max(base.g, next.g), b: Math.max(base.b, next.b) };
  if (blend === "multiply") {
    return {
      r: clampByte((base.r * next.r) / 255),
      g: clampByte((base.g * next.g) / 255),
      b: clampByte((base.b * next.b) / 255)
    };
  }
  return next;
}

function parseColor(value: string): Rgb {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function mixColors(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: clampByte(from.r + (to.r - from.r) * amount),
    g: clampByte(from.g + (to.g - from.g) * amount),
    b: clampByte(from.b + (to.b - from.b) * amount)
  };
}

function scaleColor(color: Rgb, intensity: number): Rgb {
  return {
    r: clampByte(color.r * intensity),
    g: clampByte(color.g * intensity),
    b: clampByte(color.b * intensity)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number) {
  return Math.round(clamp(value, 0, 255));
}

function modulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function range(length: number) {
  return Array.from({ length }, (_, index) => index);
}

function pixelKey(address: PixelAddress) {
  return `${address.chainId}:${address.index}`;
}
