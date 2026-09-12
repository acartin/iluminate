import {
  BlendMode,
  Clip,
  EffectCoordinateSpace,
  EffectParams,
  Group,
  Output,
  PARTITURA_SCHEMA_VERSION,
  Partitura,
  PartituraTarget,
  Scene,
  SpatialPixel,
  SUPPORTED_CORE_VERSION,
  Track,
  Zone
} from "../domain/partituras/types.js";

export type OutputConfig = Omit<Output, "name"> & { name?: string };
export type ZoneConfig = Omit<Zone, "name"> & { name?: string };
export type GroupConfig = Omit<Group, "name"> & { name?: string };
export type ClipConfig = Omit<Clip, "id" | "layer" | "blend" | "params" | "coordinateSpace"> & {
  id?: string;
  layer?: number;
  blend?: BlendMode;
  params?: EffectParams;
  coordinateSpace?: EffectCoordinateSpace;
};
export type TrackConfig = Omit<Track, "name" | "clips"> & { name?: string; clips?: ClipConfig[] };
export type SceneConfig = Omit<Scene, "name" | "tracks" | "durationMs"> & { name?: string; durationMs?: number; tracks?: TrackConfig[] };

export type GeneratePartituraInput = {
  projectId: string;
  requiredCoreVersion?: string;
  defaultScene?: string;
  outputs: OutputConfig[];
  pixelMap: SpatialPixel[];
  zones: ZoneConfig[];
  groups?: GroupConfig[];
  scenes?: SceneConfig[];
  metadata?: Partitura["metadata"];
};

export function generatePartitura(input: GeneratePartituraInput): Partitura {
  const outputs = input.outputs.map((output) => ({ ...output, name: output.name ?? output.id }));
  const zones = input.zones.map((zone) => ({ ...zone, name: zone.name ?? zone.id, pixelIds: Array.from(new Set(zone.pixelIds)) }));
  const groups = (input.groups ?? []).map((group) => ({ ...group, name: group.name ?? group.id }));
  const defaultScene = input.defaultScene ?? input.scenes?.[0]?.id ?? "default";
  const scenes = input.scenes?.length ? input.scenes.map(normalizeScene) : [createDefaultScene(defaultScene)];

  return {
    schemaVersion: PARTITURA_SCHEMA_VERSION,
    projectId: input.projectId,
    requiredCoreVersion: input.requiredCoreVersion ?? SUPPORTED_CORE_VERSION,
    defaultScene,
    outputs,
    pixelMap: input.pixelMap.map((pixel) => ({ ...pixel })),
    zones,
    groups,
    scenes,
    metadata: input.metadata
  };
}

function normalizeScene(scene: SceneConfig): Scene {
  const tracks = (scene.tracks ?? []).map<Track>((track) => ({
    id: track.id,
    name: track.name ?? track.id,
    target: track.target,
    clips: (track.clips ?? []).map((clip, index) => normalizeClip(clip, index))
  }));
  return { id: scene.id, name: scene.name ?? scene.id, loop: scene.loop, durationMs: scene.durationMs ?? inferSceneDurationMs(tracks), tracks };
}

function normalizeClip(clip: ClipConfig, index: number): Clip {
  return {
    id: clip.id ?? `clip_${index + 1}`,
    effect: clip.effect,
    target: clip.target,
    coordinateSpace: clip.coordinateSpace ?? "local",
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    layer: clip.layer ?? 0,
    blend: clip.blend ?? "replace",
    params: clip.params ?? {},
    repeat: clip.repeat,
    markers: clip.markers
  };
}

function createDefaultScene(id: string): Scene {
  const target: PartituraTarget = { type: "installation" };
  return {
    id,
    name: id,
    loop: true,
    durationMs: 1000,
    tracks: [{ id: "track_installation", name: "Installation", target, clips: [{ id: "clip_off", effect: "off", coordinateSpace: "global", startMs: 0, durationMs: 1000, layer: 0, blend: "replace", params: {} }] }]
  };
}

function inferSceneDurationMs(tracks: Track[]) {
  return Math.max(1, ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)));
}
