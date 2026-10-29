import { createClipIdentity, type ClipForm, type PartituraDocument, type SceneForm } from "@/lib/lighting/partitura-model";

export type AnimationDocumentState = Pick<PartituraDocument, "scenes" | "activeSceneId" | "previewTimeMs">;

export function animationDocumentState(document: PartituraDocument): AnimationDocumentState {
  return {
    scenes: document.scenes,
    activeSceneId: document.activeSceneId,
    previewTimeMs: document.previewTimeMs
  };
}

/**
 * Applies timeline-owned state to the latest live document. Animate must never
 * replace Designer construction data from a stale React closure.
 */
export function mergeAnimationDocumentState(
  current: PartituraDocument,
  animation: AnimationDocumentState
): PartituraDocument {
  return {
    ...current,
    scenes: animation.scenes,
    activeSceneId: animation.activeSceneId,
    previewTimeMs: animation.previewTimeMs
  };
}

function nextClipCopyName(clips: ClipForm[], sourceName: string) {
  const base = `${sourceName} Copy`;
  const used = new Set(clips.map((clip) => clip.name));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

function cloneClipParams(params: ClipForm["params"]): ClipForm["params"] {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) as ClipForm["params"];
}

export function duplicateClipAtTrackEnd(scene: SceneForm, source: ClipForm) {
  const layer = Math.max(0, Math.round(source.layer));
  const trackEndMs = scene.clips.reduce((end, clip) => (
    Math.max(0, Math.round(clip.layer)) === layer ? Math.max(end, clip.startMs + clip.durationMs) : end
  ), 0);
  const identity = createClipIdentity(scene.clips);
  const clip: ClipForm = {
    ...source,
    id: identity.id,
    name: nextClipCopyName(scene.clips, source.name),
    startMs: trackEndMs,
    layer,
    params: cloneClipParams(source.params)
  };
  return {
    clip,
    scene: {
      ...scene,
      durationMs: Math.max(scene.durationMs, clip.startMs + clip.durationMs),
      laneCount: Math.max(scene.laneCount ?? 1, layer + 1),
      clips: [...scene.clips, clip]
    }
  };
}
