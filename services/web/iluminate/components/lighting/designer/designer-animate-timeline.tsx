"use client";

import * as React from "react";
import { GripVertical, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import type { ClipForm, ClipParams, PartituraDocument, SceneForm } from "@/lib/lighting/partitura-model";

type Props = {
  document: PartituraDocument;
  effects: Record<string, EffectDefinition>;
  selectedTargetId?: string;
  onChange: (document: PartituraDocument) => void;
  onPreview: () => void;
  previewing: boolean;
  playing: boolean;
  onTogglePlayback: () => void;
  onSave: () => void;
  saving: boolean;
};

export function DesignerAnimateTimeline({ document, effects, selectedTargetId, onChange, onPreview, previewing, playing, onTogglePlayback, onSave, saving }: Props) {
  const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
  const targets = [
    { id: "full_sign", name: "Full sign" },
    ...(document.designer?.zones ?? []).map((zone) => ({ id: zone.id, name: zone.name || zone.id })),
    ...(document.designer?.groups ?? []).map((group) => ({ id: group.id, name: group.name || group.id }))
  ];
  const [selectedClipId, setSelectedClipId] = useStatefulClip(activeScene?.clips ?? []);
  const [timelineDrag, setTimelineDrag] = React.useState<{ clip: ClipForm; mode: "move" | "start" | "end"; originX: number } | null>(null);
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const selectedClip = activeScene?.clips.find((clip) => clip.id === selectedClipId) ?? activeScene?.clips[0];
  const durationMs = Math.max(100, activeScene?.durationMs ?? 4000);

  function changeScene(sceneId: string) {
    onChange({ ...document, activeSceneId: sceneId, previewTimeMs: 0 });
  }

  function addScene() {
    const next = document.scenes.length + 1;
    const scene: SceneForm = { id: `scene_${next}`, name: `Scene ${next}`, loop: true, durationMs: 4000, clips: [] };
    onChange({ ...document, scenes: [...document.scenes, scene], activeSceneId: scene.id, previewTimeMs: 0 });
  }

  function updateScene(patch: Partial<SceneForm>) {
    if (!activeScene) return;
    onChange({ ...document, scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, ...patch } : scene) });
  }

  function removeScene() {
    if (!activeScene) return;
    const scenes = document.scenes.filter((scene) => scene.id !== activeScene.id);
    onChange({ ...document, scenes, activeSceneId: scenes[0]?.id ?? "", previewTimeMs: 0 });
  }

  function updateClip(clipId: string, patch: Partial<ClipForm>) {
    if (!activeScene) return;
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: scene.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip) } : scene)
    });
  }

  function addClip() {
    if (!activeScene) return;
    const next = activeScene.clips.length + 1;
    const effect = effects.solid ?? Object.values(effects)[0];
    const clip: ClipForm = {
      id: `clip_${next}`,
      name: `Clip ${next}`,
      target: selectedTargetId && targets.some((target) => target.id === selectedTargetId) ? selectedTargetId : "full_sign",
      coordinateSpace: "local",
      effect: effect?.id ?? "solid",
      blend: "replace",
      startMs: 0,
      durationMs: activeScene.durationMs,
      layer: next - 1,
      params: defaultParams(effect)
    };
    onChange({ ...document, scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: [...scene.clips, clip] } : scene) });
    setSelectedClipId(clip.id);
  }

  function removeClip() {
    if (!activeScene || !selectedClip) return;
    onChange({ ...document, scenes: document.scenes.map((scene) => scene.id === activeScene.id ? { ...scene, clips: scene.clips.filter((clip) => clip.id !== selectedClip.id) } : scene) });
    setSelectedClipId(undefined);
  }

  function beginClipDrag(event: React.PointerEvent<HTMLElement>, clip: ClipForm, mode: "move" | "start" | "end") {
    const track = timelineRef.current;
    if (!track) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedClipId(clip.id);
    const drag = { clip, mode, originX: event.clientX } as const;
    setTimelineDrag(drag);

    const move = (moveEvent: PointerEvent) => moveClipDrag(moveEvent.clientX, drag);
    const end = () => {
      setTimelineDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function moveClipDrag(clientX: number, drag = timelineDrag) {
    if (!drag || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaMs = Math.round(((clientX - drag.originX) / Math.max(1, rect.width)) * durationMs);
    const clip = drag.clip;
    if (drag.mode === "end") {
      updateClip(clip.id, { durationMs: Math.max(100, Math.min(durationMs - clip.startMs, clip.durationMs + deltaMs)) });
      return;
    }
    if (drag.mode === "start") {
      const endMs = clip.startMs + clip.durationMs;
      const startMs = Math.max(0, Math.min(endMs - 100, clip.startMs + deltaMs));
      updateClip(clip.id, { startMs, durationMs: endMs - startMs });
      return;
    }
    updateClip(clip.id, { startMs: Math.max(0, Math.min(durationMs - clip.durationMs, clip.startMs + deltaMs)) });
  }

  return (
    <section className="grid h-[300px] shrink-0 grid-cols-[260px_minmax(0,1fr)_300px] border-t border-border-2 bg-card">
      <div className="overflow-auto border-r border-border-2 p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><div className="text-body-sm font-semibold">Scenes</div><div className="text-meta text-muted-foreground">Playback timelines</div></div>
          <Button type="button" variant="outline" className="h-8 w-8 px-0" title="New scene" onClick={addScene}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {document.scenes.map((scene) => <button key={scene.id} type="button" onClick={() => changeScene(scene.id)} className={`w-full rounded-md border px-3 py-2 text-left ${scene.id === activeScene?.id ? "border-primary bg-surface-selected" : "border-border-2 hover:bg-surface-hover"}`}>
            <div className="truncate text-body-sm font-medium">{scene.name}</div>
            <div className="mt-0.5 flex justify-between font-mono text-meta text-muted-foreground"><span>{scene.clips.length} clips</span><span>{scene.durationMs} ms</span></div>
          </button>)}
        </div>
        {activeScene ? <div className="mt-3 space-y-2 border-t border-border-2 pt-3">
          <input className="h-8 w-full rounded-md border bg-card px-2 text-body-sm" value={activeScene.name} onChange={(event) => updateScene({ name: event.target.value })} />
          <label className="grid grid-cols-[1fr_84px] items-center gap-2 text-meta"><span>Duration (ms)</span><input className="h-8 rounded-md border bg-card px-2 text-right font-mono text-body-sm" type="number" min={100} value={activeScene.durationMs} onChange={(event) => updateScene({ durationMs: Math.max(100, Number(event.target.value)) })} /></label>
          <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={activeScene.loop} onChange={(event) => updateScene({ loop: event.target.checked })} />Loop</label>
          <Button type="button" variant="ghost" className="h-8 w-full text-destructive" onClick={removeScene}><Trash2 className="h-4 w-4" />Delete scene</Button>
        </div> : null}
      </div>

      <div className="min-w-0 overflow-auto p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><div className="text-body-sm font-semibold">{activeScene?.name ?? "Scene"}</div><div className="text-meta text-muted-foreground">Select a zone on canvas, then add its clip.</div></div>
          <div className="flex gap-2"><Button type="button" variant="outline" className="h-8" onClick={addClip}><Plus className="h-4 w-4" />Clip</Button><Button type="button" variant="outline" className="h-8" disabled={saving} onClick={onSave}><Save className="h-4 w-4" />{saving ? "Saving" : "Save"}</Button><Button type="button" className="h-8" disabled={previewing} onClick={onPreview}><Play className="h-4 w-4" />{previewing ? "Rendering" : "Run"}</Button><Button type="button" variant="outline" className="h-8" onClick={onTogglePlayback} disabled={previewing}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Pause" : "Play"}</Button></div>
        </div>
        <div className="min-w-[720px]">
          <div className="relative h-6 border-b border-border-2 text-meta text-muted-foreground">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction} className="absolute -translate-x-1/2" style={{ left: `${fraction * 100}%` }}>{Math.round(durationMs * fraction)} ms</span>)}
          </div>
          <div ref={timelineRef} className="relative mt-2 min-h-[184px] rounded-md border border-border-2 bg-surface-2" style={{ backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)", backgroundSize: "25% 100%" }}>
            {(activeScene?.clips ?? []).map((clip) => {
              const left = Math.max(0, Math.min(100, (clip.startMs / durationMs) * 100));
              const width = Math.max(3, Math.min(100 - left, (clip.durationMs / durationMs) * 100));
              return <div
                key={clip.id}
                role="button"
                tabIndex={0}
                onPointerDown={(event) => beginClipDrag(event, clip, "move")}
                onClick={() => setSelectedClipId(clip.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedClipId(clip.id);
                }}
                className={`absolute flex h-9 min-w-12 cursor-grab items-center overflow-hidden rounded border text-left text-meta shadow-sm ${timelineDrag?.clip.id === clip.id ? "cursor-grabbing" : ""} ${selectedClip?.id === clip.id ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card hover:bg-surface-hover"}`}
                style={{ left: `${left}%`, top: `${12 + Math.max(0, clip.layer) * 42}px`, width: `${width}%` }}
                title={`${clip.name}: drag to move`}
              >
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Resize clip start"
                  className="flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center bg-black/10 hover:bg-black/20"
                  onPointerDown={(event) => beginClipDrag(event, clip, "start")}
                  title="Resize start"
                >
                  <GripVertical className="h-3 w-3" />
                </span>
                <span className="block min-w-0 flex-1 truncate px-2">{clip.name}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Resize clip end"
                  className="flex h-full w-3 shrink-0 cursor-ew-resize items-center justify-center bg-black/10 hover:bg-black/20"
                  onPointerDown={(event) => beginClipDrag(event, clip, "end")}
                  title="Resize end"
                >
                  <GripVertical className="h-3 w-3" />
                </span>
              </div>;
            })}
          </div>
        </div>
      </div>

      <div className="overflow-auto border-l border-border-2 p-3">
        <div className="mb-3 text-body-sm font-semibold">{selectedClip ? "Clip inspector" : "Select a clip"}</div>
        {selectedClip ? <ClipInspector clip={selectedClip} targets={targets} effect={effects[selectedClip.effect]} effects={effects} onChange={(patch) => updateClip(selectedClip.id, patch)} onDelete={removeClip} /> : <div className="rounded-md border border-dashed p-4 text-body-sm text-muted-foreground">Create a clip for the selected zone or choose Full sign.</div>}
      </div>
    </section>
  );
}

function useStatefulClip(clips: ClipForm[]) {
  const [selectedClipId, setSelectedClipId] = React.useState<string | undefined>(clips[0]?.id);
  React.useEffect(() => { if (selectedClipId && clips.some((clip) => clip.id === selectedClipId)) return; setSelectedClipId(clips[0]?.id); }, [clips, selectedClipId]);
  return [selectedClipId, setSelectedClipId] as const;
}

function ClipInspector({ clip, targets, effect, effects, onChange, onDelete }: { clip: ClipForm; targets: Array<{ id: string; name: string }>; effect?: EffectDefinition; effects: Record<string, EffectDefinition>; onChange: (patch: Partial<ClipForm>) => void; onDelete: () => void }) {
  const definition = effect ?? effects.solid;
  return <div className="space-y-2">
    <input className="h-8 w-full rounded-md border bg-card px-2 text-body-sm" value={clip.name} onChange={(event) => onChange({ name: event.target.value })} />
    <Select label="Target" value={clip.target} options={targets.map((target) => [target.id, target.name])} onChange={(target) => onChange({ target })} />
    <Select label="Effect" value={clip.effect} options={Object.values(effects).map((item) => [item.id, item.label])} onChange={(effectId) => onChange({ effect: effectId, params: defaultParams(effects[effectId]) })} />
    <Select label="Space" value={clip.coordinateSpace ?? "local"} options={[["serial", "Serial"], ["local", "Local target"], ["global", "Global sign"]]} onChange={(coordinateSpace) => onChange({ coordinateSpace: coordinateSpace as ClipForm["coordinateSpace"] })} />
    <ClipTimingEditor clip={clip} onChange={onChange} />
    <NumberInput label="Layer" value={clip.layer} onChange={(layer) => onChange({ layer: Math.max(0, Math.round(layer)) })} />
    {definition ? <div className="space-y-2 border-t border-border-2 pt-3">{Object.entries(definition.parameters).map(([key, parameter]) => <ParameterInput key={key} name={key} definition={parameter} value={clip.params[key]} onChange={(value) => onChange({ params: { ...clip.params, [key]: value } })} />)}</div> : null}
    <Button type="button" variant="ghost" className="h-8 w-full text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" />Delete clip</Button>
  </div>;
}

function ClipTimingEditor({ clip, onChange }: { clip: ClipForm; onChange: (patch: Partial<ClipForm>) => void }) {
  const [startDraft, setStartDraft] = React.useState(String(clip.startMs));
  const [endDraft, setEndDraft] = React.useState(String(clip.startMs + clip.durationMs));

  React.useEffect(() => {
    setStartDraft(String(clip.startMs));
    setEndDraft(String(clip.startMs + clip.durationMs));
  }, [clip.id, clip.startMs, clip.durationMs]);

  function applyTiming() {
    const parsedStart = Number(startDraft);
    const parsedEnd = Number(endDraft);
    if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
      setStartDraft(String(clip.startMs));
      setEndDraft(String(clip.startMs + clip.durationMs));
      return;
    }
    const startMs = Math.max(0, Math.round(parsedStart));
    const endMs = Math.max(startMs + 100, Math.round(parsedEnd));
    onChange({ startMs, durationMs: endMs - startMs });
  }

  return <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
    <label className="grid gap-1 text-meta">
      <span>Start (ms)</span>
      <input
        className="h-8 rounded-md border bg-card px-2 text-right font-mono text-body-sm"
        type="text"
        inputMode="numeric"
        value={startDraft}
        onChange={(event) => setStartDraft(event.target.value)}
        onBlur={applyTiming}
        onKeyDown={(event) => { if (event.key === "Enter") applyTiming(); }}
      />
    </label>
    <label className="grid gap-1 text-meta">
      <span>End (ms)</span>
      <input
        className="h-8 rounded-md border bg-card px-2 text-right font-mono text-body-sm"
        type="text"
        inputMode="numeric"
        value={endDraft}
        onChange={(event) => setEndDraft(event.target.value)}
        onBlur={applyTiming}
        onKeyDown={(event) => { if (event.key === "Enter") applyTiming(); }}
      />
    </label>
    <Button type="button" variant="outline" className="h-8 px-3" onClick={applyTiming}>Apply</Button>
  </div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) { return <label className="grid gap-1 text-meta"><span>{label}</span><select className="h-8 rounded-md border bg-card px-2 text-body-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
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
function defaultParams(effect?: EffectDefinition): ClipParams { return Object.fromEntries(Object.entries(effect?.parameters ?? {}).map(([key, parameter]) => [key, parameter.default ?? (parameter.type === "color" ? "#FFFFFF" : parameter.type === "boolean" ? false : parameter.type === "select" ? parameter.options?.[0]?.value ?? "" : 0)])); }
