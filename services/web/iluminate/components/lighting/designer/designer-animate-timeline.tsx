"use client";

import * as React from "react";
import { GripVertical, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import { createClipIdentity, type ClipForm, type ClipParams, type PartituraDocument, type SceneForm } from "@/lib/lighting/partitura-model";

type Props = {
  document: PartituraDocument;
  effects: Record<string, EffectDefinition>;
  selectedTargetId?: string;
  previewTimeMs: number;
  height: number;
  onChange: (document: PartituraDocument) => void;
  onPreview: () => void;
  onPreviewTimeChange: (timeMs: number) => void;
  previewing: boolean;
  playing: boolean;
  hasPreview: boolean;
  onTogglePlayback: () => void;
  onSave: () => void;
  saving: boolean;
  onClipTargetSelect?: (targetId: string | null) => void;
};

type TimelineDrag =
  | { type: "clip"; clip: ClipForm; mode: "move" | "start" | "end"; originX: number; originY: number }
  | { type: "playhead"; originX: number };

const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 30;
const MIN_CLIP_MS = 100;
const TRACK_GUTTER_WIDTH = 72;

export function DesignerAnimateTimeline({
  document,
  effects,
  selectedTargetId,
  previewTimeMs,
  height,
  onChange,
  onPreview,
  onPreviewTimeChange,
  previewing,
  playing,
  hasPreview,
  onTogglePlayback,
  onSave,
  saving,
  onClipTargetSelect
}: Props) {
  const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
  const targets = [
    { id: "full_sign", name: "Full sign" },
    ...(document.designer?.zones ?? []).map((zone) => ({ id: zone.id, name: zone.name || zone.id })),
    ...(document.designer?.channels ?? []).map((channel) => ({ id: channel.id, name: channel.name || channel.id })),
    ...(document.designer?.groups ?? []).map((group) => ({ id: group.id, name: group.name || group.id }))
  ];
  const [selectedClipId, setSelectedClipId] = useStatefulClip(activeScene?.clips ?? []);
  const [timelineDrag, setTimelineDrag] = React.useState<TimelineDrag | null>(null);
  const [zoomFactor, setZoomFactor] = React.useState(1);
  const [timelineViewportWidth, setTimelineViewportWidth] = React.useState(0);
  const timelineViewportRef = React.useRef<HTMLDivElement | null>(null);
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const selectedClip = activeScene?.clips.find((clip) => clip.id === selectedClipId) ?? activeScene?.clips[0];
  const zoneTargetIds = React.useMemo(
    () => new Set([...(document.designer?.zones ?? []).map((zone) => zone.id), ...(document.designer?.channels ?? []).map((channel) => channel.id)]),
    [document.designer?.zones, document.designer?.channels]
  );
  const durationMs = Math.max(100, activeScene?.durationMs ?? 4000);
  const laneCount = Math.max(1, activeScene?.laneCount ?? inferLaneCount(activeScene?.clips ?? []));
  const availableAxisWidth = Math.max(320, timelineViewportWidth - 24 - TRACK_GUTTER_WIDTH);
  const minPxPerSecond = availableAxisWidth / (durationMs / 1000);
  const pxPerSecond = minPxPerSecond * zoomFactor;
  const timeAxisWidth = Math.ceil((durationMs / 1000) * pxPerSecond);
  const timelineWidth = TRACK_GUTTER_WIDTH + Math.max(availableAxisWidth, timeAxisWidth);
  const playheadLeft = TRACK_GUTTER_WIDTH + timeToPx(clamp(previewTimeMs, 0, durationMs), pxPerSecond);

  React.useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setTimelineViewportWidth(Math.round(entry.contentRect.width)));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!activeScene || !selectedTargetId) return;
    const currentClip = activeScene.clips.find((clip) => clip.id === selectedClipId);
    if (currentClip?.target === selectedTargetId) return;
    const nextClip = activeScene.clips.find((clip) => clip.target === selectedTargetId);
    if (nextClip) setSelectedClipId(nextClip.id);
  }, [activeScene, selectedClipId, selectedTargetId, setSelectedClipId]);

  function changeScene(sceneId: string) {
    onChange({ ...document, activeSceneId: sceneId, previewTimeMs: 0 });
    onPreviewTimeChange(0);
  }

  function addScene() {
    const next = document.scenes.length + 1;
    const scene: SceneForm = { id: `scene_${next}`, name: `Scene ${next}`, loop: true, durationMs: 4000, laneCount: 1, clips: [] };
    onChange({ ...document, scenes: [...document.scenes, scene], activeSceneId: scene.id, previewTimeMs: 0 });
    setSelectedClipId(undefined);
    onPreviewTimeChange(0);
  }

  function updateScene(patch: Partial<SceneForm>) {
    if (!activeScene) return;
    const duration = typeof patch.durationMs === "number" && Number.isFinite(patch.durationMs)
      ? Math.max(100, Math.round(patch.durationMs))
      : undefined;
    onChange({
      ...document,
      previewTimeMs: Math.min(document.previewTimeMs, duration ? duration - 1 : durationMs),
      scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, ...patch, ...(duration ? { durationMs: duration } : {}) } : scene)
    });
  }

  function removeScene() {
    if (!activeScene || document.scenes.length <= 1) return;
    const scenes = document.scenes.filter((scene) => scene.id !== activeScene.id);
    onChange({ ...document, scenes, activeSceneId: scenes[0]?.id ?? "", previewTimeMs: 0 });
    setSelectedClipId(undefined);
    onPreviewTimeChange(0);
  }

  function updateClip(clipId: string, patch: Partial<ClipForm>) {
    if (!activeScene) return;
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: scene.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip) } : scene)
    });
  }

  function selectClip(clip: ClipForm) {
    setSelectedClipId(clip.id);
    onClipTargetSelect?.(zoneTargetIds.has(clip.target) ? clip.target : null);
  }

  function addLane() {
    if (!activeScene) return;
    updateScene({ laneCount: laneCount + 1 });
  }

  function removeLane(layer: number) {
    if (!activeScene || laneCount <= 1) return;
    const clips = activeScene.clips
      .filter((clip) => clip.layer !== layer)
      .map((clip) => clip.layer > layer ? { ...clip, layer: clip.layer - 1 } : clip);
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, laneCount: laneCount - 1, clips } : scene)
    });
    if (selectedClip?.layer === layer) setSelectedClipId(undefined);
  }

  function addClip(layer = laneCount) {
    if (!activeScene) return;
    const identity = createClipIdentity(activeScene.clips);
    const effect = effects.solid ?? Object.values(effects)[0];
    const defaultStart = 0;
    const clipDuration = Math.min(Math.max(1000, MIN_CLIP_MS), activeScene.durationMs);
    const clip: ClipForm = {
      id: identity.id,
      name: identity.name,
      target: selectedTargetId && targets.some((target) => target.id === selectedTargetId) ? selectedTargetId : "full_sign",
      coordinateSpace: "local",
      effect: effect?.id ?? "solid",
      blend: "replace",
      startMs: defaultStart,
      durationMs: clipDuration,
      layer,
      params: defaultParams(effect)
    };
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, laneCount: Math.max(laneCount + 1, layer + 1), clips: [...scene.clips, clip] } : scene)
    });
    selectClip(clip);
  }

  function removeClip(clipId = selectedClip?.id) {
    if (!activeScene || !clipId) return;
    onChange({ ...document, scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: scene.clips.filter((clip) => clip.id !== clipId) } : scene) });
    setSelectedClipId(undefined);
  }

  function beginClipDrag(event: React.PointerEvent<HTMLElement>, clip: ClipForm, mode: "move" | "start" | "end") {
    if (!timelineRef.current || !activeScene) return;
    event.stopPropagation();
    event.preventDefault();
    selectClip(clip);
    const drag: TimelineDrag = { type: "clip", clip, mode, originX: event.clientX, originY: event.clientY };
    setTimelineDrag(drag);
    bindWindowDrag((moveEvent) => moveClipDrag(moveEvent.clientX, moveEvent.clientY, drag), () => setTimelineDrag(null));
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

  return (
    <section className="shrink-0 border-t border-border-2 bg-card" style={{ height }}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {document.scenes.map((scene) => (
              <button key={scene.id} type="button" onClick={() => changeScene(scene.id)} className={`h-8 max-w-40 truncate rounded-md border px-3 text-body-sm font-medium ${scene.id === activeScene.id ? "border-primary bg-primary text-primary-foreground" : "border-border-2 bg-card hover:bg-surface-hover"}`}>
                {scene.name}
              </button>
            ))}
            <Button type="button" variant="outline" className="h-8 w-8 px-0" title="New scene" onClick={addScene}><Plus className="h-4 w-4" /></Button>
          </div>
          <ToolbarTextInput value={activeScene.name} onChange={(name) => updateScene({ name })} className="w-36" />
          <SceneDurationInput value={activeScene.durationMs} onChange={(durationMs) => updateScene({ durationMs })} />
          <label className="flex h-8 items-center gap-1 rounded-md border border-input bg-card px-2 text-meta">
            <input type="checkbox" checked={activeScene.loop} onChange={(event) => updateScene({ loop: event.target.checked })} />
            Loop
          </label>
          <Button type="button" variant="ghost" className="h-8 w-8 px-0 text-destructive" disabled={document.scenes.length <= 1} title="Delete scene" onClick={removeScene}><Trash2 className="h-4 w-4" /></Button>
        </div>

        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-2 px-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-8" onClick={() => addClip()}><Plus className="h-4 w-4" />Clip</Button>
            <Button type="button" variant="outline" className="h-8" onClick={addLane}><Plus className="h-4 w-4" />Track</Button>
            <Button type="button" variant="outline" className="h-8" disabled={saving} onClick={onSave}><Save className="h-4 w-4" />{saving ? "Saving" : "Save"}</Button>
            <Button type="button" className="h-8" disabled={previewing} onClick={hasPreview ? onTogglePlayback : onPreview}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{previewing ? "Rendering" : playing ? "Pause" : "Play"}</Button>
            <div className="font-mono text-body-sm text-muted-foreground">{Math.round(previewTimeMs)} ms</div>
          </div>
          <label className="flex items-center gap-2 text-meta text-muted-foreground">
            Zoom
            <input type="range" min="1" max="6" step="0.1" value={zoomFactor} className="w-36 accent-blue-600" onChange={(event) => setZoomFactor(Number(event.target.value))} />
          </label>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
          <div ref={timelineViewportRef} className="min-w-0 overflow-auto p-3">
            <div className="relative" style={{ width: timelineWidth, minHeight: HEADER_HEIGHT + laneCount * ROW_HEIGHT + 14 }}>
              <TimelineHeader durationMs={durationMs} pxPerSecond={pxPerSecond} width={timelineWidth} />
              <div
                ref={timelineRef}
                className="relative rounded-md border border-border-2 bg-surface-2"
                style={{ width: timelineWidth, height: HEADER_HEIGHT + laneCount * ROW_HEIGHT }}
                onPointerDown={beginPlayheadDrag}
              >
                <TimelineGrid durationMs={durationMs} laneCount={laneCount} pxPerSecond={pxPerSecond} />
                {Array.from({ length: laneCount }, (_, layer) => (
                  <div key={layer} className="absolute left-0 right-0 border-b border-border/80" style={{ top: HEADER_HEIGHT + layer * ROW_HEIGHT, height: ROW_HEIGHT }}>
                    <div className="pointer-events-none absolute left-0 top-0 flex h-full w-[72px] items-center border-r border-border bg-card/80 px-2 font-mono text-[10px] uppercase text-muted-foreground">Track {layer + 1}</div>
                    <button type="button" title={`Delete track ${layer + 1}`} className="absolute right-1 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border-2 hover:bg-card hover:text-destructive" onPointerDown={stopTimelinePointer} onClick={(event) => { event.stopPropagation(); removeLane(layer); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {(activeScene.clips ?? []).map((clip) => {
                  const left = TRACK_GUTTER_WIDTH + timeToPx(clip.startMs, pxPerSecond);
                  const width = Math.max(34, timeToPx(clip.durationMs, pxPerSecond));
                  const targetName = targets.find((target) => target.id === clip.target)?.name ?? clip.target;
                  return <ClipBlock
                    key={clip.id}
                    clip={clip}
                    targetName={targetName}
                    left={left}
                    width={width}
                    top={HEADER_HEIGHT + Math.max(0, clip.layer) * ROW_HEIGHT + 7}
                    selected={selectedClip?.id === clip.id}
                    dragging={timelineDrag?.type === "clip" && timelineDrag.clip.id === clip.id}
                    onSelect={() => selectClip(clip)}
                    onDrag={(event, mode) => beginClipDrag(event, clip, mode)}
                    onDelete={(event) => {
                      stopTimelinePointer(event);
                      removeClip(clip.id);
                    }}
                  />;
                })}
                <div className="absolute bottom-0 top-0 z-20 w-px bg-red-500" style={{ left: playheadLeft }} />
                <button type="button" title="Playhead" className="absolute top-0 z-30 h-full w-5 -translate-x-1/2 cursor-ew-resize" style={{ left: playheadLeft }} onPointerDown={beginPlayheadDrag}>
                  <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow" />
                </button>
              </div>
            </div>
          </div>
          <div className="min-h-0 overflow-auto border-l border-border-2 p-3">
            <div className="mb-3 text-body-sm font-semibold">{selectedClip ? selectedClip.name : "Select a clip"}</div>
            {selectedClip ? <ClipInspector
              clip={selectedClip}
              targets={targets}
              effect={effects[selectedClip.effect]}
              effects={effects}
              onChange={(patch) => {
                updateClip(selectedClip.id, patch);
                if (patch.target !== undefined) onClipTargetSelect?.(zoneTargetIds.has(patch.target) ? patch.target : null);
              }}
              onDelete={() => removeClip(selectedClip.id)}
            /> : <div className="rounded-md border border-dashed p-4 text-body-sm text-muted-foreground">Select a zone, add a clip, then Play.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ClipBlock({ clip, targetName, left, width, top, selected, dragging, onSelect, onDrag, onDelete }: {
  clip: ClipForm;
  targetName: string;
  left: number;
  width: number;
  top: number;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDrag: (event: React.PointerEvent<HTMLElement>, mode: "move" | "start" | "end") => void;
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
      className={`absolute z-10 flex h-8 min-w-8 cursor-grab items-center overflow-hidden rounded border text-left text-meta shadow-sm ${dragging ? "cursor-grabbing" : ""} ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card hover:bg-surface-hover"}`}
      style={{ left, top, width }}
      title={`${clip.name} → ${targetName}: drag to move`}
    >
      <span className="flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center bg-black/10 hover:bg-black/20" onPointerDown={(event) => onDrag(event, "start")} title="Resize start">
        <GripVertical className="h-3 w-3" />
      </span>
      <span className="block min-w-0 flex-1 truncate px-2">{clip.name}</span>
      <button type="button" className="flex h-full w-6 shrink-0 items-center justify-center bg-black/10 text-current opacity-75 hover:bg-black/20 hover:opacity-100" title="Delete clip" onPointerDown={onDelete} onClick={(event) => event.stopPropagation()}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <span className="flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center bg-black/10 hover:bg-black/20" onPointerDown={(event) => onDrag(event, "end")} title="Resize end">
        <GripVertical className="h-3 w-3" />
      </span>
    </div>
  );
}

function TimelineHeader({ durationMs, pxPerSecond, width }: { durationMs: number; pxPerSecond: number; width: number }) {
  const ticks = timelineTicks(durationMs, pxPerSecond);
  return <div className="relative h-6 text-meta text-muted-foreground" style={{ width }}>
    {ticks.map((tick) => <span key={tick} className="absolute -translate-x-1/2 font-mono" style={{ left: TRACK_GUTTER_WIDTH + timeToPx(tick, pxPerSecond) }}>{tick >= 1000 ? `${tick / 1000}s` : `${tick}ms`}</span>)}
  </div>;
}

function TimelineGrid({ durationMs, laneCount, pxPerSecond }: { durationMs: number; laneCount: number; pxPerSecond: number }) {
  const ticks = timelineTicks(durationMs, pxPerSecond, true);
  return <>
    <div className="absolute left-0 right-0 top-0 h-[30px] border-b border-border bg-card/80" />
    <div className="absolute bottom-0 top-0 border-l border-border/90" style={{ left: TRACK_GUTTER_WIDTH }} />
    {ticks.map((tick) => <div key={tick} className="absolute bottom-0 top-0 border-l border-border/70" style={{ left: TRACK_GUTTER_WIDTH + timeToPx(tick, pxPerSecond) }} />)}
    {Array.from({ length: laneCount + 1 }, (_, index) => <div key={index} className="absolute left-0 right-0 border-t border-border/70" style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT }} />)}
  </>;
}

function ClipInspector({ clip, targets, effect, effects, onChange, onDelete }: { clip: ClipForm; targets: Array<{ id: string; name: string }>; effect?: EffectDefinition; effects: Record<string, EffectDefinition>; onChange: (patch: Partial<ClipForm>) => void; onDelete: () => void }) {
  const definition = effect ?? effects.solid;
  return <div className="space-y-2">
    <Select label="Target" value={clip.target} options={targets.map((target) => [target.id, target.name])} onChange={(target) => onChange({ target })} />
    <Select label="Effect" value={clip.effect} options={Object.values(effects).map((item) => [item.id, item.label])} onChange={(effectId) => onChange({ effect: effectId, params: defaultParams(effects[effectId]) })} />
    {definition ? <div className="space-y-2 border-t border-border-2 pt-3">{Object.entries(definition.parameters).map(([key, parameter]) => <ParameterInput key={key} name={key} definition={parameter} value={clip.params[key]} onChange={(value) => onChange({ params: { ...clip.params, [key]: value } })} />)}</div> : null}
    <Button type="button" variant="ghost" className="h-8 w-full text-destructive" onPointerDown={stopTimelinePointer} onClick={onDelete}><Trash2 className="h-4 w-4" />Delete clip</Button>
  </div>;
}

function stopTimelinePointer(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function ToolbarTextInput({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  return <input className={`h-8 rounded-md border border-input bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring ${className}`} value={value} onChange={(event) => onChange(event.target.value)} />;
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
  React.useEffect(() => { if (selectedClipId && clips.some((clip) => clip.id === selectedClipId)) return; setSelectedClipId(clips[0]?.id); }, [clips, selectedClipId]);
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
