import { effectRenderers } from "../domain/effects/catalog.js";
import { clamp, clampByte, modulo } from "../domain/effects/math.js";
import type { EffectPixel, Rgb } from "../domain/effects/module.js";
import { Clip, EffectCoordinateSpace, Partitura, PartituraTarget, SpatialPixel } from "../domain/partituras/types.js";
import { validatePartitura } from "../validators/partitura-validator.js";

export type { Rgb } from "../domain/effects/module.js";

export type PixelAddress = EffectPixel;

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
    const addresses = resolveTarget(partitura, target, clip.coordinateSpace);
    const localTimeMs = sceneTime - clip.startMs;
    const progress = clamp(localTimeMs / clip.durationMs, 0, 1);
    const render = effectRenderers[clip.effect] ?? effectRenderers.off;

    addresses.forEach((address, index) => {
      const color = render({ params: clip.params, progress, localTimeMs, index, total: addresses.length, pixel: address });
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
    pixels: Array.from(buffer.values()).sort((left, right) => left.output - right.output || left.serialIndex - right.serialIndex)
  };
}

export function resolveTarget(partitura: Partitura, target: PartituraTarget, coordinateSpace: EffectCoordinateSpace = "local"): PixelAddress[] {
  const pixelMap = normalizePixelMap(partitura);

  if (target.type === "installation") {
    return withNormalizedCoordinates(pixelMap, coordinateSpace === "global" ? pixelMap : pixelMap);
  }
  const ids = target.type === "zone"
    ? new Set(partitura.zones.find((zone) => zone.id === target.id)?.pixelIds ?? [])
    : resolveGroupPixelIds(partitura, target.id);
  const selected = pixelMap.filter((pixel) => ids.has(pixel.id));
  return withNormalizedCoordinates(selected, coordinateSpace === "global" ? pixelMap : selected);
}

function resolveGroupPixelIds(partitura: Partitura, groupId: string, visited = new Set<string>()): Set<string> {
  if (visited.has(groupId)) return new Set();
  visited.add(groupId);
  const group = partitura.groups.find((entry) => entry.id === groupId);
  const ids = new Set<string>();
  group?.members.forEach((member) => {
    if (member.type === "zone") partitura.zones.find((zone) => zone.id === member.id)?.pixelIds.forEach((id) => ids.add(id));
    else resolveGroupPixelIds(partitura, member.id, visited).forEach((id) => ids.add(id));
  });
  return ids;
}

function clipIsActive(clip: Clip, timeMs: number) {
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
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

function pixelKey(address: PixelAddress) {
  return `${address.output}:${address.serialIndex}`;
}

function normalizePixelMap(partitura: Partitura): SpatialPixel[] {
  return partitura.pixelMap.slice().sort((left, right) => left.output - right.output || left.serialIndex - right.serialIndex);
}

function withNormalizedCoordinates(pixels: Array<SpatialPixel | PixelAddress>, coordinateBounds = pixels): PixelAddress[] {
  if (!pixels.length) return [];
  const minX = Math.min(...coordinateBounds.map((pixel) => pixel.x));
  const maxX = Math.max(...coordinateBounds.map((pixel) => pixel.x));
  const minY = Math.min(...coordinateBounds.map((pixel) => pixel.y));
  const maxY = Math.max(...coordinateBounds.map((pixel) => pixel.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return pixels
    .slice()
    .sort((left, right) => left.output - right.output || left.serialIndex - right.serialIndex)
    .map((pixel) => ({
      ...pixel,
      normalizedX: (pixel.x - minX) / width,
      normalizedY: (pixel.y - minY) / height
    }));
}
