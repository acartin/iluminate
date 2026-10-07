import type { ClipForm, DesignerForm } from "@/lib/lighting/partitura-model";
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

/** Keeps an explicitly selected clip, otherwise selects the first clip for the canvas target. */
export function clipIdForSelectedTargets(clips: ClipForm[], selectedClipId: string | undefined, targetIds: string[]) {
  if (!targetIds.length) return selectedClipId;
  const targets = new Set(targetIds);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId);
  if (selectedClip && targets.has(selectedClip.target)) return selectedClip.id;
  return clips.find((clip) => targets.has(clip.target))?.id ?? selectedClipId;
}
