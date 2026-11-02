import type { BlendMode, PartituraTarget } from "@iluminate/lighting-core";
import { sceneTrackTarget, type SceneForm } from "@/lib/lighting/partitura-model";
import { resolveGeneratedPartituraTarget } from "@/lib/lighting/generated-partitura-target";

type NamedCompiledTargetLayout = {
  zones: Array<{ id: string; name?: string }>;
  groups: Array<{ id: string; name?: string }>;
};

export type GeneratedTrackInput = {
  id: string;
  name: string;
  target: PartituraTarget;
  clips: Array<{
    id: string;
    name: string;
    effect: string;
    target?: PartituraTarget;
    coordinateSpace: "serial" | "local" | "global";
    startMs: number;
    durationMs: number;
    layer: number;
    blend: BlendMode;
    params: Record<string, string | number | boolean | null | string[] | number[]>;
  }>;
};

export function buildGeneratedPartituraTracks(
  scene: SceneForm,
  layout: NamedCompiledTargetLayout,
  disabledSourceIds: ReadonlySet<string>
): GeneratedTrackInput[] {
  const laneCount = Math.max(scene.laneCount ?? 1, ...scene.clips.map((clip) => clip.layer + 1));
  return Array.from({ length: laneCount }, (_, layer) => layer).flatMap((layer) => {
    const fixedTargetId = sceneTrackTarget(scene, layer);
    const clips = scene.clips
      .filter((clip) => {
        const targetId = fixedTargetId ?? clip.target;
        return clip.layer === layer && clip.enabled !== false && !disabledSourceIds.has(targetId);
      })
      .flatMap((clip) => {
        const target = resolveGeneratedPartituraTarget(fixedTargetId ?? clip.target, layout);
        if (!target) return [];
        return [{
          id: clip.id,
          name: clip.name,
          effect: clip.effect,
          ...(fixedTargetId ? {} : { target }),
          coordinateSpace: clip.coordinateSpace ?? "local" as const,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          layer: clip.layer,
          blend: clip.blend as BlendMode,
          params: clip.params
        }];
      });
    if (!clips.length) return [];
    const target = fixedTargetId
      ? resolveGeneratedPartituraTarget(fixedTargetId, layout)
      : clips[0]?.target;
    if (!target) return [];
    return [{
      id: `track_${layer + 1}`,
      name: fixedTargetId ? compiledTargetName(target, layout) ?? `Track ${layer + 1}` : `Track ${layer + 1}`,
      target,
      clips
    }];
  });
}

function compiledTargetName(target: PartituraTarget, layout: NamedCompiledTargetLayout) {
  if (target.type === "installation") return "Installation";
  const targets = target.type === "group" ? layout.groups : layout.zones;
  return targets.find((candidate) => candidate.id === target.id)?.name;
}
