"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp, CircleDot, Eye, EyeOff, GripVertical, Pause, Pencil, Play, Plus, Search, Sparkles, Trash2, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import { DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS, createClipIdentity, designerGlobalLightSourceMode, parseDesignerGroupLightTargetId, nextEmptyClipLayer, type ClipForm, type ClipParams, type DesignerLightingSide, type PartituraDocument, type SceneForm } from "@/lib/lighting/partitura-model";
import { animationDocumentState, duplicateClipAtTrackEnd, type AnimationDocumentState } from "./designer-animation-clips";
import { animationClipTargetOptions, animationClipTargetSide, clipIdForSelectedTargets, clipScopeTargets, clipTargetsForSelection, designerOpticalTargetsForClipTarget, explicitClipTargetSelectionSettled, type AnimationClipTargetOption } from "./designer-animation-selection";

type Props = {
  document: PartituraDocument;
  effects: Record<string, EffectDefinition>;
  selectedTargetIds?: string[];
  previewTimeMs: number;
  height: number;
  onAnimationChange: (animation: AnimationDocumentState) => void;
  onPreview: () => void;
  onPreviewTimeChange: (timeMs: number) => void;
  previewing: boolean;
  playing: boolean;
  hasPreview: boolean;
  onTogglePlayback: () => void;
  onEditInteractionStart?: () => void;
  onEditInteractionEnd?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onClipTargetSelect?: (targetId: string | null) => void;
  onSelectedClipTargetChange?: (targetId: string | null) => void;
  inspectorHost?: HTMLElement | null;
};

type TimelineDrag =
  | { type: "clip"; clip: ClipForm; mode: "move" | "start" | "end"; originX: number; originY: number }
  | { type: "playhead"; originX: number };

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 16;
const MIN_CLIP_MS = 100;
const TRACK_GUTTER_WIDTH = 72;
const ADD_SCENE_OPTION = "__add_scene__";

export function DesignerAnimateTimeline({
  document,
  effects,
  selectedTargetIds = [],
  previewTimeMs,
  height,
  onAnimationChange,
  onPreview,
  onPreviewTimeChange,
  previewing,
  playing,
  hasPreview,
  onTogglePlayback,
  onEditInteractionStart,
  onEditInteractionEnd,
  collapsed = false,
  onToggleCollapsed,
  onClipTargetSelect,
  onSelectedClipTargetChange,
  inspectorHost = null
}: Props) {
  const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
  const lightSources = document.designer?.lightSources ?? [];
  const designer = document.designer;
  const sourceTargetIds = new Set(lightSources.map((source) => source.targetId));
  const availableGlobalModes = new Set(lightSources.filter((source) => source.enabled && source.stringIds.length > 0).map((source) => source.mode));
  const targets = [
    ...lightSources.map((source) => ({ id: source.id, name: source.name || source.id })),
    ...DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.filter((target) => availableGlobalModes.has(target.mode)).map(({ id, name }) => ({ id, name })),
    ...(document.designer?.zones ?? []).filter((zone) => !sourceTargetIds.has(zone.id)).map((zone) => ({ id: zone.id, name: zone.name || zone.id })),
    ...(document.designer?.channels ?? []).filter((channel) => !sourceTargetIds.has(channel.id)).map((channel) => ({ id: channel.id, name: channel.name || channel.id })),
    ...(document.designer?.groups ?? []).map((group) => ({ id: group.id, name: group.name || group.id }))
  ];
  const targetOptions = designer ? animationClipTargetOptions(designer, document.compiledLayout) : [];
  const [selectedClipId, setSelectedClipId] = useStatefulClip(activeScene?.clips ?? []);
  const [copiedClip, setCopiedClip] = React.useState<{ sceneId: string; clip: ClipForm } | null>(null);
  const [pendingSceneDeleteId, setPendingSceneDeleteId] = React.useState<string | null>(null);
  const [sceneNameEditing, setSceneNameEditing] = React.useState(false);
  const [sceneNameDraft, setSceneNameDraft] = React.useState(activeScene?.name ?? "");
  const sceneNameCancelRef = React.useRef(false);
  const [targetPickerIntent, setTargetPickerIntent] = React.useState<{ clipId?: string; selectedOnly?: boolean } | null>(null);
  const [targetPickerSide, setTargetPickerSide] = React.useState<DesignerLightingSide>("front");
  const pendingExplicitClipIdRef = React.useRef<string | undefined>(undefined);
  const [timelineDrag, setTimelineDrag] = React.useState<TimelineDrag | null>(null);
  const [zoomFactor, setZoomFactor] = React.useState(1);
  const [timelineViewportWidth, setTimelineViewportWidth] = React.useState(0);
  const timelineViewportRef = React.useRef<HTMLDivElement | null>(null);
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const liveAnimationRef = React.useRef(animationDocumentState(document));
  liveAnimationRef.current = animationDocumentState(document);
  const selectedClip = activeScene?.clips.find((clip) => clip.id === selectedClipId);
  const targetPickerClip = targetPickerIntent?.clipId ? activeScene?.clips.find((clip) => clip.id === targetPickerIntent.clipId) : undefined;
  const selectedTargetOptions = clipTargetsForSelection(targetOptions, selectedTargetIds);
  const targetPickerOptions = targetPickerIntent?.selectedOnly ? selectedTargetOptions : targetOptions;
  const durationMs = Math.max(100, activeScene?.durationMs ?? 4000);
  const laneCount = Math.max(1, activeScene?.laneCount ?? inferLaneCount(activeScene?.clips ?? []));
  const availableAxisWidth = Math.max(320, timelineViewportWidth - TRACK_GUTTER_WIDTH);
  const minPxPerSecond = availableAxisWidth / (durationMs / 1000);
  const pxPerSecond = minPxPerSecond * zoomFactor;
  const timeAxisWidth = Math.ceil((durationMs / 1000) * pxPerSecond);
  const timelineWidth = TRACK_GUTTER_WIDTH + Math.max(availableAxisWidth, timeAxisWidth);
  const playheadLeft = TRACK_GUTTER_WIDTH + timeToPx(clamp(previewTimeMs, 0, durationMs), pxPerSecond);
  const playheadRenderLeft = Math.round(clamp(playheadLeft, 10, Math.max(10, timelineWidth - 10)));
  const selectedTargetIdsKey = selectedTargetIds.join("\u0000");

  function commitAnimation(update: (current: AnimationDocumentState) => AnimationDocumentState) {
    const nextAnimation = update(liveAnimationRef.current);
    liveAnimationRef.current = nextAnimation;
    onAnimationChange(nextAnimation);
    return nextAnimation;
  }

  React.useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setTimelineViewportWidth(Math.round(entry.contentRect.width)));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!activeScene) return;
    const pendingClipId = pendingExplicitClipIdRef.current;
    if (pendingClipId) {
      const pendingClip = activeScene.clips.find((clip) => clip.id === pendingClipId);
      const compatibleTargetIds = pendingClip ? [
        ...(designerGlobalLightSourceMode(pendingClip.target) ? clipScopeTargets(lightSources, pendingClip.target).map((target) => target.id) : []),
        ...(designer ? designerOpticalTargetsForClipTarget(designer, pendingClip.target).map((target) => target.id) : [])
      ] : [];
      if (!explicitClipTargetSelectionSettled(activeScene.clips, pendingClipId, selectedTargetIds, compatibleTargetIds)) return;
      pendingExplicitClipIdRef.current = undefined;
      return;
    }
    if (!selectedTargetIds.length) return;
    const compatibleTargetIds = selectedClip ? [
      ...(designerGlobalLightSourceMode(selectedClip.target) ? clipScopeTargets(lightSources, selectedClip.target).map((target) => target.id) : []),
      ...(designer ? designerOpticalTargetsForClipTarget(designer, selectedClip.target).map((target) => target.id) : [])
    ] : [];
    const nextClipId = clipIdForSelectedTargets(activeScene.clips, selectedClipId, selectedTargetIds, compatibleTargetIds);
    if (nextClipId !== selectedClipId) setSelectedClipId(nextClipId);
  }, [activeScene, selectedClipId, selectedTargetIdsKey, setSelectedClipId]);

  React.useEffect(() => {
    onSelectedClipTargetChange?.(selectedClip?.target ?? null);
  }, [selectedClip?.target]);

  React.useEffect(() => {
    sceneNameCancelRef.current = false;
    setSceneNameEditing(false);
    setSceneNameDraft(activeScene?.name ?? "");
  }, [activeScene?.id]);

  React.useEffect(() => {
    function handleClipClipboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "c" && selectedClip && activeScene) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCopiedClip({ sceneId: activeScene.id, clip: { ...selectedClip, params: cloneClipboardParams(selectedClip.params) } });
        return;
      }
      if (key === "v" && copiedClip?.sceneId === activeScene?.id) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pasteCopiedClip();
      }
    }

    window.addEventListener("keydown", handleClipClipboard, true);
    return () => window.removeEventListener("keydown", handleClipClipboard, true);
  }, [activeScene, copiedClip, selectedClip]);

  function changeScene(sceneId: string) {
    commitAnimation((current) => ({ ...current, activeSceneId: sceneId, previewTimeMs: 0 }));
    onPreviewTimeChange(0);
  }

  function addScene() {
    const next = liveAnimationRef.current.scenes.length + 1;
    const scene: SceneForm = { id: `scene_${next}`, name: `Scene ${next}`, loop: true, durationMs: 4000, laneCount: 1, clips: [] };
    commitAnimation((current) => ({ ...current, scenes: [...current.scenes, scene], activeSceneId: scene.id, previewTimeMs: 0 }));
    setSelectedClipId(undefined);
    onPreviewTimeChange(0);
  }

  function updateScene(patch: Partial<SceneForm>) {
    if (!activeScene) return;
    const duration = typeof patch.durationMs === "number" && Number.isFinite(patch.durationMs)
      ? Math.max(100, Math.round(patch.durationMs))
      : undefined;
    commitAnimation((current) => ({
      ...current,
      previewTimeMs: Math.min(current.previewTimeMs, duration ? duration - 1 : durationMs),
      scenes: current.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, ...patch, ...(duration ? { durationMs: duration } : {}) } : scene)
    }));
  }

  function removeScene(sceneId = activeScene?.id) {
    if (!sceneId || liveAnimationRef.current.scenes.length <= 1) return;
    const scenes = liveAnimationRef.current.scenes.filter((scene) => scene.id !== sceneId);
    commitAnimation((current) => ({ ...current, scenes, activeSceneId: scenes[0]?.id ?? "", previewTimeMs: 0 }));
    setSelectedClipId(undefined);
    onPreviewTimeChange(0);
  }

  function selectScene(sceneId: string) {
    if (sceneId === ADD_SCENE_OPTION) addScene();
    else changeScene(sceneId);
  }

  function confirmSceneDelete() {
    if (!pendingSceneDeleteId) return;
    removeScene(pendingSceneDeleteId);
    setPendingSceneDeleteId(null);
  }

  function beginSceneNameEdit() {
    if (!activeScene) return;
    sceneNameCancelRef.current = false;
    setSceneNameDraft(activeScene.name);
    setSceneNameEditing(true);
  }

  function commitSceneName() {
    if (!activeScene) return;
    if (sceneNameCancelRef.current) {
      sceneNameCancelRef.current = false;
      setSceneNameEditing(false);
      return;
    }
    const name = sceneNameDraft.trim();
    if (name && name !== activeScene.name) updateScene({ name });
    else setSceneNameDraft(activeScene.name);
    setSceneNameEditing(false);
  }

  function cancelSceneNameEdit() {
    sceneNameCancelRef.current = true;
    setSceneNameDraft(activeScene?.name ?? "");
    setSceneNameEditing(false);
  }

  function updateClip(clipId: string, patch: Partial<ClipForm>) {
    if (!activeScene) return;
    commitAnimation((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === activeScene.id ? {
        ...scene,
        clips: scene.clips.map((clip) => clip.id === clipId ? {
          ...clip,
          ...patch,
          ...(patch.params ? { params: patch.effect ? patch.params : { ...clip.params, ...patch.params } } : {})
        } : clip)
      } : scene)
    }));
  }

  function selectClip(clip: ClipForm) {
    if (onClipTargetSelect) pendingExplicitClipIdRef.current = clip.id;
    setSelectedClipId(clip.id);
    onClipTargetSelect?.(clip.target);
  }

  function addLane() {
    if (!activeScene) return;
    updateScene({ laneCount: laneCount + 1 });
  }

  function removeLane(layer: number) {
    if (!activeScene || laneCount <= 1) return;
    commitAnimation((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === activeScene.id ? {
        ...scene,
        laneCount: Math.max(1, (scene.laneCount ?? laneCount) - 1),
        clips: scene.clips
          .filter((clip) => clip.layer !== layer)
          .map((clip) => clip.layer > layer ? { ...clip, layer: clip.layer - 1 } : clip)
      } : scene)
    }));
    if (selectedClip?.layer === layer) setSelectedClipId(undefined);
  }

  function openTargetPicker(clip?: ClipForm, selectedOnly = false) {
    if (clip && designer) setTargetPickerSide(animationClipTargetSide(designer, clip.target));
    else setTargetPickerSide(selectedOnly ? selectedTargetOptions.find((option) => option.available)?.side ?? selectedTargetOptions[0]?.side ?? "front" : "front");
    setTargetPickerIntent(clip ? { clipId: clip.id } : { selectedOnly });
    if (collapsed) onToggleCollapsed?.();
  }

  function addClipForSelection() {
    const available = selectedTargetOptions.filter((option) => option.available);
    if (available.length === 1) {
      addClip(available[0].id);
      return;
    }
    openTargetPicker(undefined, selectedTargetOptions.length > 0);
  }

  function chooseTarget(targetId: string) {
    const clipId = targetPickerIntent?.clipId;
    if (clipId) {
      updateClip(clipId, { target: targetId });
      onSelectedClipTargetChange?.(targetId);
      onClipTargetSelect?.(targetId);
    } else {
      addClip(targetId);
    }
    setTargetPickerIntent(null);
  }

  function addClip(targetId: string) {
    if (!activeScene || !targetOptions.some((target) => target.id === targetId && target.available)) return;
    const currentScene = liveAnimationRef.current.scenes.find((scene) => scene.id === activeScene.id);
    if (!currentScene) return;
    const layer = nextEmptyClipLayer(currentScene);
    const identity = createClipIdentity(currentScene.clips);
    const effect = effects.solid ?? Object.values(effects)[0];
    const defaultStart = 0;
    const clipDuration = Math.min(Math.max(1000, MIN_CLIP_MS), currentScene.durationMs);
    const clip: ClipForm = {
      id: identity.id,
      name: identity.name,
      enabled: true,
      target: targetId,
      coordinateSpace: "local",
      effect: effect?.id ?? "solid",
      blend: "replace",
      startMs: defaultStart,
      durationMs: clipDuration,
      layer,
      params: defaultParams(effect)
    };
    commitAnimation((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, laneCount: Math.max(scene.laneCount ?? 1, layer + 1), clips: [...scene.clips, clip] } : scene)
    }));
    selectClip(clip);
  }

  function removeClip(clipId = selectedClip?.id) {
    if (!activeScene || !clipId) return;
    commitAnimation((current) => ({ ...current, scenes: current.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: scene.clips.filter((clip) => clip.id !== clipId) } : scene) }));
    setSelectedClipId(undefined);
    onSelectedClipTargetChange?.(null);
  }

  function pasteCopiedClip() {
    if (!activeScene || copiedClip?.sceneId !== activeScene.id) return;
    const currentScene = liveAnimationRef.current.scenes.find((scene) => scene.id === activeScene.id);
    if (!currentScene) return;
    const duplicated = duplicateClipAtTrackEnd(currentScene, copiedClip.clip);
    commitAnimation((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === activeScene.id ? duplicated.scene : scene)
    }));
    selectClip(duplicated.clip);
  }

  function beginClipDrag(event: React.PointerEvent<HTMLElement>, clip: ClipForm, mode: "move" | "start" | "end") {
    if (!timelineRef.current || !activeScene) return;
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip);
    onEditInteractionStart?.();
    const drag: TimelineDrag = { type: "clip", clip, mode, originX: event.clientX, originY: event.clientY };
    setTimelineDrag(drag);
    bindWindowDrag((moveEvent) => moveClipDrag(moveEvent.clientX, moveEvent.clientY, drag), () => {
      setTimelineDrag(null);
      onEditInteractionEnd?.();
    });
  }

  function beginPlayheadDrag(event: React.PointerEvent<HTMLElement>) {
    if (!timelineRef.current) return;
    event.preventDefault();
    const drag: TimelineDrag = { type: "playhead", originX: event.clientX };
    setTimelineDrag(drag);
    movePlayhead(event.clientX);
    bindWindowDrag((moveEvent) => movePlayhead(moveEvent.clientX), () => setTimelineDrag(null));
  }

  function movePlayhead(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    onPreviewTimeChange(snapTime(pxToTime(clientX - rect.left - TRACK_GUTTER_WIDTH, pxPerSecond)));
  }

  function moveClipDrag(clientX: number, clientY: number, drag: Extract<TimelineDrag, { type: "clip" }>) {
    if (!activeScene || !timelineRef.current) return;
    const deltaMs = Math.round(pxToTime(clientX - drag.originX, pxPerSecond));
    const currentEnd = drag.clip.startMs + drag.clip.durationMs;
    const nextLayer = drag.mode === "move" ? laneFromClientY(clientY) : drag.clip.layer;

    if (drag.mode === "start") {
      const startMs = snapTimeToNeighbors(clamp(drag.clip.startMs + deltaMs, 0, currentEnd - MIN_CLIP_MS), drag.clip.id);
      updateClip(drag.clip.id, { startMs, durationMs: currentEnd - startMs });
      return;
    }
    if (drag.mode === "end") {
      const endMs = snapTimeToNeighbors(clamp(currentEnd + deltaMs, drag.clip.startMs + MIN_CLIP_MS, durationMs), drag.clip.id);
      updateClip(drag.clip.id, { durationMs: endMs - drag.clip.startMs });
      return;
    }
    const maxStart = Math.max(0, durationMs - drag.clip.durationMs);
    const startMs = snapTimeToNeighbors(clamp(drag.clip.startMs + deltaMs, 0, maxStart), drag.clip.id);
    updateClip(drag.clip.id, { startMs, layer: nextLayer });
  }

  function laneFromClientY(clientY: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clamp(Math.floor((clientY - rect.top - HEADER_HEIGHT) / ROW_HEIGHT), 0, laneCount - 1);
  }

  function snapTime(value: number) {
    return Math.round(clamp(value, 0, durationMs));
  }

  function snapTimeToNeighbors(value: number, excludedClipId: string | undefined) {
    if (!activeScene) return snapTime(value);
    const thresholdMs = pxToTime(10, pxPerSecond);
    const anchors = [0, durationMs, previewTimeMs, ...activeScene.clips.flatMap((clip) => clip.id === excludedClipId ? [] : [clip.startMs, clip.startMs + clip.durationMs])];
    const close = anchors.find((anchor) => Math.abs(anchor - value) <= thresholdMs);
    return snapTime(close ?? value);
  }

  if (!activeScene) return null;

  const clipInspectorPanel = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-border bg-surface-2 px-3 py-3 text-body-sm font-semibold">{selectedClip ? selectedClip.name : "Select a clip"}</div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {selectedClip ? <ClipInspector
          clip={selectedClip}
          targetOption={targetOptions.find((target) => target.id === selectedClip.target)}
          targetLabel={targets.find((target) => target.id === selectedClip.target)?.name ?? selectedClip.target}
          effect={effects[selectedClip.effect]}
          effects={effects}
          onChooseTarget={() => openTargetPicker(selectedClip)}
          onChange={(patch) => {
            updateClip(selectedClip.id, patch);
          }}
          onDelete={() => removeClip(selectedClip.id)}
        /> : <div className="rounded-md border border-dashed p-4 text-body-sm text-muted-foreground">Add a clip, choose its target, then Play.</div>}
      </div>
    </div>
  );

  return (
    <>
    <section className="shrink-0 border-t border-border-2 bg-card" style={{ height }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface-2 px-3">
          <Button type="button" variant="outline" density="compact" onClick={addLane}><Plus className="h-4 w-4" />Track</Button>
          <Button type="button" variant="outline" density="compact" title={selectedTargetOptions.length ? "Create a clip for the selected object" : "Create a clip and choose its target"} onClick={addClipForSelection}>
            <Plus className="h-4 w-4" />Clip
          </Button>
          <div className="h-6 w-px shrink-0 bg-border" />
          <Button type="button" density="compact" disabled={previewing} onClick={hasPreview ? onTogglePlayback : onPreview}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{previewing ? "Rendering" : playing ? "Pause" : "Play"}</Button>
          <div className="shrink-0 font-mono text-body-sm text-muted-foreground">{Math.round(previewTimeMs)} ms</div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {sceneNameEditing ? (
              <input
                autoFocus
                aria-label="Scene name"
                className="h-8 w-40 rounded-md border border-input bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring"
                value={sceneNameDraft}
                onChange={(event) => setSceneNameDraft(event.target.value)}
                onBlur={commitSceneName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelSceneNameEdit();
                  }
                }}
              />
            ) : (
              <>
                <select
                  aria-label="Scene"
                  className="h-8 w-40 rounded-md border border-input bg-card px-2 text-body-sm"
                  value={activeScene.id}
                  onChange={(event) => selectScene(event.target.value)}
                >
                  {document.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
                  <option value={ADD_SCENE_OPTION}>+ Add scene</option>
                </select>
                <Button type="button" variant="ghost" density="compact" className="w-8 px-0" title="Edit scene name" onClick={beginSceneNameEdit}><Pencil className="h-4 w-4" /></Button>
              </>
            )}
            <SceneDurationInput value={activeScene.durationMs} onChange={(durationMs) => updateScene({ durationMs })} />
            <label className="flex h-8 items-center gap-1 rounded-md border border-input bg-card px-2 text-meta">
              <input type="checkbox" checked={activeScene.loop} onChange={(event) => updateScene({ loop: event.target.checked })} />
              Loop
            </label>
            <Button type="button" variant="ghost" density="compact" className="w-8 px-0 text-destructive" disabled={document.scenes.length <= 1} title="Delete scene" onClick={() => setPendingSceneDeleteId(activeScene.id)}><Trash2 className="h-4 w-4" /></Button>
          <label className="flex items-center gap-2 text-meta text-muted-foreground">
            Zoom
            <input type="range" min="1" max="6" step="0.1" value={zoomFactor} className="w-36 accent-blue-600" onChange={(event) => setZoomFactor(Number(event.target.value))} />
          </label>
            {onToggleCollapsed ? <Button type="button" variant="ghost" density="compact" className="w-8 px-0" title={collapsed ? "Expand timeline" : "Collapse timeline"} onClick={onToggleCollapsed}>{collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button> : null}
          </div>
        </div>

        {!collapsed ? <div className={`grid min-h-0 flex-1 ${inspectorHost ? "grid-cols-[minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_380px]"}`}>
          <div ref={timelineViewportRef} className={`min-w-0 overflow-y-auto ${zoomFactor > 1 ? "overflow-x-scroll" : "overflow-x-hidden"}`}>
            <div className="relative" style={{ width: timelineWidth, minHeight: HEADER_HEIGHT + laneCount * ROW_HEIGHT }}>
              <div
                ref={timelineRef}
                className="relative border-b border-border-2 bg-surface-2"
                style={{ width: timelineWidth, height: HEADER_HEIGHT + laneCount * ROW_HEIGHT }}
                onPointerDown={beginPlayheadDrag}
              >
                <TimelineGrid durationMs={durationMs} laneCount={laneCount} pxPerSecond={pxPerSecond} />
                {Array.from({ length: laneCount }, (_, layer) => (
                  <div key={layer} className="absolute left-0 right-0 border-b border-border/80" style={{ top: HEADER_HEIGHT + layer * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    <div className="pointer-events-none absolute left-0 top-0 flex h-full w-[72px] items-center border-r border-border bg-card/80 px-1 font-mono text-[10px] uppercase text-muted-foreground">Track {layer + 1}</div>
                    {!activeScene.clips.some((clip) => clip.layer === layer) ? (
                      <button type="button" title={`Delete empty track ${layer + 1}`} aria-label={`Delete empty track ${layer + 1}`} className="absolute left-[46px] top-1 z-10 flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border-2 hover:bg-card hover:text-destructive" onPointerDown={stopTimelinePointer} onClick={(event) => { event.stopPropagation(); removeLane(layer); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {(activeScene.clips ?? []).map((clip) => {
                  const left = TRACK_GUTTER_WIDTH + timeToPx(clip.startMs, pxPerSecond);
                  const width = Math.max(34, timeToPx(clip.durationMs, pxPerSecond));
                  const targetName = targetOptions.find((target) => target.id === clip.target)?.name ?? targets.find((target) => target.id === clip.target)?.name ?? clip.target;
                  const targetPresentation = clipTargetPresentation(document, clip.target);
                  return <ClipBlock
                    key={clip.id}
                    clip={clip}
                    targetName={targetName}
                    targetPresentation={targetPresentation}
                    left={left}
                    width={width}
                    top={HEADER_HEIGHT + Math.max(0, clip.layer) * ROW_HEIGHT + 1}
                    selected={selectedClip?.id === clip.id}
                    dragging={timelineDrag?.type === "clip" && timelineDrag.clip.id === clip.id}
                    onSelect={() => selectClip(clip)}
                    onDrag={(event, mode) => beginClipDrag(event, clip, mode)}
                    onToggleEnabled={() => updateClip(clip.id, { enabled: clip.enabled === false })}
                    onDelete={(event) => {
                      stopTimelinePointer(event);
                      removeClip(clip.id);
                    }}
                  />;
                })}
                <button type="button" title="Playhead" className="absolute left-0 top-0 z-30 h-full w-5 cursor-ew-resize will-change-transform" style={{ transform: `translate3d(${playheadRenderLeft - 10}px, 0, 0)` }} onPointerDown={beginPlayheadDrag}>
                  <span className="absolute bottom-0 left-1/2 top-0 w-px bg-red-500" />
                  <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow" />
                </button>
              </div>
            </div>
          </div>
          {!inspectorHost ? <div className="min-h-0 border-l border-border-2">{clipInspectorPanel}</div> : null}
        </div> : null}
      </div>
    </section>
    {inspectorHost ? createPortal(clipInspectorPanel, inspectorHost) : null}
    <Modal
      open={pendingSceneDeleteId !== null}
      title="Confirm delete"
      description="This action permanently deletes the selected scene."
      onClose={() => setPendingSceneDeleteId(null)}
      className="max-w-lg"
    >
      <div className="space-y-5">
        <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
          You are about to permanently delete <span className="font-medium">{document.scenes.find((scene) => scene.id === pendingSceneDeleteId)?.name ?? "this scene"}</span> and all of its clips. This cannot be undone.
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => setPendingSceneDeleteId(null)}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={confirmSceneDelete}><Trash2 className="h-4 w-4" />Delete scene</Button>
        </div>
      </div>
    </Modal>
    {targetPickerIntent && typeof globalThis.document !== "undefined" ? createPortal(
      <Modal
        open
        title={targetPickerClip ? `Clip target · ${targetPickerClip.name}` : "New clip · choose target"}
        description={targetPickerIntent.selectedOnly ? "Choose one configured lighting destination for the selected object." : "Choose the lighting destination for this clip. Unavailable targets remain visible so you can identify missing setup."}
        className="max-w-5xl"
        closeOnBackdrop
        onClose={() => setTargetPickerIntent(null)}
      >
        <AnimationTargetPicker
          options={targetPickerOptions}
          side={targetPickerSide}
          selectedTargetId={targetPickerClip?.target}
          onSideChange={setTargetPickerSide}
          onSelect={chooseTarget}
          onCancel={() => setTargetPickerIntent(null)}
        />
      </Modal>,
      globalThis.document.body
    ) : null}
    </>
  );
}

function ClipBlock({ clip, targetName, targetPresentation, left, width, top, selected, dragging, onSelect, onDrag, onToggleEnabled, onDelete }: {
  clip: ClipForm;
  targetName: string;
  targetPresentation: ReturnType<typeof clipTargetPresentation>;
  left: number;
  width: number;
  top: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDrag: (event: React.PointerEvent<HTMLElement>, mode: "move" | "start" | "end") => void;
  onToggleEnabled: () => void;
  onDelete: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(event) => onDrag(event, "move")}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={`absolute z-10 flex h-8 min-w-8 cursor-grab items-center overflow-hidden rounded border-2 px-3.5 text-left text-meta shadow-sm ${clip.enabled === false ? "opacity-50" : ""} ${dragging ? "cursor-grabbing" : ""} ${targetPresentation.borderClass} ${selected ? "bg-primary text-primary-foreground ring-1 ring-primary" : "bg-card hover:bg-surface-hover"}`}
      style={{ left, top, width }}
      title={`${clip.name} → ${targetName}: drag to move`}
    >
      <span className="absolute bottom-0 left-0 top-0 z-40 flex w-3.5 cursor-ew-resize items-center justify-center border-r border-slate-400 bg-white/90 text-slate-800 shadow-sm hover:bg-white" onPointerDown={(event) => onDrag(event, "start")} title="Resize clip start" aria-label="Resize clip start">
        <GripVertical className="h-3 w-3" />
      </span>
      <button type="button" className="flex h-full w-6 shrink-0 items-center justify-center bg-black/10 text-current opacity-75 hover:bg-black/20 hover:opacity-100" title={clip.enabled === false ? "Enable clip" : "Disable clip"} aria-label={clip.enabled === false ? "Enable clip" : "Disable clip"} onPointerDown={stopTimelinePointer} onClick={(event) => { event.stopPropagation(); onToggleEnabled(); }}>
        {clip.enabled === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <span className={`ml-1 shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase leading-none ${selected ? "bg-white/20 text-white" : targetPresentation.badgeClass}`}>{targetPresentation.label}</span>
      <span className="block min-w-0 flex-1 truncate px-2">{clip.name}</span>
      <button type="button" className="flex h-full w-6 shrink-0 items-center justify-center bg-black/10 text-current opacity-75 hover:bg-black/20 hover:opacity-100" title="Delete clip" onPointerDown={onDelete} onClick={(event) => event.stopPropagation()}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <span className="absolute bottom-0 right-0 top-0 z-40 flex w-3.5 cursor-ew-resize items-center justify-center border-l border-slate-400 bg-white/90 text-slate-800 shadow-sm hover:bg-white" onPointerDown={(event) => onDrag(event, "end")} title="Resize clip end" aria-label="Resize clip end">
        <GripVertical className="h-3 w-3" />
      </span>
    </div>
  );
}

function TimelineGrid({ durationMs, laneCount, pxPerSecond }: { durationMs: number; laneCount: number; pxPerSecond: number }) {
  const ticks = timelineTicks(durationMs, pxPerSecond, true);
  const labelTicks = timelineTicks(durationMs, pxPerSecond);
  return <>
    <div className="absolute left-0 right-0 top-0 border-b border-border bg-card/80" style={{ height: HEADER_HEIGHT }} />
    {labelTicks.map((tick) => <span key={`label-${tick}`} className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 font-mono text-[9px] leading-4 text-muted-foreground" style={{ left: TRACK_GUTTER_WIDTH + timeToPx(tick, pxPerSecond) }}>{tick >= 1000 ? `${tick / 1000}s` : `${tick}ms`}</span>)}
    <div className="absolute bottom-0 top-0 border-l border-border/90" style={{ left: TRACK_GUTTER_WIDTH }} />
    {ticks.map((tick) => <div key={tick} className="absolute bottom-0 top-0 border-l border-border/70" style={{ left: TRACK_GUTTER_WIDTH + timeToPx(tick, pxPerSecond) }} />)}
    {Array.from({ length: laneCount + 1 }, (_, index) => <div key={index} className="absolute left-0 right-0 border-t border-border/70" style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT }} />)}
  </>;
}

function AnimationTargetPicker({ options, side, selectedTargetId, onSideChange, onSelect, onCancel }: {
  options: AnimationClipTargetOption[];
  side: DesignerLightingSide;
  selectedTargetId?: string;
  onSideChange: (side: DesignerLightingSide) => void;
  onSelect: (targetId: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visible = options.filter((option) => option.side === side && (!normalizedQuery || `${option.name} ${option.detail}`.toLowerCase().includes(normalizedQuery)));
  const categories = [
    { id: "effectTargets" as const, label: "Effect targets", icon: Sparkles, iconClass: "text-violet-600" },
    { id: "zones" as const, label: "Zones", icon: CircleDot, iconClass: "text-sky-600" },
    { id: "channels" as const, label: "Channels", icon: Waves, iconClass: "text-amber-600" },
    { id: "global" as const, label: "Global", icon: Sparkles, iconClass: "text-emerald-600" }
  ];
  const sideCounts = (candidate: DesignerLightingSide) => options.filter((option) => option.side === candidate).length;
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-[minmax(280px,0.55fr)_minmax(0,1fr)]">
      <div className="grid grid-cols-2 rounded-md border border-border-2 bg-surface-2 p-1">
        {(["front", "rear"] as const).map((candidate) => <button
          key={candidate}
          type="button"
          className={`flex h-10 items-center justify-center gap-2 rounded text-body-sm font-semibold ${side === candidate ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"}`}
          onClick={() => onSideChange(candidate)}
        >
          {candidate === "front" ? "Front" : "Rear"}
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${side === candidate ? "bg-white/20 text-white" : "bg-card text-muted-foreground"}`}>{sideCounts(candidate)}</span>
        </button>)}
      </div>
      <label className="flex h-12 items-center gap-2 rounded-md border border-input bg-card px-3">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-body-sm outline-none" placeholder="Search targets" />
      </label>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {categories.map((category) => {
        const entries = visible
          .filter((option) => option.category === category.id)
          .sort((left, right) => Number(right.available) - Number(left.available));
        const Icon = category.icon;
        return <section key={category.id} className="overflow-hidden rounded-md border border-border-2 bg-card">
          <div className="flex h-10 items-center gap-2 border-b border-border bg-surface-2 px-3 text-body-sm font-semibold">
            <Icon className={`h-4 w-4 ${category.iconClass}`} />
            <span className="flex-1">{category.label}</span>
            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{entries.length}</span>
          </div>
          <div className="max-h-[25vh] min-h-20 space-y-1 overflow-y-auto p-2">
            {entries.map((option) => <button
              key={option.id}
              type="button"
              disabled={!option.available}
              className={`flex min-h-12 w-full items-center gap-3 rounded-md border px-3 py-2 text-left ${selectedTargetId === option.id ? "border-blue-500 bg-blue-500/10" : "border-transparent hover:border-border-2 hover:bg-surface-hover"} disabled:cursor-not-allowed disabled:opacity-45`}
              title={option.available ? `Use ${option.name}` : option.detail}
              onClick={() => onSelect(option.id)}
            >
              <Icon className={`h-4 w-4 shrink-0 ${category.iconClass}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body-sm font-medium">{option.name}</span>
                <span className="block truncate text-meta text-muted-foreground">{option.detail}</span>
              </span>
              {selectedTargetId === option.id ? <Check className="h-4 w-4 shrink-0 text-blue-600" /> : null}
            </button>)}
            {!entries.length ? <div className="flex min-h-16 items-center justify-center px-3 text-center text-body-sm text-muted-foreground">No {category.label.toLowerCase()} match this side and search.</div> : null}
          </div>
        </section>;
      })}
    </div>
    {!visible.length ? <div className="rounded-md border border-dashed p-4 text-center text-body-sm text-muted-foreground">No targets match this side and search.</div> : null}
    <div className="flex justify-end border-t border-border pt-4"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
  </div>;
}

function ClipInspector({ clip, targetOption, targetLabel, effect, effects, onChooseTarget, onChange, onDelete }: { clip: ClipForm; targetOption?: AnimationClipTargetOption; targetLabel: string; effect?: EffectDefinition; effects: Record<string, EffectDefinition>; onChooseTarget: () => void; onChange: (patch: Partial<ClipForm>) => void; onDelete: () => void }) {
  const definition = effect ?? effects.solid;
  const TargetIcon = targetOption?.category === "effectTargets" || targetOption?.category === "global" ? Sparkles : targetOption?.category === "channels" ? Waves : CircleDot;
  const targetColor = targetOption?.category === "effectTargets" ? "text-violet-600" : targetOption?.category === "global" ? "text-emerald-600" : targetOption?.category === "channels" ? "text-amber-600" : "text-sky-600";
  return <div className="space-y-2">
    <label className="block text-meta font-medium text-muted-foreground">
      Name
      <input
        className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-body-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        value={clip.name}
        maxLength={80}
        placeholder="Letter or effect name"
        onChange={(event) => onChange({ name: event.target.value })}
        onBlur={(event) => {
          const name = event.target.value.trim();
          if (name !== clip.name) onChange({ name: name || "Clip" });
        }}
      />
    </label>
    <label className="block text-meta font-medium text-muted-foreground">
      Target
      <button type="button" className="mt-1 flex h-10 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-foreground hover:border-blue-500 hover:bg-surface-hover" onClick={onChooseTarget}>
        <TargetIcon className={`h-4 w-4 shrink-0 ${targetColor}`} />
        <span className="min-w-0 flex-1 truncate text-body-sm">{targetOption ? `${targetOption.side === "front" ? "Front" : "Rear"} · ${targetOption.name}` : targetLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </label>
    <Select label="Effect" value={clip.effect} options={Object.values(effects).map((item) => [item.id, item.label])} onChange={(effectId) => onChange({ effect: effectId, params: defaultParams(effects[effectId]) })} />
    {definition ? <div className="space-y-2 border-t border-border-2 pt-3">{Object.entries(definition.parameters).map(([key, parameter]) => <ParameterInput key={key} name={key} definition={parameter} value={clip.params[key]} onChange={(value) => onChange({ params: { [key]: value } })} />)}</div> : null}
    <Button type="button" variant="ghost" density="compact" className="w-full text-destructive" onPointerDown={stopTimelinePointer} onClick={onDelete}><Trash2 className="h-4 w-4" />Delete clip</Button>
  </div>;
}

function clipTargetPresentation(document: PartituraDocument, targetId: string) {
  const groupTarget = parseDesignerGroupLightTargetId(targetId);
  if (groupTarget) return groupTarget.side === "front"
    ? { label: "Front", borderClass: "border-violet-500", badgeClass: "bg-violet-100 text-violet-800" }
    : { label: "Rear", borderClass: "border-violet-500", badgeClass: "bg-violet-100 text-violet-800" };
  const globalMode = designerGlobalLightSourceMode(targetId);
  const mode = document.designer?.lightSources.find((source) => source.id === targetId)?.mode ?? globalMode;
  const scope = globalMode ? "All " : "";
  if (mode === "front") return { label: `${scope}Front`, borderClass: "border-sky-500", badgeClass: "bg-sky-100 text-sky-800" };
  if (mode === "halo") return { label: `${scope}Halo`, borderClass: "border-violet-500", badgeClass: "bg-violet-100 text-violet-800" };
  if (mode === "wall_wash") return { label: `${scope}Wall`, borderClass: "border-amber-500", badgeClass: "bg-amber-100 text-amber-900" };
  if (targetId === "full_sign") return { label: "Full", borderClass: "border-slate-500", badgeClass: "bg-slate-200 text-slate-900" };
  if (document.designer?.groups.some((group) => group.id === targetId)) return { label: "Group", borderClass: "border-emerald-500", badgeClass: "bg-emerald-100 text-emerald-900" };
  if (document.designer?.channels.some((channel) => channel.id === targetId)) return { label: "Channel", borderClass: "border-amber-500", badgeClass: "bg-amber-100 text-amber-900" };
  return { label: "Zone", borderClass: "border-blue-500", badgeClass: "bg-blue-100 text-blue-900" };
}

function stopTimelinePointer(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function cloneClipboardParams(params: ClipParams): ClipParams {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) as ClipParams;
}

function SceneDurationInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = React.useState(String(millisecondsToSeconds(value)));
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setDraft(String(millisecondsToSeconds(value)));
  }, [editing, value]);

  function commit() {
    setEditing(false);
    const next = Number(draft);
    if (Number.isFinite(next)) {
      const boundedMs = Math.max(1000, Math.round(next) * 1000);
      setDraft(String(millisecondsToSeconds(boundedMs)));
      onChange(boundedMs);
      return;
    }
    setDraft(String(millisecondsToSeconds(value)));
  }

  return (
    <label className="flex h-8 items-center gap-2 rounded-md border border-input bg-card px-2 text-meta">
      <span>Duration</span>
      <input
        className="w-20 bg-transparent text-right font-mono outline-none"
        type="text"
        inputMode="numeric"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(millisecondsToSeconds(value)));
            event.currentTarget.blur();
          }
        }}
      />
      <span>s</span>
    </label>
  );
}

function millisecondsToSeconds(milliseconds: number) {
  return Math.max(1, Math.round(milliseconds / 1000));
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-meta"><span>{label}</span><select className="h-8 rounded-md border bg-card px-2 text-body-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function NumberInput({ label, unit, value, onChange }: { label: string; unit?: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = React.useState(String(value));
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => { if (!editing) setDraft(String(value)); }, [editing, value]);
  function commit() {
    const next = Number(draft);
    if (Number.isFinite(next)) onChange(next);
    else setDraft(String(value));
    setEditing(false);
  }
  return <label className="grid gap-1 text-meta"><span>{label}{unit ? ` (${unit})` : ""}</span><input className="h-8 rounded-md border bg-card px-2 text-right font-mono text-body-sm" type="text" inputMode="numeric" value={draft} onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

function ParameterInput({ name, definition, value, onChange }: { name: string; definition: EffectParameterDefinition; value: ClipParams[string] | undefined; onChange: (value: ClipParams[string]) => void }) {
  const label = definition.label ?? name;
  if (definition.type === "color") return <label className="grid gap-1 text-meta"><span>{label}</span><input className="h-8 w-full rounded border bg-card p-1" type="color" value={typeof value === "string" ? value : String(definition.default ?? "#FFFFFF")} onChange={(event) => onChange(event.target.value)} /></label>;
  if (definition.type === "boolean") return <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={Boolean(value ?? definition.default)} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  if (definition.type === "select") return <Select label={label} value={String(value ?? definition.default ?? "")} options={(definition.options ?? []).map((option) => [option.value, option.label])} onChange={onChange} />;
  const raw = typeof value === "number" ? value : typeof definition.default === "number" ? definition.default : 0;
  return <label className="grid gap-1 text-meta"><span>{label}{definition.unit ? ` (${definition.unit})` : ""}</span><input className="h-8 rounded-md border bg-card px-2 text-right font-mono text-body-sm" type="number" min={definition.min} max={definition.max} step={definition.type === "integer" ? 1 : 0.1} value={raw} onChange={(event) => onChange(definition.type === "integer" ? Math.round(Number(event.target.value)) : Number(event.target.value))} /></label>;
}

function useStatefulClip(clips: ClipForm[]) {
  const [selectedClipId, setSelectedClipId] = React.useState<string | undefined>(clips[0]?.id);
  React.useEffect(() => {
    if (!selectedClipId || clips.some((clip) => clip.id === selectedClipId)) return;
    setSelectedClipId(undefined);
  }, [clips, selectedClipId]);
  return [selectedClipId, setSelectedClipId] as const;
}

function defaultParams(effect?: EffectDefinition): ClipParams {
  return Object.fromEntries(Object.entries(effect?.parameters ?? {}).map(([key, parameter]) => [key, parameter.default ?? (parameter.type === "color" ? "#FFFFFF" : parameter.type === "boolean" ? false : parameter.type === "select" ? parameter.options?.[0]?.value ?? "" : 0)]));
}

function inferLaneCount(clips: ClipForm[]) {
  return Math.max(1, ...clips.map((clip) => Math.max(0, Math.round(clip.layer)) + 1));
}

function bindWindowDrag(onMove: (event: PointerEvent) => void, onEnd: () => void) {
  const end = () => {
    onEnd();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", end, { once: true });
  window.addEventListener("pointercancel", end, { once: true });
}

function timeToPx(timeMs: number, pxPerSecond: number) {
  return (timeMs / 1000) * pxPerSecond;
}

function pxToTime(px: number, pxPerSecond: number) {
  return (px / pxPerSecond) * 1000;
}

function timelineTicks(durationMs: number, pxPerSecond: number, includeMinor = false) {
  const majorStep = pxPerSecond >= 260 ? 500 : pxPerSecond >= 130 ? 1000 : 2000;
  const minorStep = majorStep / 2;
  const step = includeMinor ? minorStep : majorStep;
  const ticks: number[] = [];
  for (let time = 0; time <= durationMs; time += step) ticks.push(time);
  if (!ticks.includes(durationMs)) ticks.push(durationMs);
  return ticks;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
