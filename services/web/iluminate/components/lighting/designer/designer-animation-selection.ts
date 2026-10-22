import { designerGlobalLightSourceMode, designerGlobalLightSourceTarget, type ClipForm, type DesignerForm, type DesignerOpticalMode } from "@/lib/lighting/partitura-model";
import type { DesignerSelection } from "./types";

/** Returns every clip target represented by the current canvas selection. */
export function designerClipTargetIdsForSelection(designer: DesignerForm, selection: DesignerSelection) {
  if (!selection) return [];
  if (selection.type === "light_source") return [selection.id];
  if (selection.type !== "zone" && selection.type !== "channel") return [];

  const sourceIds = designer.lightSources
    .filter((source) => source.targetType === selection.type && source.targetId === selection.id)
    .map((source) => source.id);
  return [...sourceIds, selection.id];
}

/** Resolves a clip target to the zone/channel owners that Animate can calibrate. */
export function designerOpticalTargetsForClipTarget(designer: DesignerForm, targetId: string | null) {
  if (!targetId) return [];
  const globalMode = designerGlobalLightSourceMode(targetId);
  const sources = globalMode
    ? designer.lightSources.filter((source) => source.mode === globalMode && source.enabled && source.stringIds.length > 0)
    : designer.lightSources.filter((source) => source.id === targetId);
  const targets = sources.flatMap((source) => {
    const exists = source.targetType === "zone"
      ? designer.zones.some((zone) => zone.id === source.targetId)
      : designer.channels.some((channel) => channel.id === source.targetId);
    return exists ? [{ type: source.targetType, id: source.targetId }] : [];
  });
  if (!globalMode && !sources.length) {
    if (designer.zones.some((zone) => zone.id === targetId)) targets.push({ type: "zone", id: targetId });
    if (designer.channels.some((channel) => channel.id === targetId)) targets.push({ type: "channel", id: targetId });
  }
  return targets.filter((target, index) => targets.findIndex((entry) => entry.type === target.type && entry.id === target.id) === index);
}

/** Keeps each independently addressable source available when creating a clip for one canvas target. */
export function clipTargetsForSelection<T extends { id: string }>(targets: T[], selectedTargetIds: string[]) {
  const selected = new Set(selectedTargetIds);
  return targets.filter((target) => selected.has(target.id));
}

/** Shows only the physical source targeted by a selected clip, while retaining the owner's full setup otherwise. */
export function clipLightSourcesForTarget<T extends { id: string; targetType: "zone" | "channel"; targetId: string; mode: DesignerOpticalMode }>(
  sources: T[],
  owner: { type: "zone" | "channel"; id: string } | null,
  clipTargetId: string | null
) {
  if (!owner) return [];
  const ownerSources = sources.filter((source) => source.targetType === owner.type && source.targetId === owner.id);
  const selectedSource = ownerSources.find((source) => source.id === clipTargetId);
  const globalMode = clipTargetId ? designerGlobalLightSourceMode(clipTargetId) : null;
  if (globalMode) return ownerSources.filter((source) => source.mode === globalMode);
  return selectedSource ? [selectedSource] : ownerSources;
}

/** Restricts a clip's scope choices to its current physical lighting mode. */
export function clipScopeTargets<T extends { id: string; name: string; mode: DesignerOpticalMode; enabled?: boolean; stringIds?: string[] }>(sources: T[], targetId: string) {
  const source = sources.find((entry) => entry.id === targetId);
  const mode = source?.mode ?? designerGlobalLightSourceMode(targetId);
  if (!mode) return [];
  const global = designerGlobalLightSourceTarget(mode);
  return [
    ...sources.filter((entry) => entry.mode === mode && entry.enabled !== false && (!entry.stringIds || entry.stringIds.length > 0)).map((entry) => ({ id: entry.id, name: entry.name })),
    { id: global.id, name: global.name }
  ];
}

/** Keeps an explicitly selected clip, otherwise selects the first clip for the canvas target. */
export function clipIdForSelectedTargets(clips: ClipForm[], selectedClipId: string | undefined, targetIds: string[], selectedClipCompatibleTargetIds: string[] = []) {
  if (!targetIds.length) return undefined;
  const targets = new Set(targetIds);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  if (selectedClip && (targets.has(selectedClip.target) || selectedClipCompatibleTargetIds.some((targetId) => targets.has(targetId)))) return selectedClip.id;
  return clips.find((clip) => targets.has(clip.target))?.id;
}

/** Waits for canvas selection to catch up with an explicit timeline click. */
export function explicitClipTargetSelectionSettled(clips: ClipForm[], clipId: string, targetIds: string[], compatibleTargetIds: string[] = []) {
  const clip = clips.find((entry) => entry.id === clipId);
  if (!clip || !targetIds.length) return true;
  return targetIds.includes(clip.target) || compatibleTargetIds.some((targetId) => targetIds.includes(targetId));
}
