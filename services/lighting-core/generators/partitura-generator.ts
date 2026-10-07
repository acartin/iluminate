import {
  BlendMode,
  Clip,
  EffectCoordinateSpace,
  EffectParams,
  Output,
  PARTITURA_SCHEMA_VERSION,
  Partitura,
  PartituraTarget,
  Scene,
  SUPPORTED_CORE_VERSION,
  Track,
  Zone
} from "../domain/partituras/types.js";

export type OutputConfig = Omit<Output, "name"> & { name?: string };
export type PixelConfig = {
  id: string;
  output: Output["output"];
  serialIndex: number;
  stringId: string;
  routeOffsetCm: number;
  x: number;
  y: number;
  tangentDeg: number;
};
export type ZoneConfig = { id: string; name?: string; pixelIds: string[] };
export type GroupMemberConfig = { type: "zone" | "group"; id: string };
export type GroupConfig = { id: string; name?: string; members: GroupMemberConfig[] };
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
  sourceChecksum: Partitura["sourceChecksum"];
  requiredCoreVersion?: string;
  defaultScene?: string;
  outputs: OutputConfig[];
  pixelMap: PixelConfig[];
  zones: ZoneConfig[];
  groups?: GroupConfig[];
  scenes?: SceneConfig[];
  metadata?: Partitura["metadata"];
};

export function generatePartitura(input: GeneratePartituraInput): Partitura {
  const outputs = input.outputs.map((output) => ({ ...output, name: output.name ?? output.id }));
  const sortedPixels = input.pixelMap
    .map((pixel) => ({ ...pixel }))
    .sort((left, right) => left.output - right.output || left.serialIndex - right.serialIndex);
  const bounds = coordinateBounds(sortedPixels);
  const pixelMap = sortedPixels.map((pixel, index) => ({
    ...pixel,
    index,
    normalizedX: (pixel.x - bounds.minX) / bounds.width,
    normalizedY: (pixel.y - bounds.minY) / bounds.height
  }));
  const pixelIndexById = new Map(pixelMap.map((pixel) => [pixel.id, pixel.index]));
  const zones = input.zones.map((zone) => ({
    id: zone.id,
    name: zone.name ?? zone.id,
    pixelIndices: uniqueSortedIndices(zone.pixelIds.flatMap((id) => {
      const index = pixelIndexById.get(id);
      return index === undefined ? [] : [index];
    }))
  }));
  const groups = flattenGroups(input.groups ?? [], zones);
  const defaultScene = input.defaultScene ?? input.scenes?.[0]?.id ?? "default";
  const scenes = input.scenes?.length ? input.scenes.map(normalizeScene) : [createDefaultScene(defaultScene)];

  return {
    schemaVersion: PARTITURA_SCHEMA_VERSION,
    projectId: input.projectId,
    sourceChecksum: input.sourceChecksum,
    requiredCoreVersion: input.requiredCoreVersion ?? SUPPORTED_CORE_VERSION,
    defaultScene,
    outputs,
    pixelMap,
    zones,
    groups,
    scenes,
    metadata: input.metadata
  };
}

function coordinateBounds(pixels: PixelConfig[]) {
  if (!pixels.length) return { minX: 0, minY: 0, width: 1, height: 1 };
  const minX = Math.min(...pixels.map((pixel) => pixel.x));
  const maxX = Math.max(...pixels.map((pixel) => pixel.x));
  const minY = Math.min(...pixels.map((pixel) => pixel.y));
  const maxY = Math.max(...pixels.map((pixel) => pixel.y));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function flattenGroups(groups: GroupConfig[], zones: Zone[]) {
  const zonePixels = new Map(zones.map((zone) => [zone.id, zone.pixelIndices]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const memo = new Map<string, number[]>();
  const resolve = (id: string, trail: string[] = []): number[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (trail.includes(id)) return [];
    const group = groupById.get(id);
    if (!group) return [];
    const indices = uniqueSortedIndices(group.members.flatMap((member) => member.type === "zone"
      ? zonePixels.get(member.id) ?? []
      : resolve(member.id, [...trail, id])));
    memo.set(id, indices);
    return indices;
  };
  return groups.map((group) => ({ id: group.id, name: group.name ?? group.id, pixelIndices: resolve(group.id) }));
}

function uniqueSortedIndices(indices: number[]) {
  return Array.from(new Set(indices)).sort((left, right) => left - right);
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
