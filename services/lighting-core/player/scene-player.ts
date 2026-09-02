import { Clip, Partitura, PartituraTarget, Segment, SpatialPixel } from "../domain/partituras/types.js";
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
  segmentId?: string;
  x: number;
  y: number;
  order: number;
  normalizedX: number;
  normalizedY: number;
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
      const color = renderEffectColor(clip, progress, localTimeMs, index, addresses.length, address);
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
  const pixelMap = normalizePixelMap(partitura);

  if (target.type === "installation") {
    return withNormalizedCoordinates(pixelMap);
  }

  if (target.type === "chain") {
    return withNormalizedCoordinates(pixelMap.filter((pixel) => pixel.chainId === target.id));
  }

  if (target.type === "segment") {
    return withNormalizedCoordinates(pixelMap.filter((pixel) => pixel.segmentId === target.id));
  }

  const zone = partitura.zones.find((entry) => entry.id === target.id);
  if (!zone) return [];

  const ownPixels = zone.segments.flatMap((segmentId) => pixelMap.filter((pixel) => pixel.segmentId === segmentId));
  const childPixels = (zone.zones ?? []).flatMap((zoneId) => resolveTarget(partitura, { type: "zone", id: zoneId }));
  return withNormalizedCoordinates([...ownPixels, ...childPixels]);
}

function resolveSegment(partitura: Partitura, segment: Segment): PixelAddress[] {
  const chain = partitura.chains.find((entry) => entry.id === segment.chainId);
  if (!chain) return [];
  const indexes = range(segment.length).map((offset) => segment.start + offset);
  const directed = segment.reverse ? indexes.reverse() : indexes;
  return withNormalizedCoordinates(directed.map((index, offset) => ({
    id: `${segment.id}_${offset}`,
    chainId: chain.id,
    output: chain.output,
    index,
    segmentId: segment.id,
    x: (segment.x ?? segment.start) + offset * (segment.stepX ?? 1),
    y: (segment.y ?? 0) + offset * (segment.stepY ?? 0),
    order: offset
  })));
}

function clipIsActive(clip: Clip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
}

function renderEffectColor(clip: Clip, progress: number, localTimeMs: number, index: number, total: number, pixel: PixelAddress): Rgb {
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
  if (clip.effect === "flame") {
    return renderFlameColor(clip, localTimeMs, pixel);
  }
  if (clip.effect === "spatial_fill") {
    const color = parseColor(String(clip.params.color ?? "#00AAFF"));
    const background = parseColor(String(clip.params.backgroundColor ?? "#000000"));
    const axis = clip.params.axis === "x" ? "x" : "y";
    const direction = clip.params.direction === "forward" ? "forward" : "reverse";
    const softness = typeof clip.params.softness === "number" ? clamp(clip.params.softness, 0, 1) : 0.12;
    const coordinate = axis === "x" ? pixel.normalizedX : pixel.normalizedY;
    const directedCoordinate = direction === "reverse" ? 1 - coordinate : coordinate;
    const edge = progress;
    const intensity = softness <= 0 ? (directedCoordinate <= edge ? 1 : 0) : clamp((edge - directedCoordinate) / softness + 1, 0, 1);
    return mixColors(background, color, intensity);
  }
  if (clip.effect === "spatial_wave") {
    const color = parseColor(String(clip.params.color ?? "#18E8FF"));
    const background = parseColor(String(clip.params.backgroundColor ?? "#00112E"));
    const white = parseColor("#E8FFFF");
    const axis = clip.params.axis === "x" ? "x" : "y";
    const speed = typeof clip.params.speed === "number" ? Math.max(0.001, clip.params.speed) : 0.9;
    const wavelength = typeof clip.params.wavelength === "number" ? Math.max(0.001, clip.params.wavelength) : 1.15;
    const contrast = typeof clip.params.contrast === "number" ? clamp(clip.params.contrast, 0, 1) : 0.72;
    const primary = axis === "x" ? pixel.normalizedX : pixel.normalizedY;
    const secondary = axis === "x" ? pixel.normalizedY : pixel.normalizedX;
    const time = localTimeMs * 0.001 * speed;
    const warp = (fbm(secondary * 3.4 + time * 0.35, primary * 2.1 - time * 0.24) - 0.5) * 0.24;
    const diagonal = secondary * 0.28;
    const travel = primary * wavelength + diagonal + warp - time;
    const main = Math.pow((Math.sin(travel * Math.PI * 2) + 1) / 2, 1.6 + contrast * 3.2);
    const harmonic = Math.pow((Math.sin((travel * 2.1 + secondary * 0.55) * Math.PI * 2) + 1) / 2, 3.5);
    const spark = smoothstep(0.76, 1, fbm(primary * 10.0 - time * 2.0, secondary * 8.0 + time));
    const glow = clamp(main * 0.72 + harmonic * 0.22 + spark * main * 0.3, 0, 1);
    const core = smoothstep(0.74, 1, glow);
    return mixColors(mixColors(background, color, glow), white, core * 0.34);
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

function renderFlameColor(clip: Clip, localTimeMs: number, pixel: PixelAddress): Rgb {
  const ember = parseColor("#300000");
  const base = parseColor(String(clip.params.baseColor ?? "#FF1A00"));
  const mid = parseColor("#FF6200");
  const tip = parseColor(String(clip.params.tipColor ?? "#FFC43A"));
  const white = parseColor("#FFF0B8");
  const cooling = typeof clip.params.cooling === "number" ? clamp(clip.params.cooling, 0, 1) : 0.24;
  const speed = typeof clip.params.speed === "number" ? Math.max(0.001, clip.params.speed) : 1.15;
  const turbulence = typeof clip.params.turbulence === "number" ? clamp(clip.params.turbulence, 0, 1) : 0.68;
  const height = typeof clip.params.height === "number" ? clamp(clip.params.height, 0.1, 1) : 0.96;
  const time = localTimeMs * 0.001 * speed;
  const x = pixel.normalizedX;
  const y = 1 - pixel.normalizedY;
  const distanceFromBase = y;
  const proximityToBase = 1 - y;
  const sway = (fbm(x * 1.6 + time * 0.55, y * 1.2 - time * 0.2) - 0.5) * turbulence * 0.5;
  const warpedX = x + sway;
  const rolling = fbm(warpedX * 4.4, y * 5.4 - time * 1.65);
  const rising = fbm(warpedX * 2.2 + time * 0.1, y * 3.1 - time * 1.1);
  const fine = fbm(warpedX * 13.0 + time * 0.35, y * 10.0 - time * 2.9);
  const heightMask = 1 - smoothstep(height, 1, distanceFromBase);
  const edgeMask = smoothstep(0.04, 0.22, x) * (1 - smoothstep(0.78, 0.96, x));
  const tongues = smoothstep(0.42, 0.82, rolling + proximityToBase * 0.22) * heightMask;
  const columns = smoothstep(0.48, 0.88, rising) * heightMask * edgeMask;
  const core = smoothstep(0.25, 0.95, 1 - Math.abs(warpedX - 0.5) * 1.35);
  const baseGlow = Math.pow(proximityToBase, 1.45);
  const heat = clamp(baseGlow * 0.86 + tongues * 0.72 + columns * 0.5 + core * 0.12 + fine * 0.16 - cooling * distanceFromBase * 0.24, 0, 1);
  const color = heat < 0.34
    ? mixColors(ember, base, heat / 0.34)
    : heat < 0.72
      ? mixColors(base, mid, (heat - 0.34) / 0.38)
      : heat < 0.94
        ? mixColors(mid, tip, (heat - 0.72) / 0.22)
        : mixColors(tip, white, (heat - 0.94) / 0.06);
  return scaleColor(color, 0.12 + smoothstep(0.02, 1, heat) * 0.88);
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

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fbm(x: number, y: number) {
  return (
    pseudoNoise(x, y) * 0.5 +
    pseudoNoise(x * 2.03 + 11.7, y * 2.01 - 6.3) * 0.3 +
    pseudoNoise(x * 4.01 - 3.1, y * 4.07 + 19.8) * 0.2
  );
}

function range(length: number) {
  return Array.from({ length }, (_, index) => index);
}

function pixelKey(address: PixelAddress) {
  return `${address.chainId}:${address.index}`;
}

function normalizePixelMap(partitura: Partitura): SpatialPixel[] {
  if (partitura.pixelMap?.length) return partitura.pixelMap.slice().sort((left, right) => left.order - right.order);
  let order = 0;
  return partitura.segments.flatMap((segment) => {
    const chain = partitura.chains.find((entry) => entry.id === segment.chainId);
    if (!chain) return [];
    const indexes = range(segment.length).map((offset) => segment.start + offset);
    const directed = segment.reverse ? indexes.reverse() : indexes;
    return directed.map((index, offset) => ({
      id: `${segment.id}_${offset}`,
      chainId: chain.id,
      output: chain.output,
      index,
      segmentId: segment.id,
      x: (segment.x ?? segment.start) + offset * (segment.stepX ?? 1),
      y: (segment.y ?? 0) + offset * (segment.stepY ?? 0),
      order: order++
    }));
  });
}

function withNormalizedCoordinates(pixels: Array<SpatialPixel | PixelAddress>): PixelAddress[] {
  if (!pixels.length) return [];
  const minX = Math.min(...pixels.map((pixel) => pixel.x));
  const maxX = Math.max(...pixels.map((pixel) => pixel.x));
  const minY = Math.min(...pixels.map((pixel) => pixel.y));
  const maxY = Math.max(...pixels.map((pixel) => pixel.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return pixels
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((pixel) => ({
      ...pixel,
      normalizedX: (pixel.x - minX) / width,
      normalizedY: (pixel.y - minY) / height
    }));
}

function pseudoNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hashNoise(xi, yi);
  const b = hashNoise(xi + 1, yi);
  const c = hashNoise(xi, yi + 1);
  const d = hashNoise(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function hashNoise(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}
