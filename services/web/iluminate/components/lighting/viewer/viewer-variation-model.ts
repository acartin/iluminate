import type { Clip, EffectParams, Partitura } from "@iluminate/lighting-core";

export type ViewerClipOverride = {
  enabled?: boolean;
  removed?: boolean;
  startMs?: number;
  durationMs?: number;
  effect?: string;
  params?: EffectParams;
};

export type ViewerClipOverrides = Record<string, ViewerClipOverride>;

export function viewerClipKey(sceneId: string, trackId: string, clipId: string) {
  return `${sceneId}\u0000${trackId}\u0000${clipId}`;
}

export function materializeViewerPartitura(partitura: Partitura, overrides: ViewerClipOverrides): Partitura {
  return {
    ...partitura,
    scenes: partitura.scenes.map((scene) => ({
      ...scene,
      tracks: scene.tracks.map((track) => ({
        ...track,
        clips: track.clips.flatMap((clip) => {
          const override = overrides[viewerClipKey(scene.id, track.id, clip.id)];
          if (override?.removed || override?.enabled === false) return [];
          const startMs = clampInteger(override?.startMs, 0, Math.max(0, scene.durationMs - 100), clip.startMs);
          const durationMs = clampInteger(override?.durationMs, 100, Math.max(100, scene.durationMs - startMs), clip.durationMs);
          return [{
            ...clip,
            startMs,
            durationMs,
            effect: typeof override?.effect === "string" && override.effect ? override.effect : clip.effect,
            params: override?.params ? cloneParams(override.params) : cloneParams(clip.params)
          }];
        })
      }))
    }))
  };
}

export function clipWithViewerOverride(
  clip: Clip,
  override: ViewerClipOverride | undefined,
  sceneDurationMs: number
): Clip {
  const startMs = clampInteger(override?.startMs, 0, Math.max(0, sceneDurationMs - 100), clip.startMs);
  const durationMs = clampInteger(override?.durationMs, 100, Math.max(100, sceneDurationMs - startMs), clip.durationMs);
  return {
    ...clip,
    startMs,
    durationMs,
    effect: typeof override?.effect === "string" && override.effect ? override.effect : clip.effect,
    params: override?.params ? cloneParams(override.params) : cloneParams(clip.params)
  };
}

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number) {
  const candidate = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(maximum, Math.max(minimum, candidate));
}

function cloneParams(params: EffectParams): EffectParams {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value.slice() as string[] | number[] : value])) as EffectParams;
}
