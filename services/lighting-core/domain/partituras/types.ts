export const PARTITURA_SCHEMA_VERSION = "partitura.v1" as const;
export const SUPPORTED_CORE_VERSION = "0.1.0" as const;
export const LOGICAL_OUTPUTS = [1, 2, 3] as const;

export type PartituraSchemaVersion = typeof PARTITURA_SCHEMA_VERSION;
export type LogicalOutput = (typeof LOGICAL_OUTPUTS)[number];
export type ChainDirection = "forward" | "reverse";
export type TargetType = "installation" | "chain" | "segment" | "zone";
export type ZoneDistribution = "simultaneous" | "sequential" | "continuous" | "mirror" | "staggered";
export type BlendMode = "replace" | "add" | "max" | "multiply" | "alpha" | "mask";
export type EffectId = "off" | "solid" | "fade" | "pulse" | "chase" | "toggle" | "flame" | "spatial_fill" | "spatial_wave";

export type RgbColor = `#${string}`;

export type PartituraTarget =
  | { type: "installation" }
  | { type: "chain"; id: string }
  | { type: "segment"; id: string }
  | { type: "zone"; id: string };

export type ChainGeometryPoint = {
  x: number;
  y: number;
  ledIndex?: number;
};

export type ChainWireJump = {
  afterLedIndex: number;
  lengthMm?: number;
  note?: string;
};

export type Chain = {
  id: string;
  name: string;
  output: LogicalOutput;
  pixelCount: number;
  direction: ChainDirection;
  densityPixelsPerMeter?: number;
  geometry?: ChainGeometryPoint[];
  wireJumps?: ChainWireJump[];
};

export type Segment = {
  id: string;
  name: string;
  chainId: string;
  start: number;
  length: number;
  reverse?: boolean;
  x?: number;
  y?: number;
  stepX?: number;
  stepY?: number;
};

export type Zone = {
  id: string;
  name: string;
  segments: string[];
  zones?: string[];
  distribution?: ZoneDistribution;
};

export type SpatialPixel = {
  id: string;
  chainId: string;
  output: LogicalOutput;
  index: number;
  segmentId?: string;
  x: number;
  y: number;
  order: number;
};

export type EffectParameterValue = string | number | boolean | null | string[] | number[];
export type EffectParams = Record<string, EffectParameterValue>;

export type Clip = {
  id: string;
  effect: EffectId | string;
  target?: PartituraTarget;
  startMs: number;
  durationMs: number;
  layer: number;
  blend: BlendMode;
  params: EffectParams;
  repeat?: number | "forever";
  markers?: Record<string, number>;
};

export type Track = {
  id: string;
  name: string;
  target: PartituraTarget;
  clips: Clip[];
};

export type Scene = {
  id: string;
  name: string;
  loop: boolean;
  durationMs: number;
  tracks: Track[];
};

export type Partitura = {
  schemaVersion: PartituraSchemaVersion;
  projectId: string;
  requiredCoreVersion: string;
  defaultScene: string;
  chains: Chain[];
  segments: Segment[];
  pixelMap?: SpatialPixel[];
  zones: Zone[];
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

export type EffectDefinition = {
  id: EffectId;
  label: string;
  description: string;
  family?: "linear" | "spatial" | "utility";
  parameters: Record<string, EffectParameterDefinition>;
};

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};
