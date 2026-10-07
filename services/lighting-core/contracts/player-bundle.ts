export const VISUAL_SCENE_VERSION = "visual-scene.v1" as const;
export const PLAYER_BUNDLE_VERSION = "player-bundle.v1" as const;
export const PLAYER_RUNTIME_VERSION = "1.0.0" as const;

export type VisualPoint = {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};

export type VisualContour = {
  points: VisualPoint[];
  pathMode: "straight" | "bezier";
};

export type VisualShape = {
  id: string;
  name: string;
  kind: "zone" | "channel" | "face-graphic" | "build-area";
  primitive: "rectangle" | "ellipse" | "path";
  x: number;
  y: number;
  width: number;
  height: number;
  contours: VisualContour[];
  fillRule: "evenodd" | "nonzero";
  passMode?: "opaque" | "clear" | "translucent";
  filterColor?: string;
};

export type VisualOpticalTreatment = {
  id: string;
  targetType: "zone" | "channel";
  targetId: string;
  pixelIndices: number[];
  mode: "front" | "halo" | "wall_wash";
  material: "none" | "silicone" | "milky_white" | "day_night" | "opaque";
  intensity: number;
  sourceDistanceCm: number;
  softnessCm: number;
  spreadCm: number;
  throwCm: number;
  beamAngleDeg: number;
  directionDeg: number;
  falloff: number;
  transmissionPct: number;
  occludeSource: boolean;
  faceColor: string;
};

export type VisualSceneV1 = {
  version: typeof VISUAL_SCENE_VERSION;
  sourceChecksum: `sha256:${string}`;
  bounds: { widthCm: number; heightCm: number };
  addressablePixelsPerMeter: number;
  pixels: Array<{ index: number; x: number; y: number; tangentDeg: number }>;
  shapes: VisualShape[];
  treatments: VisualOpticalTreatment[];
  defaultCamera: { x: number; y: number; width: number; height: number };
  presentation: { mode: "as_built" | "led_map"; aspectRatio: number; background: "day" | "night" };
  assets: Array<{ id: string; mediaType: string; checksum: `sha256:${string}`; path: string; byteSize: number }>;
};

export type PlayerBundleAsset = {
  path: string;
  mediaType: string;
  byteSize: number;
  checksum: `sha256:${string}`;
};

export type PlayerBundleManifestV1 = {
  version: typeof PLAYER_BUNDLE_VERSION;
  bundleHash: `sha256:${string}`;
  requiredRuntimeVersion: typeof PLAYER_RUNTIME_VERSION;
  sourceChecksum: `sha256:${string}`;
  privacy: "private" | "review" | "unlisted" | "public";
  defaultScene: string;
  scenes: Array<{ id: string; name: string; durationMs: number; loop: boolean }>;
  defaultCamera: VisualSceneV1["defaultCamera"];
  assets: {
    partitura: PlayerBundleAsset;
    visualScene: PlayerBundleAsset;
    textures: PlayerBundleAsset[];
  };
};
