import { effectRenderers } from "../domain/effects/catalog.js";
import { clamp, clampByte, modulo } from "../domain/effects/math.js";
import type { EffectPixel, EffectRenderContext, EffectRenderer, Rgb } from "../domain/effects/module.js";
import type { BlendMode, EffectParams, Partitura, PartituraTarget } from "../domain/partituras/types.js";
import { validatePartitura } from "../validators/partitura-validator.js";

export type { Rgb } from "../domain/effects/module.js";

export type FramePixel = EffectPixel & {
  index: number;
  color: Rgb;
};

export type RenderFrame = {
  sceneId: string;
  timeMs: number;
  pixels: FramePixel[];
};

type PreparedClip = {
  startMs: number;
  endMs: number;
  durationMs: number;
  layer: number;
  blend: BlendMode;
  params: EffectParams;
  indices: Uint32Array;
  normalizedX: Float32Array;
  normalizedY: Float32Array;
  render: EffectRenderer;
};

type PreparedScene = {
  id: string;
  loop: boolean;
  durationMs: number;
  clips: PreparedClip[];
};

export type PreparedPartituraRuntime = {
  readonly partitura: Partitura;
  readonly pixelCount: number;
  readonly scenes: readonly PreparedScene[];
  readonly sceneIndexById: ReadonlyMap<string, number>;
  readonly output: Uint8Array;
  readonly serialIndex: Uint32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly tangentDeg: Float32Array;
  readonly normalizedX: Float32Array;
  readonly normalizedY: Float32Array;
  readonly stringIds: readonly string[];
  /** Reused evaluator state; one prepared runtime is intentionally single-thread owned. */
  readonly scratch: {
    readonly pixel: EffectPixel;
    readonly context: EffectRenderContext;
    readonly nextColor: Rgb;
    readonly frame: RuntimeFrame;
  };
};

export type RuntimeFrame = {
  sceneId: string;
  timeMs: number;
  colors: Uint8Array;
};

export function preparePartituraRuntime(partitura: Partitura): PreparedPartituraRuntime {
  const validation = validatePartitura(partitura);
  if (!validation.ok) {
    throw new Error(`Cannot prepare invalid partitura: ${validation.errors[0]?.message ?? "unknown error"}`);
  }

  const pixelCount = partitura.pixelMap.length;
  const output = new Uint8Array(pixelCount);
  const serialIndex = new Uint32Array(pixelCount);
  const x = new Float32Array(pixelCount);
  const y = new Float32Array(pixelCount);
  const tangentDeg = new Float32Array(pixelCount);
  const normalizedX = new Float32Array(pixelCount);
  const normalizedY = new Float32Array(pixelCount);
  const stringIds = new Array<string>(pixelCount);

  for (const pixel of partitura.pixelMap) {
    const index = pixel.index;
    output[index] = pixel.output;
    serialIndex[index] = pixel.serialIndex;
    x[index] = pixel.x;
    y[index] = pixel.y;
    tangentDeg[index] = pixel.tangentDeg;
    normalizedX[index] = pixel.normalizedX;
    normalizedY[index] = pixel.normalizedY;
    stringIds[index] = pixel.stringId;
  }

  const allIndices = Uint32Array.from({ length: pixelCount }, (_, index) => index);
  const zoneIndices = new Map(partitura.zones.map((zone) => [zone.id, Uint32Array.from(zone.pixelIndices)]));
  const groupIndices = new Map(partitura.groups.map((group) => [group.id, Uint32Array.from(group.pixelIndices)]));
  const resolveTarget = (target: PartituraTarget) => target.type === "installation"
    ? allIndices
    : target.type === "zone"
      ? zoneIndices.get(target.id) ?? new Uint32Array()
      : groupIndices.get(target.id) ?? new Uint32Array();

  const scenes = partitura.scenes.map<PreparedScene>((scene) => ({
    id: scene.id,
    loop: scene.loop,
    durationMs: scene.durationMs,
    clips: scene.tracks
      .flatMap((track) => track.clips.map((clip) => {
        const indices = resolveTarget(clip.target ?? track.target);
        const coordinates = prepareCoordinates(indices, clip.coordinateSpace, x, y, normalizedX, normalizedY);
        return {
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          durationMs: clip.durationMs,
          layer: clip.layer,
          blend: clip.blend,
          params: clip.params,
          indices,
          normalizedX: coordinates.normalizedX,
          normalizedY: coordinates.normalizedY,
          render: effectRenderers[clip.effect]
        };
      }))
      .sort((left, right) => left.layer - right.layer || left.startMs - right.startMs)
  }));

  const pixel: EffectPixel = {
    output: 0,
    serialIndex: 0,
    stringId: "",
    x: 0,
    y: 0,
    tangentDeg: 0,
    normalizedX: 0,
    normalizedY: 0
  };
  const context: EffectRenderContext = {
    params: {},
    progress: 0,
    localTimeMs: 0,
    index: 0,
    total: 0,
    pixel
  };

  return {
    partitura,
    pixelCount,
    scenes,
    sceneIndexById: new Map(scenes.map((scene, index) => [scene.id, index])),
    output,
    serialIndex,
    x,
    y,
    tangentDeg,
    normalizedX,
    normalizedY,
    stringIds,
    scratch: {
      pixel,
      context,
      nextColor: { r: 0, g: 0, b: 0 },
      frame: { sceneId: "", timeMs: 0, colors: new Uint8Array(0) }
    }
  };
}

export function createFrameBuffer(runtime: PreparedPartituraRuntime) {
  return new Uint8Array(runtime.pixelCount * 3);
}

/**
 * Evaluate one scene directly into a caller-owned RGB buffer.
 *
 * The runtime is validated and indexed once by `preparePartituraRuntime`.
 * This function performs no schema validation, target traversal or sorting.
 */
export function renderFrameInto(
  runtime: PreparedPartituraRuntime,
  sceneId: string,
  timeMs: number,
  colors: Uint8Array
): RuntimeFrame {
  if (colors.length !== runtime.pixelCount * 3) {
    throw new Error(`RGB frame buffer must contain ${runtime.pixelCount * 3} bytes.`);
  }
  const sceneIndex = runtime.sceneIndexById.get(sceneId);
  if (sceneIndex === undefined) throw new Error(`Scene ${sceneId} does not exist.`);
  const scene = runtime.scenes[sceneIndex];
  const sceneTime = scene.loop ? modulo(timeMs, scene.durationMs) : Math.min(Math.max(0, timeMs), scene.durationMs);
  colors.fill(0);

  const { pixel, context, nextColor, frame } = runtime.scratch;

  for (const clip of scene.clips) {
    if (sceneTime < clip.startMs || sceneTime >= clip.endMs) continue;
    const localTimeMs = sceneTime - clip.startMs;
    context.params = clip.params;
    context.localTimeMs = localTimeMs;
    context.progress = clamp(localTimeMs / clip.durationMs, 0, 1);
    context.total = clip.indices.length;

    for (let targetIndex = 0; targetIndex < clip.indices.length; targetIndex += 1) {
      const index = clip.indices[targetIndex];
      context.index = targetIndex;
      pixel.output = runtime.output[index];
      pixel.serialIndex = runtime.serialIndex[index];
      pixel.stringId = runtime.stringIds[index];
      pixel.x = runtime.x[index];
      pixel.y = runtime.y[index];
      pixel.tangentDeg = runtime.tangentDeg[index];
      pixel.normalizedX = clip.normalizedX[targetIndex];
      pixel.normalizedY = clip.normalizedY[targetIndex];
      const next = clip.render(context, nextColor);
      composeInto(colors, index * 3, next, clip.blend, clip.params);
    }
  }

  frame.sceneId = scene.id;
  frame.timeMs = sceneTime;
  frame.colors = colors;
  return frame;
}

/** Diagnostic/object projection; interactive playback must use renderFrameInto. */
export function renderSceneFrame(partitura: Partitura, sceneId: string, timeMs: number): RenderFrame {
  const runtime = preparePartituraRuntime(partitura);
  const frame = renderFrameInto(runtime, sceneId, timeMs, createFrameBuffer(runtime));
  return {
    sceneId: frame.sceneId,
    timeMs: frame.timeMs,
    pixels: partitura.pixelMap.map((source) => ({
      index: source.index,
      output: source.output,
      serialIndex: source.serialIndex,
      stringId: source.stringId,
      x: source.x,
      y: source.y,
      tangentDeg: source.tangentDeg,
      normalizedX: source.normalizedX,
      normalizedY: source.normalizedY,
      color: {
        r: frame.colors[source.index * 3],
        g: frame.colors[source.index * 3 + 1],
        b: frame.colors[source.index * 3 + 2]
      }
    }))
  };
}

function prepareCoordinates(
  indices: Uint32Array,
  coordinateSpace: "serial" | "local" | "global",
  x: Float32Array,
  y: Float32Array,
  globalX: Float32Array,
  globalY: Float32Array
) {
  const preparedX = new Float32Array(indices.length);
  const preparedY = new Float32Array(indices.length);
  if (coordinateSpace === "global") {
    indices.forEach((index, targetIndex) => {
      preparedX[targetIndex] = globalX[index];
      preparedY[targetIndex] = globalY[index];
    });
    return { normalizedX: preparedX, normalizedY: preparedY };
  }
  if (coordinateSpace === "serial") {
    const denominator = Math.max(1, indices.length - 1);
    indices.forEach((_, targetIndex) => {
      preparedX[targetIndex] = targetIndex / denominator;
      preparedY[targetIndex] = 0;
    });
    return { normalizedX: preparedX, normalizedY: preparedY };
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  indices.forEach((index) => {
    minX = Math.min(minX, x[index]);
    maxX = Math.max(maxX, x[index]);
    minY = Math.min(minY, y[index]);
    maxY = Math.max(maxY, y[index]);
  });
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  indices.forEach((index, targetIndex) => {
    preparedX[targetIndex] = (x[index] - minX) / width;
    preparedY[targetIndex] = (y[index] - minY) / height;
  });
  return { normalizedX: preparedX, normalizedY: preparedY };
}

function composeInto(colors: Uint8Array, offset: number, next: Rgb, blend: BlendMode, params: EffectParams) {
  const r = clampByte(next.r);
  const g = clampByte(next.g);
  const b = clampByte(next.b);
  if (blend === "add") {
    colors[offset] = clampByte(colors[offset] + r);
    colors[offset + 1] = clampByte(colors[offset + 1] + g);
    colors[offset + 2] = clampByte(colors[offset + 2] + b);
    return;
  }
  if (blend === "max") {
    colors[offset] = Math.max(colors[offset], r);
    colors[offset + 1] = Math.max(colors[offset + 1], g);
    colors[offset + 2] = Math.max(colors[offset + 2], b);
    return;
  }
  if (blend === "multiply") {
    colors[offset] = clampByte((colors[offset] * r) / 255);
    colors[offset + 1] = clampByte((colors[offset + 1] * g) / 255);
    colors[offset + 2] = clampByte((colors[offset + 2] * b) / 255);
    return;
  }
  if (blend === "alpha") {
    const alpha = typeof params.opacity === "number" ? clamp(params.opacity, 0, 1) : 1;
    colors[offset] = clampByte(colors[offset] + (r - colors[offset]) * alpha);
    colors[offset + 1] = clampByte(colors[offset + 1] + (g - colors[offset + 1]) * alpha);
    colors[offset + 2] = clampByte(colors[offset + 2] + (b - colors[offset + 2]) * alpha);
    return;
  }
  if (blend === "mask") {
    const mask = Math.max(r, g, b) / 255;
    colors[offset] = clampByte(colors[offset] * mask);
    colors[offset + 1] = clampByte(colors[offset + 1] * mask);
    colors[offset + 2] = clampByte(colors[offset + 2] * mask);
    return;
  }
  colors[offset] = r;
  colors[offset + 1] = g;
  colors[offset + 2] = b;
}
