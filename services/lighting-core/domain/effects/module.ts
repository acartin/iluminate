import type { EffectDefinition, EffectParams } from "../partituras/types.js";

export type Rgb = {
  r: number;
  g: number;
  b: number;
};

/** Minimal per-pixel spatial address resolved for a clip target. */
export type EffectPixel = {
  output: number;
  serialIndex: number;
  stringId: string;
  x: number;
  y: number;
  tangentDeg: number;
  normalizedX: number;
  normalizedY: number;
};

export type EffectRenderContext = {
  /** Raw clip parameters, already validated against the effect definition. */
  params: EffectParams;
  /** Normalized clip progress, 0..1. */
  progress: number;
  /** Milliseconds since the clip started. */
  localTimeMs: number;
  /** Index of this pixel inside the resolved target. */
  index: number;
  /** Number of pixels in the resolved target. */
  total: number;
  /** Spatial address of this pixel. */
  pixel: EffectPixel;
};

export type EffectRenderer = (context: EffectRenderContext) => Rgb;

/** One effect owns its metadata and its renderer. Add a file, register it, done. */
export type EffectModule = {
  definition: EffectDefinition;
  render: EffectRenderer;
};
