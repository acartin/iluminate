import {
  BlendMode,
  Chain,
  Clip,
  EffectParams,
  PARTITURA_SCHEMA_VERSION,
  Partitura,
  PartituraTarget,
  Scene,
  Segment,
  SUPPORTED_CORE_VERSION,
  Track,
  Zone
} from "../domain/partituras/types.js";

export type SegmentConfig = Omit<Segment, "name"> & { name?: string };
export type ChainConfig = Omit<Chain, "name" | "direction"> & {
  name?: string;
  direction?: Chain["direction"];
  segments?: Array<Omit<SegmentConfig, "chainId">>;
};
export type ZoneConfig = Omit<Zone, "name"> & { name?: string };
export type ClipConfig = Omit<Clip, "id" | "layer" | "blend" | "params"> & {
  id?: string;
  layer?: number;
  blend?: BlendMode;
  params?: EffectParams;
};
export type TrackConfig = Omit<Track, "name" | "clips"> & {
  name?: string;
  clips?: ClipConfig[];
};
export type SceneConfig = Omit<Scene, "name" | "tracks" | "durationMs"> & {
  name?: string;
  durationMs?: number;
  tracks?: TrackConfig[];
};

export type GeneratePartituraInput = {
  projectId: string;
  requiredCoreVersion?: string;
  defaultScene?: string;
  chains: ChainConfig[];
  segments?: SegmentConfig[];
  zones: ZoneConfig[];
  scenes?: SceneConfig[];
  metadata?: Partitura["metadata"];
};

export function generatePartitura(input: GeneratePartituraInput): Partitura {
  const chains = input.chains.map<Chain>((chain) => ({
    id: chain.id,
    name: chain.name ?? chain.id,
    output: chain.output,
    pixelCount: chain.pixelCount,
    direction: chain.direction ?? "forward",
    densityPixelsPerMeter: chain.densityPixelsPerMeter,
    geometry: chain.geometry,
    wireJumps: chain.wireJumps
  }));

  const nestedSegments = input.chains.flatMap((chain) =>
    (chain.segments ?? []).map<Segment>((segment) => ({
      id: segment.id,
      name: segment.name ?? segment.id,
      chainId: chain.id,
      start: segment.start,
      length: segment.length,
      reverse: segment.reverse
    }))
  );

  const explicitSegments = (input.segments ?? []).map<Segment>((segment) => ({
    id: segment.id,
    name: segment.name ?? segment.id,
    chainId: segment.chainId,
    start: segment.start,
    length: segment.length,
    reverse: segment.reverse
  }));

  const zones = input.zones.map<Zone>((zone) => ({
    id: zone.id,
    name: zone.name ?? zone.id,
    segments: zone.segments,
    zones: zone.zones,
    distribution: zone.distribution ?? "simultaneous"
  }));

  const defaultScene = input.defaultScene ?? input.scenes?.[0]?.id ?? "default";
  const scenes = input.scenes?.length ? input.scenes.map(normalizeScene) : [createDefaultScene(defaultScene)];

  return {
    schemaVersion: PARTITURA_SCHEMA_VERSION,
    projectId: input.projectId,
    requiredCoreVersion: input.requiredCoreVersion ?? SUPPORTED_CORE_VERSION,
    defaultScene,
    chains,
    segments: [...nestedSegments, ...explicitSegments],
    zones,
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

  return {
    id: scene.id,
    name: scene.name ?? scene.id,
    loop: scene.loop,
    durationMs: scene.durationMs ?? inferSceneDurationMs(tracks),
    tracks
  };
}

function normalizeClip(clip: ClipConfig, index: number): Clip {
  return {
    id: clip.id ?? `clip_${index + 1}`,
    effect: clip.effect,
    target: clip.target,
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
  const installationTarget: PartituraTarget = { type: "installation" };

  return {
    id,
    name: id,
    loop: true,
    durationMs: 1000,
    tracks: [
      {
        id: "track_installation",
        name: "Installation",
        target: installationTarget,
        clips: [
          {
            id: "clip_off",
            effect: "off",
            startMs: 0,
            durationMs: 1000,
            layer: 0,
            blend: "replace",
            params: {}
          }
        ]
      }
    ]
  };
}

function inferSceneDurationMs(tracks: Track[]) {
  return Math.max(
    1,
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs))
  );
}
