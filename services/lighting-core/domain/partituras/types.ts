export const PARTITURA_SCHEMA_VERSION = "partitura.v2" as const;
export const SUPPORTED_CORE_VERSION = "1.0.0" as const;
export const LOGICAL_OUTPUTS = [1, 2, 3] as const;

export type PartituraSchemaVersion = typeof PARTITURA_SCHEMA_VERSION;
export type LogicalOutput = (typeof LOGICAL_OUTPUTS)[number];
export type TargetType = "installation" | "zone" | "group";
export type EffectCoordinateSpace = "serial" | "local" | "global";
export type BlendMode = "replace" | "add" | "max" | "multiply" | "alpha" | "mask";
export type EffectId = "off" | "solid" | "fade" | "pulse" | "chase" | "comet" | "wipe" | "toggle" | "flame" | "spatial_fill" | "spatial_wave" | "aurora";
export type RgbColor = `#${string}`;

export type PartituraTarget = { type: "installation" } | { type: "zone"; id: string } | { type: "group"; id: string };

/** A physical addressable output, derived from the controller wiring graph. */
export type Output = { id: string; name: string; output: LogicalOutput; pixelCount: number };

/** One addressable WS28xx pixel, georeferenced from its Designer route. */
export type SpatialPixel = {
  /** Dense, stable index used by firmware, browser buffers and visual artifacts. */
  index: number;
  id: string;
  output: LogicalOutput;
  serialIndex: number;
  stringId: string;
  routeOffsetCm: number;
  x: number;
  y: number;
  tangentDeg: number;
  normalizedX: number;
  normalizedY: number;
};

/** Generated membership is fully resolved at compile time. */
export type Zone = { id: string; name: string; pixelIndices: number[] };
/** Groups are flattened at compile time so playback never traverses a graph. */
export type Group = { id: string; name: string; pixelIndices: number[] };

export type EffectParameterValue = string | number | boolean | null | string[] | number[];
export type EffectParams = Record<string, EffectParameterValue>;

export type Clip = {
  id: string;
  effect: EffectId | string;
  target?: PartituraTarget;
  coordinateSpace: EffectCoordinateSpace;
  startMs: number;
  durationMs: number;
  layer: number;
  blend: BlendMode;
  params: EffectParams;
  repeat?: number | "forever";
  markers?: Record<string, number>;
};

export type Track = { id: string; name: string; target: PartituraTarget; clips: Clip[] };
export type Scene = { id: string; name: string; loop: boolean; durationMs: number; tracks: Track[] };

export type Partitura = {
  schemaVersion: PartituraSchemaVersion;
  projectId: string;
  /** SHA-256 of the compiled source used to derive this immutable artifact. */
  sourceChecksum: `sha256:${string}`;
  requiredCoreVersion: string;
  defaultScene: string;
  outputs: Output[];
  pixelMap: SpatialPixel[];
  zones: Zone[];
  groups: Group[];
  scenes: Scene[];
  metadata?: Record<string, string | number | boolean>;
};

export type EffectParameterDefinition = {
  type: "color" | "number" | "boolean" | "string" | "integer" | "percent" | "select";
  required?: boolean;
  default?: EffectParameterValue;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  options?: Array<{ value: string; label: string }>;
};

export type EffectDefinition = { id: EffectId; label: string; description: string; family?: "linear" | "spatial" | "utility"; parameters: Record<string, EffectParameterDefinition> };
export type ValidationSeverity = "error" | "warning";
export type ValidationIssue = { severity: ValidationSeverity; code: string; path: string; message: string };
export type ValidationResult = { ok: boolean; errors: ValidationIssue[]; warnings: ValidationIssue[] };
