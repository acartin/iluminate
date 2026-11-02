"use client";

import * as React from "react";
import { Eye, EyeOff, GripVertical, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import type { EffectParameterValue, EffectParams, Partitura } from "@iluminate/lighting-core";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import { Button } from "@/components/ui/button";
import {
  clipWithViewerOverride,
  materializeViewerPartitura,
  viewerClipKey,
  type ViewerClipOverride,
  type ViewerClipOverrides
} from "./viewer-variation-model";
import responsive from "./viewer-responsive.module.css";

type EffectCatalog = Record<string, EffectDefinition>;
type DragState = {
  key: string;
  mode: "move" | "start" | "end";
  originX: number;
  startMs: number;
  durationMs: number;
};

const MIN_CLIP_MS = 100;

export function ViewerVariationTimeline({
  partitura,
  bundleHash,
  sceneId,
  timeMs,
  tracksVisible,
  resetVersion,
  onSeek,
  onPartituraChange
}: {
  partitura: Partitura;
  bundleHash: string;
  sceneId: string;
  timeMs: number;
  tracksVisible: boolean;
  resetVersion: number;
  onSeek: (timeMs: number) => void;
  onPartituraChange: (partitura: Partitura) => void;
}) {
  const scene = partitura.scenes.find((candidate) => candidate.id === sceneId) ?? partitura.scenes[0];
  const timelineRef = React.useRef<HTMLDivElement | null>(null);
  const overridesRef = React.useRef<ViewerClipOverrides>({});
  const [overrides, setOverrides] = React.useState<ViewerClipOverrides>({});
  const [effects, setEffects] = React.useState<EffectCatalog>({});
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [storageReady, setStorageReady] = React.useState(false);
  const resetVersionRef = React.useRef(resetVersion);
  const storageKey = `iluminate.viewer.variations.${bundleHash}`;

  React.useEffect(() => {
    let active = true;
    void fetch("/api/lighting/effects", { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Effect catalog unavailable.");
        return response.json() as Promise<{ effects: EffectCatalog }>;
      })
      .then(({ effects: loadedEffects }) => {
        if (!active) return;
        setEffects(loadedEffects);
        const restored = restoreOverrides(partitura, loadedEffects, window.localStorage.getItem(storageKey));
        overridesRef.current = restored;
        setOverrides(restored);
        setStorageReady(true);
        if (Object.keys(restored).length) onPartituraChange(materializeViewerPartitura(partitura, restored));
      })
      .catch(() => {
        if (!active) return;
        setStorageReady(true);
      });
    return () => { active = false; };
  }, [bundleHash, partitura.sourceChecksum]);

  React.useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, overrides }));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [overrides, storageKey, storageReady]);

  React.useEffect(() => setSelectedKey(null), [sceneId]);

  React.useEffect(() => {
    if (resetVersionRef.current === resetVersion) return;
    resetVersionRef.current = resetVersion;
    overridesRef.current = {};
    setOverrides({});
    window.localStorage.removeItem(storageKey);
    onPartituraChange(partitura);
  }, [resetVersion]);

  if (!scene) return null;
  const clips = scene.tracks.flatMap((track) => track.clips.map((clip) => {
    const key = viewerClipKey(scene.id, track.id, clip.id);
    const override = overrides[key];
    return { key, track, original: clip, clip: clipWithViewerOverride(clip, override, scene.durationMs), override };
  }));
  const selected = clips.find((entry) => entry.key === selectedKey) ?? clips[0] ?? null;

  function applyOverrides(next: ViewerClipOverrides) {
    overridesRef.current = next;
    setOverrides(next);
    onPartituraChange(materializeViewerPartitura(partitura, next));
  }

  function patchOverride(key: string, patch: Partial<ViewerClipOverride>) {
    const current = overridesRef.current[key] ?? {};
    applyOverrides({ ...overridesRef.current, [key]: { ...current, ...patch } });
  }

  function resetClip(key: string) {
    const next = { ...overridesRef.current };
    delete next[key];
    applyOverrides(next);
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>, key: string, mode: DragState["mode"], startMs: number, durationMs: number) {
    event.preventDefault();
    event.stopPropagation();
    if (window.matchMedia("(min-width: 1024px)").matches) setSelectedKey(key);
    const drag: DragState = { key, mode, originX: event.clientX, startMs, durationMs };
    let moved = false;
    const move = (moveEvent: PointerEvent) => {
      if (Math.abs(moveEvent.clientX - drag.originX) > 3) moved = true;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gutterWidth = timelineGutterWidth(timelineRef.current);
      const axisWidth = Math.max(1, rect.width - gutterWidth);
      const deltaMs = Math.round((moveEvent.clientX - drag.originX) / axisWidth * scene.durationMs);
      if (drag.mode === "start") {
        const endMs = drag.startMs + drag.durationMs;
        const startMs = clamp(drag.startMs + deltaMs, 0, endMs - MIN_CLIP_MS);
        patchOverride(drag.key, { startMs, durationMs: endMs - startMs });
      } else if (drag.mode === "end") {
        const endMs = clamp(drag.startMs + drag.durationMs + deltaMs, drag.startMs + MIN_CLIP_MS, scene.durationMs);
        patchOverride(drag.key, { durationMs: endMs - drag.startMs });
      } else {
        patchOverride(drag.key, { startMs: clamp(drag.startMs + deltaMs, 0, scene.durationMs - drag.durationMs) });
      }
    };
    const end = (endEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (endEvent.type === "pointerup" && !moved && !window.matchMedia("(min-width: 1024px)").matches) setSelectedKey(key);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function seekFromClientX(clientX: number) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutterWidth = timelineGutterWidth(timelineRef.current);
    onSeek(clamp((clientX - rect.left - gutterWidth) / Math.max(1, rect.width - gutterWidth) * scene.durationMs, 0, scene.durationMs));
  }

  function beginPlayheadDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    seekFromClientX(event.clientX);
    const move = (moveEvent: PointerEvent) => seekFromClientX(moveEvent.clientX);
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  return (
    <>
      <div className={`${tracksVisible ? "block" : "hidden"} min-w-0 shrink-0 overflow-hidden border-t border-slate-700 bg-slate-900 text-slate-100 lg:col-start-1 lg:row-start-2`}>
        <div className="max-h-[30dvh] min-h-[132px] overflow-x-hidden overflow-y-auto lg:h-[clamp(160px,28dvh,300px)] lg:max-h-none lg:overflow-auto">
          <div ref={timelineRef} className="relative w-full min-w-0 [--viewer-track-gutter:64px] [--viewer-track-row:34px] sm:[--viewer-track-gutter:80px] sm:[--viewer-track-row:38px] lg:min-w-[760px] lg:[--viewer-track-gutter:112px] lg:[--viewer-track-row:42px]" style={{ height: `calc(18px + ${scene.tracks.length} * var(--viewer-track-row))` }} onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const gutterWidth = timelineGutterWidth(event.currentTarget);
            onSeek(clamp((event.clientX - rect.left - gutterWidth) / Math.max(1, rect.width - gutterWidth) * scene.durationMs, 0, scene.durationMs));
          }}>
            <div className="absolute left-0 right-0 top-0 h-[18px] border-b border-slate-700 bg-slate-950/60" />
            {timelineTicks(scene.durationMs).map((tick) => <span key={tick} className="pointer-events-none absolute top-0 -translate-x-1/2 font-mono text-[8px] leading-[18px] text-slate-500 sm:text-[9px]" style={{ left: `calc(var(--viewer-track-gutter) + (100% - var(--viewer-track-gutter)) * ${tick / scene.durationMs})` }}>{formatShortTime(tick)}</span>)}
            {scene.tracks.map((track, trackIndex) => <div key={track.id} className="absolute left-0 right-0 border-b border-slate-700/80" style={{ top: `calc(18px + ${trackIndex} * var(--viewer-track-row))`, height: "var(--viewer-track-row)" }}>
              <div className="absolute inset-y-0 left-0 flex w-[var(--viewer-track-gutter)] items-center border-r border-slate-700 bg-slate-950/70 px-1.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400 sm:px-2 sm:text-[9px] lg:text-[10px]"><span className="truncate">{track.name || `Track ${trackIndex + 1}`}</span></div>
            </div>)}
            {clips.map(({ key, track, clip, override }) => {
              const trackIndex = scene.tracks.indexOf(track);
              const startRatio = clip.startMs / scene.durationMs;
              const durationRatio = clip.durationMs / scene.durationMs;
              const displayName = viewerClipDisplayName(clip, track);
              const removed = override?.removed === true;
              const disabled = override?.enabled === false;
              return <div
                key={key}
                role="button"
                tabIndex={0}
                className={`absolute z-10 flex h-7 min-w-[8px] items-center overflow-hidden rounded border px-0 text-[9px] shadow-sm sm:h-8 sm:min-w-3 sm:text-[10px] lg:h-9 lg:min-w-9 lg:px-3 lg:text-[11px] ${removed ? "border-dashed border-rose-500/70 bg-rose-950/60 opacity-65" : selected?.key === key ? "border-blue-400 bg-blue-600 text-white" : "border-slate-500 bg-slate-800 hover:bg-slate-700"} ${disabled ? "opacity-50" : ""}`}
                style={{ left: `calc(var(--viewer-track-gutter) + (100% - var(--viewer-track-gutter)) * ${startRatio})`, width: `calc((100% - var(--viewer-track-gutter)) * ${durationRatio})`, top: `calc(21px + ${trackIndex} * var(--viewer-track-row))` }}
                title={`${displayName} · ${formatShortTime(clip.startMs)}–${formatShortTime(clip.startMs + clip.durationMs)}`}
                onClick={() => setSelectedKey(key)}
                onPointerDown={(event) => !removed && beginDrag(event, key, "move", clip.startMs, clip.durationMs)}
              >
                <span className="absolute inset-y-0 left-0 flex w-2 cursor-ew-resize items-center justify-center bg-black/20 lg:w-3" onPointerDown={(event) => !removed && beginDrag(event, key, "start", clip.startMs, clip.durationMs)}><GripVertical className="hidden h-3 w-3 lg:block" /></span>
                <button type="button" className="ml-1 hidden h-full w-6 shrink-0 items-center justify-center lg:flex" title={disabled ? "Enable clip" : "Disable clip"} onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); patchOverride(key, { enabled: disabled }); }}>
                  {disabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <span className="block min-w-0 flex-1 truncate px-1 text-[8px] sm:text-[10px] lg:text-[11px]">{removed ? "Removed" : displayName}</span>
                <button type="button" className="hidden h-full w-6 shrink-0 items-center justify-center lg:flex" title={removed ? "Restore clip" : "Remove locally"} onPointerDown={stopPointer} onClick={(event) => { event.stopPropagation(); patchOverride(key, { removed: !removed }); }}>
                  {removed ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
                <span className="absolute inset-y-0 right-0 flex w-2 cursor-ew-resize items-center justify-center bg-black/20 lg:w-3" onPointerDown={(event) => !removed && beginDrag(event, key, "end", clip.startMs, clip.durationMs)}><GripVertical className="hidden h-3 w-3 lg:block" /></span>
              </div>;
            })}
            <button
              type="button"
              aria-label="Playhead"
              title={formatShortTime(timeMs)}
              className="absolute bottom-0 top-0 z-30 w-5 -translate-x-1/2 cursor-ew-resize touch-none"
              style={{ left: `calc(var(--viewer-track-gutter) + (100% - var(--viewer-track-gutter)) * ${clamp(timeMs, 0, scene.durationMs) / scene.durationMs})` }}
              onPointerDown={beginPlayheadDrag}
            >
              <span className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-red-500" />
              <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow" />
            </button>
          </div>
        </div>
      </div>
      {selectedKey ? <button type="button" aria-label="Close clip inspector" className={`${responsive.inspectorBackdrop} lg:hidden`} onClick={() => setSelectedKey(null)} /> : null}
      <aside className={`${selectedKey ? responsive.inspectorOpen : responsive.inspectorClosed} min-h-0 overflow-y-auto border-t border-slate-700 bg-slate-900 p-4 text-slate-100 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:border-l lg:border-t-0 lg:p-5`}>
        {selected ? <ViewerClipInspector
          clip={selected.clip}
          name={viewerClipDisplayName(selected.clip, selected.track)}
          override={selected.override}
          effects={effects}
          onChange={(patch) => patchOverride(selected.key, patch)}
          onReset={() => resetClip(selected.key)}
          onClose={() => setSelectedKey(null)}
        /> : <div className="text-sm text-slate-400">This scene has no editable clips.</div>}
      </aside>
    </>
  );
}

function ViewerClipInspector({ clip, name, override, effects, onChange, onReset, onClose }: {
  clip: Partitura["scenes"][number]["tracks"][number]["clips"][number];
  name: string;
  override?: ViewerClipOverride;
  effects: EffectCatalog;
  onChange: (patch: Partial<ViewerClipOverride>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const definition = effects[clip.effect];
  const disabled = override?.enabled === false;
  const removed = override?.removed === true;
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Clip</div>
        <div className="truncate text-sm font-medium text-slate-100" title={name}>{name}</div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" density="compact" disabled={!override} onClick={onReset}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
        <Button className="w-8 px-0 lg:hidden" variant="ghost" density="compact" aria-label="Close clip inspector" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 lg:hidden">
      <Button variant="outline" density="compact" onClick={() => onChange({ enabled: disabled })}>{disabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{disabled ? "Enable" : "Disable"}</Button>
      <Button variant="outline" density="compact" onClick={() => onChange({ removed: !removed })}>{removed ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}{removed ? "Restore" : "Remove"}</Button>
    </div>
    <label className="grid gap-1 text-xs text-slate-300">Effect
      <select className="h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-sm text-white" value={clip.effect} disabled={!Object.keys(effects).length} onChange={(event) => {
        const effect = effects[event.target.value];
        onChange({ effect: event.target.value, params: defaultParams(effect), removed: false });
      }}>
        {Object.values(effects).map((effect) => <option key={effect.id} value={effect.id}>{effect.label}</option>)}
        {!effects[clip.effect] ? <option value={clip.effect}>{clip.effect}</option> : null}
      </select>
    </label>
    {definition ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{Object.entries(definition.parameters).map(([name, parameter]) => <ViewerParameterInput key={name} name={name} definition={parameter} value={clip.params[name]} onChange={(value) => onChange({ params: { ...clip.params, [name]: value } })} />)}</div> : null}
    <div className="grid grid-cols-2 gap-2 border-t border-slate-700 pt-3">
      <ViewerTimeInput label="Start" value={clip.startMs} onChange={(startMs) => onChange({ startMs })} />
      <ViewerTimeInput label="Duration" value={clip.durationMs} onChange={(durationMs) => onChange({ durationMs })} />
    </div>
  </div>;
}

function ViewerParameterInput({ name, definition, value, onChange }: { name: string; definition: EffectParameterDefinition; value: EffectParameterValue | undefined; onChange: (value: EffectParameterValue) => void }) {
  const label = definition.label ?? name;
  if (definition.type === "color") return <label className="grid gap-1 text-xs text-slate-300"><span>{label}</span><input type="color" className="h-9 w-full rounded border border-slate-600 bg-slate-950 p-1" value={typeof value === "string" ? value : String(definition.default ?? "#FFFFFF")} onChange={(event) => onChange(event.target.value)} /></label>;
  if (definition.type === "boolean") return <label className="flex h-9 items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={Boolean(value ?? definition.default)} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  if (definition.type === "select") return <label className="grid gap-1 text-xs text-slate-300"><span>{label}</span><select className="h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-sm" value={String(value ?? definition.default ?? "")} onChange={(event) => onChange(event.target.value)}>{(definition.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const number = typeof value === "number" ? value : typeof definition.default === "number" ? definition.default : 0;
  return <label className="grid gap-1 text-xs text-slate-300"><span>{label}{definition.unit ? ` (${definition.unit})` : ""}</span><input type="number" className="h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-right font-mono text-sm" min={definition.min} max={definition.max} step={definition.type === "integer" ? 1 : 0.1} value={number} onChange={(event) => onChange(clamp(Number(event.target.value), definition.min ?? Number.NEGATIVE_INFINITY, definition.max ?? Number.POSITIVE_INFINITY))} /></label>;
}

function ViewerTimeInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 text-xs text-slate-300"><span>{label} (s)</span><input type="number" min={0} step={0.1} className="h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-right font-mono text-sm" value={(value / 1000).toFixed(1)} onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) * 1000)))} /></label>;
}

function viewerClipDisplayName(
  clip: Partitura["scenes"][number]["tracks"][number]["clips"][number],
  track: Partitura["scenes"][number]["tracks"][number]
) {
  return clip.name || (track.clips.length === 1 ? track.name : "Clip");
}

function restoreOverrides(partitura: Partitura, effects: EffectCatalog, serialized: string | null): ViewerClipOverrides {
  if (!serialized) return {};
  try {
    const parsed = JSON.parse(serialized) as { version?: number; overrides?: Record<string, unknown> };
    if (parsed.version !== 1 || !parsed.overrides || typeof parsed.overrides !== "object") return {};
    const restored: ViewerClipOverrides = {};
    for (const scene of partitura.scenes) for (const track of scene.tracks) for (const clip of track.clips) {
      const key = viewerClipKey(scene.id, track.id, clip.id);
      const raw = parsed.overrides[key];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const candidate = raw as ViewerClipOverride;
      const effect = typeof candidate.effect === "string" && effects[candidate.effect] ? candidate.effect : clip.effect;
      restored[key] = {
        enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : undefined,
        removed: typeof candidate.removed === "boolean" ? candidate.removed : undefined,
        startMs: finiteNumber(candidate.startMs),
        durationMs: finiteNumber(candidate.durationMs),
        effect,
        params: sanitizeParams(effects[effect], candidate.params, clip.params)
      };
    }
    return restored;
  } catch {
    return {};
  }
}

function sanitizeParams(definition: EffectDefinition | undefined, params: EffectParams | undefined, fallback: EffectParams) {
  if (!definition) return fallback;
  return Object.fromEntries(Object.entries(definition.parameters).map(([name, parameter]) => {
    const value = params?.[name] ?? fallback[name] ?? parameter.default;
    if (parameter.type === "color") return [name, typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#FFFFFF"];
    if (parameter.type === "boolean") return [name, Boolean(value)];
    if (parameter.type === "select") return [name, parameter.options?.some((option) => option.value === value) ? value : parameter.options?.[0]?.value ?? ""];
    const number = typeof value === "number" && Number.isFinite(value) ? value : typeof parameter.default === "number" ? parameter.default : 0;
    return [name, clamp(number, parameter.min ?? Number.NEGATIVE_INFINITY, parameter.max ?? Number.POSITIVE_INFINITY)];
  })) as EffectParams;
}

function defaultParams(effect?: EffectDefinition): EffectParams {
  return Object.fromEntries(Object.entries(effect?.parameters ?? {}).map(([name, parameter]) => [name, parameter.default ?? (parameter.type === "color" ? "#FFFFFF" : parameter.type === "boolean" ? false : parameter.type === "select" ? parameter.options?.[0]?.value ?? "" : 0)])) as EffectParams;
}

function timelineTicks(durationMs: number) {
  return Array.from({ length: 5 }, (_, index) => Math.round(durationMs * index / 4));
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatShortTime(timeMs: number) {
  return `${(timeMs / 1000).toFixed(1)}s`;
}

function stopPointer(event: React.PointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function timelineGutterWidth(element: HTMLElement | null) {
  if (!element || typeof window === "undefined") return 112;
  const value = Number.parseFloat(window.getComputedStyle(element).getPropertyValue("--viewer-track-gutter"));
  return Number.isFinite(value) ? value : 112;
}
