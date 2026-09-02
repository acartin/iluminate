"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Pause, Play, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import {
  clonePartituraDocument,
  ClipParams,
  ClipForm,
  normalizeDefaultSignLayout,
  PartituraDocument,
  PersistedPartitura,
  SceneForm,
  SegmentForm,
  ZoneForm
} from "@/lib/lighting/partitura-model";

type ApiResult = {
  ok: boolean;
  validation: {
    errors: Array<{ code: string; path: string; message: string }>;
    warnings: Array<{ code: string; path: string; message: string }>;
  };
  partitura?: unknown;
  preview?: Preview | null;
  message?: string;
};

type EffectCatalog = Record<string, EffectDefinition>;

type Preview = {
  sceneId: string;
  timeMs: number;
  protocol: string;
  bitTimeUs: number;
  resetTimeUs: number;
  bitsPerPixel: number;
  longestOutputTransmitTimeUs: number;
  estimatedMaxRefreshRateFps: number;
  pixelCount: number;
  outputRows: Array<{
    output: number;
    chainId: string;
    pixelCount: number;
    transmitTimeUs: number;
    maxRefreshRateFps: number;
    pixels: Array<{ output: number; index: number; x: number; y: number; order: number; normalizedX: number; normalizedY: number; color: { r: number; g: number; b: number } }>;
  }>;
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "scenes", label: "Scenes" },
  { id: "layout", label: "Layout" },
  { id: "effect_lab", label: "Effect Lab" },
  { id: "simulator", label: "Simulator" }
];

export function PartituraWorkspace({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState(() => normalizeDefaultSignLayout(initialPartitura.document));
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [activeTab, setActiveTab] = useState("overview");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);

  const activeScene = useMemo(
    () => document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0],
    [document.activeSceneId, document.scenes]
  );
  const clipCount = document.scenes.reduce((total, scene) => total + scene.clips.length, 0);
  const ledCount = document.chain1Pixels + document.chain2Pixels + document.chain3Pixels;

  useEffect(() => {
    let cancelled = false;

    async function loadEffects() {
      const response = await fetch("/api/lighting/effects", { cache: "no-store" });
      const payload = (await response.json()) as { effects?: EffectCatalog };
      if (!cancelled) setEffectCatalog(payload.effects ?? {});
    }

    void loadEffects();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextDocument = document, patch: Partial<PersistedPartitura> = {}) {
    const normalizedDocument = normalizeDefaultSignLayout(nextDocument);
    setSaving(true);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name ?? partitura.name,
          status: patch.status ?? partitura.status,
          document: normalizedDocument,
          generatedPartitura: patch.generatedPartitura ?? partitura.generatedPartitura ?? null,
          validationReport: patch.validationReport ?? partitura.validationReport ?? {}
        })
      });
      const payload = (await response.json()) as { partitura?: PersistedPartitura };
      if (payload.partitura) {
        setPartitura(payload.partitura);
        setDocument(clonePartituraDocument(payload.partitura.document));
      }
    } finally {
      setSaving(false);
    }
  }

  async function generate(openPlayer = false) {
    const normalizedDocument = normalizeDefaultSignLayout(document);
    setDocument(normalizedDocument);
    setGenerating(true);
    try {
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedDocument)
      });
      const payload = (await response.json()) as ApiResult;
      setResult(payload);
      if (payload.ok) {
        await save(normalizedDocument, {
          status: "validated",
          generatedPartitura: payload.partitura,
          validationReport: payload.validation
        });
      }
      if (openPlayer) setPlayerOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  function patchDocument(patch: Partial<PartituraDocument>) {
    setDocument((current) => ({ ...current, ...patch }));
  }

  function openPlayerForScene(sceneId?: string) {
    if (sceneId) {
      setDocument((current) => ({ ...current, activeSceneId: sceneId, previewTimeMs: 0 }));
    }
    setPlayerOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{partitura.clientName}</Badge>
            <Badge>{partitura.status}</Badge>
            <Badge>partitura.v1</Badge>
          </div>
          <h1 className="text-page-title font-light">{partitura.name}</h1>
          <p className="mt-2 max-w-3xl text-page-subtitle text-muted-foreground">
            Partitura workspace for scenes, logical layout and simulator validation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" type="button">
            <Link href="/partituras/generator">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button variant="outline" type="button" onClick={() => setPlayerOpen(true)}>
            <Play className="h-4 w-4" />
            Player
          </Button>
          <Button type="button" onClick={() => save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border-2 bg-card px-4 py-3">
        <Tabs items={tabs} value={activeTab} onValueChange={setActiveTab} className="max-w-full overflow-x-auto" />
      </div>

      {activeTab === "overview" ? (
        <OverviewTab
          partitura={partitura}
          document={document}
          ledCount={ledCount}
          clipCount={clipCount}
          onNameChange={(name) => setPartitura((current) => ({ ...current, name }))}
        />
      ) : activeTab === "scenes" ? (
        <ScenesTab effectCatalog={effectCatalog} document={document} activeScene={activeScene} onChange={setDocument} onOpenPlayer={openPlayerForScene} />
      ) : activeTab === "layout" ? (
        <LayoutTab document={document} onChange={setDocument} />
      ) : activeTab === "effect_lab" ? (
        <EffectLabTab effectCatalog={effectCatalog} />
      ) : (
        <SimulatorTab
          result={result}
          generating={generating}
          onGenerate={() => generate(false)}
          onOpenPlayer={() => generate(true)}
        />
      )}

      <PlayerModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        document={document}
        result={result}
        generating={generating}
        onGenerate={() => generate(false)}
        onResult={setResult}
      />
    </div>
  );
}

function OverviewTab({
  partitura,
  document,
  ledCount,
  clipCount,
  onNameChange
}: {
  partitura: PersistedPartitura;
  document: PartituraDocument;
  ledCount: number;
  clipCount: number;
  onNameChange: (name: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Scenes" value={document.scenes.length} />
        <Metric label="Clips" value={clipCount} />
        <Metric label="Segments" value={document.segments.length} />
        <Metric label="LEDs" value={ledCount} />
      </div>
      <Card>
        <CardHeader>
          <div className="text-card-title font-medium">Partitura Summary</div>
          <div className="mt-1 text-body-sm text-muted-foreground">Editable identity and current persisted state.</div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={partitura.name} onChange={(event) => onNameChange(event.target.value)} />
          </Field>
          <Field label="Project document ID">
            <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={document.projectId} readOnly />
          </Field>
          <ReadOnly label="Partitura key" value={partitura.partituraKey} />
          <ReadOnly label="Updated" value={new Date(partitura.updatedAt).toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function ScenesTab({
  effectCatalog,
  document,
  activeScene,
  onChange,
  onOpenPlayer
}: {
  effectCatalog: EffectCatalog;
  document: PartituraDocument;
  activeScene?: SceneForm;
  onChange: (document: PartituraDocument) => void;
  onOpenPlayer: (sceneId?: string) => void;
}) {
  const targetOptions = document.zones.map((zone) => {
    const summary = summarizeZone(document, zone);
    return [zone.id, `${zone.name || zone.id} · ${summary.outputs} · ${summary.ranges}`] as const;
  });
  const targetSummaries = Object.fromEntries(
    document.zones.map((zone) => {
      const summary = summarizeZone(document, zone);
      return [zone.id, { name: zone.name || zone.id, detail: `${summary.outputs} · ${summary.leds} LEDs` }];
    })
  );
  const activeSceneIndex = Math.max(0, document.scenes.findIndex((scene) => scene.id === document.activeSceneId));
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const sortedClips = (activeScene?.clips ?? [])
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.layer - right.clip.layer || left.clip.startMs - right.clip.startMs);
  const selectedClip = activeScene?.clips[selectedClipIndex] ?? activeScene?.clips[0];
  const selectedClipActualIndex = activeScene?.clips[selectedClipIndex] ? selectedClipIndex : 0;

  function updateScene(index: number, patch: Partial<SceneForm>) {
    const previousId = document.scenes[index]?.id;
    const scenes = document.scenes.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...patch } : scene));
    const activeSceneId = previousId && document.activeSceneId === previousId && patch.id ? patch.id : document.activeSceneId;
    onChange({ ...document, scenes, activeSceneId });
  }

  function addScene() {
    const nextIndex = document.scenes.length + 1;
    const scene = { id: `scene_${nextIndex}`, name: `Scene ${nextIndex}`, loop: true, durationMs: 4000, clips: [] };
    onChange({ ...document, scenes: [...document.scenes, scene], activeSceneId: scene.id });
  }

  function removeScene(index: number) {
    if (document.scenes.length <= 1) return;
    const removed = document.scenes[index];
    const scenes = document.scenes.filter((_, sceneIndex) => sceneIndex !== index);
    onChange({ ...document, scenes, activeSceneId: removed?.id === document.activeSceneId ? scenes[0]?.id ?? "normal" : document.activeSceneId });
  }

  function updateClip(index: number, patch: Partial<ClipForm>) {
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.id === document.activeSceneId
          ? { ...scene, clips: scene.clips.map((clip, clipIndex) => (clipIndex === index ? { ...clip, ...patch } : clip)) }
          : scene
      )
    });
  }

  function addClip() {
    const nextIndex = (activeScene?.clips.length ?? 0) + 1;
    const clip: ClipForm = {
      id: `clip_${nextIndex}`,
      name: `Clip ${nextIndex}`,
      target: document.zones[0]?.id ?? "primary_zone",
      effect: "solid",
      blend: "max",
      startMs: 0,
      durationMs: activeScene?.durationMs ?? 4000,
      layer: nextIndex,
      params: defaultParamsForEffect(effectCatalog, "solid", document.accentColor)
    };
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => (scene.id === document.activeSceneId ? { ...scene, clips: [...scene.clips, clip] } : scene))
    });
    setSelectedClipIndex(nextIndex - 1);
  }

  function removeClip(index: number) {
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.id === document.activeSceneId ? { ...scene, clips: scene.clips.filter((_, clipIndex) => clipIndex !== index) } : scene
      )
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-card-title font-medium">Scenes</div>
                <div className="mt-1 text-body-sm text-muted-foreground">{document.scenes.length} timeline{document.scenes.length === 1 ? "" : "s"}</div>
              </div>
              <Button type="button" onClick={addScene}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {document.scenes.map((scene, index) => (
              <button
                key={`${scene.id}:${index}`}
                type="button"
                className={`w-full rounded-md border p-3 text-left transition hover:bg-surface-hover ${scene.id === document.activeSceneId ? "border-ring bg-surface-2" : "border-border-2 bg-card"}`}
                onClick={() => onChange({ ...document, activeSceneId: scene.id })}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-body-sm font-medium">{scene.name}</span>
                  <Badge>{scene.loop ? "Loop" : "Once"}</Badge>
                </div>
                <div className="mt-1 font-mono text-meta text-muted-foreground">{scene.id}</div>
                <div className="mt-2 flex justify-between text-meta text-muted-foreground">
                  <span>{scene.clips.length} clips</span>
                  <span>{scene.durationMs} ms</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-card-title font-medium">Selected Scene</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{activeScene?.id ?? "-"}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name">
              <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={activeScene?.name ?? ""} onChange={(event) => updateScene(activeSceneIndex, { name: event.target.value })} />
            </Field>
            <Field label="Scene ID">
              <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={activeScene?.id ?? ""} onChange={(event) => updateScene(activeSceneIndex, { id: event.target.value })} />
            </Field>
            <NumberField label="Duration ms" value={activeScene?.durationMs ?? 0} onChange={(durationMs) => updateScene(activeSceneIndex, { durationMs })} />
            <label className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" checked={activeScene?.loop ?? false} onChange={(event) => updateScene(activeSceneIndex, { loop: event.target.checked })} />
              Loop scene
            </label>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => activeScene ? onOpenPlayer(activeScene.id) : undefined}>
                <Play className="h-4 w-4" />
                Player
              </Button>
              <Button type="button" variant="ghost" className="h-9 w-9 px-0" title="Delete scene" onClick={() => removeScene(activeSceneIndex)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <EditableTable title={`Clips in ${activeScene?.name ?? "scene"}`} description="Layered events rendered by the selected scene." onAdd={addClip}>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[24%]" />
            <col className="w-[180px]" />
            <col className="w-[120px]" />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-border-2 text-left text-grid-header font-semibold text-ink-muted">
              <th className="px-2 py-1.5">Clip</th>
              <th className="px-2 py-1.5">Target</th>
              <th className="px-2 py-1.5">Effect</th>
              <th className="px-2 py-1.5 text-right">Time</th>
              <th className="px-2 py-1.5 text-right">Layer</th>
              <th className="px-2 py-1.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(activeScene?.clips ?? []).map((clip, index) => (
              <tr key={`${clip.id}:${index}`} className={`border-b last:border-0 hover:bg-surface-hover ${index === selectedClipActualIndex ? "bg-surface-2" : ""}`} onClick={() => setSelectedClipIndex(index)}>
                <td className="px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-body-sm font-medium">{clip.name}</div>
                    <div className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{clip.id}</div>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-body-sm">{targetSummaries[clip.target]?.name ?? clip.target}</div>
                    <div className="truncate text-[10px] leading-3 text-muted-foreground">{targetSummaries[clip.target]?.detail ?? "Unmapped target"}</div>
                  </div>
                </td>
                <td className="px-2 py-1.5"><GridSelect value={clip.effect} options={effectOptions(effectCatalog)} onChange={(effect) => updateClip(index, { effect, params: defaultParamsForEffect(effectCatalog, effect, document.accentColor) })} /></td>
                <td className="px-2 py-1.5 text-right font-mono text-meta">{clip.startMs}-{clip.startMs + clip.durationMs}</td>
                <td className="px-2 py-1.5 text-right font-mono text-meta">{clip.layer}</td>
                <td className="px-2 py-1.5 text-right"><Button variant="ghost" className="h-7 w-7 px-0" type="button" title="Delete" onClick={() => removeClip(index)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </EditableTable>

        <Card>
          <CardHeader>
            <div className="text-card-title font-medium">Effect Settings</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{selectedClip ? `${selectedClip.name} · ${effectCatalog[selectedClip.effect]?.label ?? selectedClip.effect}` : "Select a clip"}</div>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedClip ? (
              <>
                <ClipCommonSettings
                  clip={selectedClip}
                  targetOptions={targetOptions}
                  onChange={(patch) => updateClip(selectedClipActualIndex, patch)}
                />
                <EffectSettings
                  effectCatalog={effectCatalog}
                  clip={selectedClip}
                  accentColor={document.accentColor}
                  onChange={(params) => updateClip(selectedClipActualIndex, { params })}
                />
              </>
            ) : null}
            <div>
              <div className="mb-2 text-label font-medium text-ink-secondary">Scene Map</div>
            <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
              {sortedClips.map(({ clip }) => {
                const zone = document.zones.find((entry) => entry.id === clip.target);
                const summary = zone ? summarizeZone(document, zone) : { outputs: "Missing target", ranges: clip.target, leds: 0 };
                return (
                  <button key={clip.id} type="button" className="w-full rounded-md border border-border-2 bg-card p-3 text-left hover:bg-surface-hover" onClick={() => setSelectedClipIndex(activeScene?.clips.findIndex((entry) => entry.id === clip.id) ?? 0)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-body-sm font-medium">{clip.name}</div>
                        <div className="font-mono text-meta text-muted-foreground">{clip.id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>L{clip.layer}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-body-sm">
                      <MapRow label="Target" value={zone?.name ?? clip.target} />
                      <MapRow label="Outputs" value={summary.outputs} />
                      <MapRow label="LEDs" value={`${summary.leds} · ${summary.ranges}`} />
                      <MapRow label="Time" value={`${clip.startMs}-${clip.startMs + clip.durationMs} ms`} />
                      <MapRow label="Effect" value={`${clip.effect} · ${clip.blend}`} />
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LayoutTab({ document, onChange }: { document: PartituraDocument; onChange: (document: PartituraDocument) => void }) {
  const [selectedZoneIndex, setSelectedZoneIndex] = useState(0);
  const selectedZone = document.zones[selectedZoneIndex] ?? document.zones[0];
  const selectedZoneActualIndex = document.zones[selectedZoneIndex] ? selectedZoneIndex : 0;
  const selectedZoneSummary = selectedZone ? summarizeZone(document, selectedZone) : null;

  function patchSegment(index: number, patch: Partial<SegmentForm>) {
    const previousId = document.segments[index]?.id;
    const nextId = patch.id ?? previousId;
    onChange({
      ...document,
      segments: document.segments.map((segment, segmentIndex) => (segmentIndex === index ? { ...segment, ...patch } : segment)),
      zones: previousId && nextId && previousId !== nextId
        ? document.zones.map((zone) => ({ ...zone, segments: zone.segments.map((segmentId) => (segmentId === previousId ? nextId : segmentId)) }))
        : document.zones
    });
  }

  function addSegment() {
    const next = document.segments.length + 1;
    onChange({ ...document, segments: [...document.segments, { id: `segment_${next}`, name: `Segment ${next}`, output: 1, start: 0, length: 10, reverse: false, x: 0, y: 0, stepX: 1, stepY: 0 }] });
  }

  function removeSegment(index: number) {
    const removed = document.segments[index];
    onChange({
      ...document,
      segments: document.segments.filter((_, segmentIndex) => segmentIndex !== index),
      zones: document.zones.map((zone) => ({ ...zone, segments: zone.segments.filter((id) => id !== removed?.id) }))
    });
  }

  function patchZone(index: number, patch: Partial<ZoneForm>) {
    const previousId = document.zones[index]?.id;
    const nextId = patch.id ?? previousId;
    onChange({
      ...document,
      zones: document.zones.map((zone, zoneIndex) => (zoneIndex === index ? { ...zone, ...patch } : zone)),
      scenes: previousId && nextId && previousId !== nextId
        ? document.scenes.map((scene) => ({
            ...scene,
            clips: scene.clips.map((clip) => (clip.target === previousId ? { ...clip, target: nextId } : clip))
          }))
        : document.scenes
    });
  }

  function addZone() {
    const next = document.zones.length + 1;
    setSelectedZoneIndex(document.zones.length);
    onChange({ ...document, zones: [...document.zones, { id: `zone_${next}`, name: `Zone ${next}`, segments: document.segments[0] ? [document.segments[0].id] : [] }] });
  }

  function removeZone(index: number) {
    if (document.zones.length <= 1) return;
    const removed = document.zones[index];
    const zones = document.zones.filter((_, zoneIndex) => zoneIndex !== index);
    const fallbackTarget = zones[0]?.id ?? "";
    setSelectedZoneIndex(Math.max(0, Math.min(index, zones.length - 1)));
    onChange({
      ...document,
      zones,
      scenes: document.scenes.map((scene) => ({
        ...scene,
        clips: scene.clips.map((clip) => (clip.target === removed?.id ? { ...clip, target: fallbackTarget } : clip))
      }))
    });
  }

  function toggleZoneSegment(zoneIndex: number, segmentId: string, checked: boolean) {
    const zone = document.zones[zoneIndex];
    if (!zone) return;
    const selected = checked
      ? Array.from(new Set([...zone.segments, segmentId]))
      : zone.segments.filter((id) => id !== segmentId);
    const ordered = document.segments.map((segment) => segment.id).filter((id) => selected.includes(id));
    patchZone(zoneIndex, { segments: ordered });
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div className="text-card-title font-medium">Logical Outputs</div>
          <div className="mt-1 text-body-sm text-muted-foreground">Logical string sizes used by the partitura. Firmware maps these outputs to physical pins.</div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <NumberField label="Output 1 LEDs" min={0} value={document.chain1Pixels} onChange={(chain1Pixels) => onChange({ ...document, chain1Pixels })} />
          <NumberField label="Output 2 LEDs" min={0} value={document.chain2Pixels} onChange={(chain2Pixels) => onChange({ ...document, chain2Pixels })} />
          <NumberField label="Output 3 LEDs" min={0} value={document.chain3Pixels} onChange={(chain3Pixels) => onChange({ ...document, chain3Pixels })} />
          <Field label="Accent color">
            <input type="color" className="h-control w-full rounded-md border bg-card p-1" value={document.accentColor} onChange={(event) => onChange({ ...document, accentColor: event.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <EditableTable title="Segments" description="Physical ranges with spatial coordinates. A straight strip is x + 1, y 0." onAdd={addSegment}>
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr className="border-b border-border-2 text-left text-grid-header font-semibold text-ink-muted">
            <th className="px-3 py-2.5">Segment ID</th>
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">Output</th>
            <th className="px-3 py-2.5 text-right">Start LED</th>
            <th className="px-3 py-2.5 text-right">LEDs</th>
            <th className="px-3 py-2.5 text-right">X</th>
            <th className="px-3 py-2.5 text-right">Y</th>
            <th className="px-3 py-2.5 text-right">Step X</th>
            <th className="px-3 py-2.5 text-right">Step Y</th>
            <th className="px-3 py-2.5">Reverse</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {document.segments.map((segment, index) => (
            <tr key={`${segment.id}:${index}`} className="h-grid-row border-b last:border-0 hover:bg-surface-hover">
              <td className="px-3 py-2.5"><GridInput value={segment.id} onChange={(id) => patchSegment(index, { id })} /></td>
              <td className="px-3 py-2.5"><GridInput value={segment.name} onChange={(name) => patchSegment(index, { name })} /></td>
              <td className="px-3 py-2.5"><GridSelect value={String(segment.output)} options={[["1", "Out 1"], ["2", "Out 2"], ["3", "Out 3"]]} onChange={(output) => patchSegment(index, { output: Number(output) })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.start} onChange={(start) => patchSegment(index, { start })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.length} onChange={(length) => patchSegment(index, { length })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.x ?? segment.start} onChange={(x) => patchSegment(index, { x })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.y ?? 0} onChange={(y) => patchSegment(index, { y })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.stepX ?? 1} onChange={(stepX) => patchSegment(index, { stepX })} /></td>
              <td className="px-3 py-2.5"><GridNumber value={segment.stepY ?? 0} onChange={(stepY) => patchSegment(index, { stepY })} /></td>
              <td className="px-3 py-2.5"><input type="checkbox" checked={segment.reverse} onChange={(event) => patchSegment(index, { reverse: event.target.checked })} /></td>
              <td className="px-3 py-2.5 text-right"><Button variant="ghost" className="h-8 w-8 px-0" type="button" title="Delete" onClick={() => removeSegment(index)}><Trash2 className="h-4 w-4" /></Button></td>
            </tr>
          ))}
        </tbody>
      </EditableTable>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <EditableTable title="Zones" description="Named logical targets composed from one or more segments." onAdd={addZone}>
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[24%]" />
            <col className="w-[18%]" />
            <col className="w-[20%]" />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-border-2 text-left text-grid-header font-semibold text-ink-muted">
              <th className="px-2 py-1.5">Zone</th>
              <th className="px-2 py-1.5">Outputs</th>
              <th className="px-2 py-1.5 text-right">Segments</th>
              <th className="px-2 py-1.5 text-right">LEDs</th>
              <th className="px-2 py-1.5 text-right">Status</th>
              <th className="px-2 py-1.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {document.zones.map((zone, index) => {
              const summary = summarizeZone(document, zone);
              return (
                <tr key={`${zone.id}:${index}`} className={`cursor-pointer border-b last:border-0 hover:bg-surface-hover ${index === selectedZoneActualIndex ? "bg-surface-2" : ""}`} onClick={() => setSelectedZoneIndex(index)}>
                  <td className="px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-body-sm font-medium">{zone.name}</div>
                      <div className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{zone.id}</div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-meta text-muted-foreground">{summary.outputs}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-meta">{zone.segments.length}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-meta">{summary.leds}</td>
                  <td className="px-2 py-1.5 text-right"><Badge>{summary.leds > 0 ? "Mapped" : "Empty"}</Badge></td>
                  <td className="px-2 py-1.5 text-right">
                    <Button variant="ghost" className="h-7 w-7 px-0" type="button" title="Delete" onClick={(event) => { event.stopPropagation(); removeZone(index); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </EditableTable>

        <Card>
          <CardHeader>
            <div className="text-card-title font-medium">Zone Detail</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{selectedZone ? `${selectedZone.name} · ${selectedZoneSummary?.outputs ?? "No outputs"}` : "Select a zone"}</div>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedZone ? (
              <>
                <div className="grid gap-3 border-b border-border-2 pb-4">
                  <Field label="Name">
                    <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={selectedZone.name} onChange={(event) => patchZone(selectedZoneActualIndex, { name: event.target.value })} />
                  </Field>
                  <Field label="Zone ID">
                    <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={selectedZone.id} onChange={(event) => patchZone(selectedZoneActualIndex, { id: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <ReadOnly label="LEDs" value={String(selectedZoneSummary?.leds ?? 0)} />
                    <LongReadOnly label="Outputs" value={selectedZoneSummary?.outputs ?? "No outputs"} />
                  </div>
                  <LongReadOnly label="Ranges" value={selectedZoneSummary?.ranges ?? "No segments"} />
                </div>

                <div>
                  <div className="mb-2 text-label font-medium text-ink-secondary">Segments</div>
                  <div className="max-h-[360px] overflow-auto rounded-md border border-border-2">
                    {document.segments.map((segment) => {
                      const checked = selectedZone.segments.includes(segment.id);
                      return (
                        <label key={segment.id} className="flex cursor-pointer items-center justify-between gap-3 border-b px-3 py-2 last:border-0 hover:bg-surface-hover">
                          <span className="min-w-0">
                            <span className="block truncate text-body-sm font-medium">{segment.name}</span>
                            <span className="block truncate font-mono text-[10px] text-muted-foreground">Out {segment.output} · {segment.start}-{segment.start + Math.max(0, segment.length - 1)} · {segment.length} LEDs</span>
                          </span>
                          <input type="checkbox" checked={checked} onChange={(event) => toggleZoneSegment(selectedZoneActualIndex, segment.id, event.target.checked)} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed bg-surface-2 p-4 text-body-sm text-muted-foreground">Create a zone before assigning segments.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function summarizeZone(document: PartituraDocument, zone: ZoneForm) {
  const segments = zone.segments
    .map((segmentId) => document.segments.find((segment) => segment.id === segmentId))
    .filter((segment): segment is SegmentForm => Boolean(segment));
  const outputs = Array.from(new Set(segments.map((segment) => `Out ${segment.output}`))).join(", ") || "No outputs";
  const ranges = segments
    .map((segment) => `Out ${segment.output}:${segment.start}-${segment.start + Math.max(0, segment.length - 1)}`)
    .join(", ") || "No segments";
  const leds = segments.reduce((total, segment) => total + segment.length, 0);

  return { outputs, ranges, leds };
}

function effectOptions(effectCatalog: EffectCatalog) {
  const effects = Object.values(effectCatalog);
  return (effects.length ? effects : [{ id: "solid", label: "Solid" }]).map((effect) => [effect.id, effect.label] as const);
}

function defaultParamsForEffect(effectCatalog: EffectCatalog, effectId: string, accentColor: string): ClipParams {
  const definition = effectCatalog[effectId] ?? effectCatalog.solid;
  if (!definition) return {};
  return Object.fromEntries(
    Object.entries(definition.parameters).map(([key, parameter]) => [
      key,
      parameter.default ?? (parameter.type === "color" ? accentColor : parameter.type === "boolean" ? false : parameter.type === "select" ? parameter.options?.[0]?.value ?? "" : 0)
    ])
  );
}

function ClipCommonSettings({ clip, targetOptions, onChange }: { clip: ClipForm; targetOptions: readonly (readonly [string, string])[]; onChange: (patch: Partial<ClipForm>) => void }) {
  return (
    <div className="grid gap-3 border-b border-border-2 pb-4">
      <Field label="Name">
        <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <Field label="Clip ID">
        <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.id} onChange={(event) => onChange({ id: event.target.value })} />
      </Field>
      <Field label="Target">
        <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.target} onChange={(event) => onChange({ target: event.target.value })}>
          {targetOptions.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Start ms" value={clip.startMs} onChange={(startMs) => onChange({ startMs })} />
        <NumberField label="Duration ms" value={clip.durationMs} onChange={(durationMs) => onChange({ durationMs })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Layer" value={clip.layer} onChange={(layer) => onChange({ layer })} />
        <Field label="Blend">
          <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.blend} onChange={(event) => onChange({ blend: event.target.value })}>
            {["replace", "max", "add", "multiply"].map((blend) => <option key={blend} value={blend}>{blend}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function EffectSettings({ effectCatalog, clip, accentColor, onChange }: { effectCatalog: EffectCatalog; clip: ClipForm; accentColor: string; onChange: (params: ClipParams) => void }) {
  const definition = effectCatalog[clip.effect] ?? effectCatalog.solid;
  if (!definition) {
    return <div className="rounded-md border border-dashed bg-surface-2 p-4 text-body-sm text-muted-foreground">Loading effect metadata.</div>;
  }
  const entries = Object.entries(definition.parameters);

  if (entries.length === 0) {
    return <div className="rounded-md border border-dashed bg-surface-2 p-4 text-body-sm text-muted-foreground">This effect has no configurable parameters.</div>;
  }

  function patchParam(key: string, value: ClipParams[string]) {
    onChange({ ...defaultParamsForEffect(effectCatalog, clip.effect, accentColor), ...clip.params, [key]: value });
  }

  return (
    <div className="grid gap-3">
      {entries.map(([key, parameter]) => (
        <EffectParamField key={key} name={key} definition={parameter} value={clip.params[key] ?? defaultParamsForEffect(effectCatalog, clip.effect, accentColor)[key]} onChange={(value) => patchParam(key, value)} />
      ))}
    </div>
  );
}

function EffectParamField({
  name,
  definition,
  value,
  onChange
}: {
  name: string;
  definition: EffectParameterDefinition;
  value: ClipParams[string];
  onChange: (value: ClipParams[string]) => void;
}) {
  const label = definition.label ?? name;
  const numericValue = typeof value === "number" ? value : Number(value ?? definition.default ?? 0);

  if (definition.type === "color") {
    return (
      <Field label={label}>
        <input type="color" className="h-control w-full rounded-md border bg-card p-1" value={typeof value === "string" ? value : String(definition.default ?? "#FFFFFF")} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }

  if (definition.type === "select") {
    return (
      <Field label={label}>
        <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={String(value ?? definition.default ?? "")} onChange={(event) => onChange(event.target.value)}>
          {(definition.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
    );
  }

  if (definition.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  }

  const step = definition.type === "integer" ? 1 : definition.type === "percent" ? 1 : 0.1;
  const displayValue = definition.type === "percent" ? Math.round(numericValue * 100) : numericValue;
  return (
    <Field label={`${label}${definition.unit ? ` (${definition.unit})` : definition.type === "percent" ? " (%)" : ""}`}>
      <input
        type="number"
        min={definition.type === "percent" ? (definition.min ?? 0) * 100 : definition.min}
        max={definition.type === "percent" ? (definition.max ?? 1) * 100 : definition.max}
        step={step}
        className="h-control w-full rounded-md border bg-card px-3 text-right font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring"
        value={displayValue}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(definition.type === "percent" ? next / 100 : definition.type === "integer" ? Math.round(next) : next);
        }}
      />
    </Field>
  );
}

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <span className="text-meta font-medium uppercase text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-meta text-foreground">{value}</span>
    </div>
  );
}

type LabPresetId = "strip_300" | "matrix_20x15" | "matrix_25x12" | "dual_20x15" | "five_letter_sign" | "six_letter_sign";
type LabApplyMode = "whole_sign" | "each_element" | "sequential_elements";

const labPresets: Array<{ id: LabPresetId; label: string; description: string }> = [
  { id: "five_letter_sign", label: "Five Letter Sign", description: "Five separated filled letters sharing one global sign space." },
  { id: "six_letter_sign", label: "Six Letter Sign", description: "Six narrower letters for testing word-wide waves and sequential fills." },
  { id: "matrix_20x15", label: "Matrix 20 x 15", description: "300 LEDs on one output, balanced spatial tester." },
  { id: "matrix_25x12", label: "Matrix 25 x 12", description: "300 LEDs on one output, horizontal sign tester." },
  { id: "dual_20x15", label: "Dual 20 x 15", description: "Two separated 300 LED panels on outputs 1 and 2." },
  { id: "strip_300", label: "Flat Strip 300", description: "One linear 300 LED strip mapped as y=0." }
];

const labApplyModes: Array<{ id: LabApplyMode; label: string; description: string }> = [
  { id: "whole_sign", label: "Whole Sign", description: "One effect across the full global pixel map." },
  { id: "each_element", label: "Each Element", description: "Same effect repeated inside every panel or letter." },
  { id: "sequential_elements", label: "Sequential Elements", description: "Elements activate left to right, each using its own local space." }
];

function EffectLabTab({ effectCatalog }: { effectCatalog: EffectCatalog }) {
  const [presetId, setPresetId] = useState<LabPresetId>("matrix_20x15");
  const [applyMode, setApplyMode] = useState<LabApplyMode>("whole_sign");
  const [family, setFamily] = useState<"spatial" | "linear" | "all">("spatial");
  const [effectId, setEffectId] = useState("flame");
  const [params, setParams] = useState<ClipParams>(() => defaultParamsForEffect(effectCatalog, "flame", "#FFFFFF"));
  const [durationMs, setDurationMs] = useState(4000);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playStartRef = useRef<number | null>(null);
  const playOffsetRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastRequestRef = useRef(0);
  const resultRef = useRef<ApiResult | null>(result);

  const effects = Object.values(effectCatalog).filter((effect) => family === "all" || (effect.family ?? "utility") === family);
  const selectedEffect = effectCatalog[effectId] ?? effectCatalog.flame ?? effectCatalog.solid;
  const selectedPreset = labPresets.find((preset) => preset.id === presetId) ?? labPresets[0];
  const selectedApplyMode = labApplyModes.find((mode) => mode.id === applyMode) ?? labApplyModes[0];
  const labDocument = useMemo(() => createEffectLabDocument(presetId, applyMode, effectId, params, durationMs), [applyMode, durationMs, effectId, params, presetId]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (Object.keys(effectCatalog).length === 0) return;
    const nextEffect = effectCatalog[effectId] ? effectId : "flame";
    setEffectId(nextEffect);
    setParams((current) => ({ ...defaultParamsForEffect(effectCatalog, nextEffect, "#FFFFFF"), ...current }));
  }, [effectCatalog, effectId]);

  async function generateFrame(timeMs = 0) {
    setGenerating(true);
    try {
      const requestDocument = { ...labDocument, previewTimeMs: timeMs };
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestDocument)
      });
      const payload = (await response.json()) as ApiResult;
      setResult(payload);
      return payload;
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    playStartRef.current = performance.now();
    playOffsetRef.current = resultRef.current?.preview?.timeMs ?? 0;
    lastRequestRef.current = 0;

    async function tick(now: number) {
      const latestResult = resultRef.current;
      const partitura = latestResult?.partitura;
      if (cancelled) return;
      const elapsedMs = now - (playStartRef.current ?? now);
      const nextTimeMs = Math.floor((playOffsetRef.current + elapsedMs) % Math.max(1, durationMs));

      if (partitura && !inFlightRef.current && now - lastRequestRef.current >= 33) {
        inFlightRef.current = true;
        lastRequestRef.current = now;
        try {
          const response = await fetch("/api/lighting/partituras/simulate-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partitura, sceneId: "lab_scene", timeMs: nextTimeMs })
          });
          const payload = (await response.json()) as { ok: boolean; preview?: Preview };
          if (!cancelled && payload.ok && payload.preview && latestResult) setResult({ ...latestResult, preview: payload.preview });
        } finally {
          inFlightRef.current = false;
        }
      }
      requestAnimationFrame(tick);
    }

    const frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [durationMs, playing]);

  function changeEffect(nextEffect: string) {
    setEffectId(nextEffect);
    setParams(defaultParamsForEffect(effectCatalog, nextEffect, "#FFFFFF"));
    setResult(null);
    setPlaying(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <div className="text-card-title font-medium">Effect Lab</div>
          <div className="mt-1 text-body-sm text-muted-foreground">Test linear and spatial effects against generated pixel maps.</div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Preset">
            <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={presetId} onChange={(event) => { setPresetId(event.target.value as LabPresetId); setResult(null); setPlaying(false); }}>
              {labPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </Field>
          <div className="rounded-md border border-border-2 bg-surface-2 p-3 text-body-sm text-muted-foreground">{selectedPreset.description}</div>
          <Field label="Apply">
            <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={applyMode} onChange={(event) => { setApplyMode(event.target.value as LabApplyMode); setResult(null); setPlaying(false); }}>
              {labApplyModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </Field>
          <div className="rounded-md border border-border-2 bg-surface-2 p-3 text-body-sm text-muted-foreground">{selectedApplyMode.description}</div>
          <Field label="Effect family">
            <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={family} onChange={(event) => { const nextFamily = event.target.value as "spatial" | "linear" | "all"; setFamily(nextFamily); const first = Object.values(effectCatalog).find((effect) => nextFamily === "all" || (effect.family ?? "utility") === nextFamily); if (first) changeEffect(first.id); }}>
              <option value="spatial">Spatial Effects</option>
              <option value="linear">Linear Effects</option>
              <option value="all">All Effects</option>
            </select>
          </Field>
          <Field label="Effect">
            <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={effectId} onChange={(event) => changeEffect(event.target.value)}>
              {(effects.length ? effects : Object.values(effectCatalog)).map((effect) => <option key={effect.id} value={effect.id}>{effect.label}</option>)}
            </select>
          </Field>
          <NumberField label="Duration ms" min={100} value={durationMs} onChange={(value) => { setDurationMs(Math.max(100, value)); setResult(null); setPlaying(false); }} />
          <EffectSettings
            effectCatalog={effectCatalog}
            clip={{
              id: "lab_clip",
              name: selectedEffect?.label ?? effectId,
              target: "lab_area",
              effect: effectId,
              blend: "replace",
              startMs: 0,
              durationMs,
              layer: 0,
              params
            }}
            accentColor="#FFFFFF"
            onChange={(nextParams) => { setParams(nextParams); setResult(null); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-card-title font-medium">Preview</div>
              <div className="mt-1 text-body-sm text-muted-foreground">{selectedEffect?.description ?? "Select an effect to preview."}</div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={generating} onClick={() => void generateFrame(0)}>
                <Sparkles className="h-4 w-4" />
                {generating ? "Generating" : "Generate"}
              </Button>
              <Button type="button" disabled={!result?.ok || !result.partitura} onClick={() => setPlaying((current) => !current)}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPlaying(false)}>
                <RotateCcw className="h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {result?.ok ? (
            <>
              <div className="grid gap-3 md:grid-cols-5">
                <Metric label="Template" value={selectedPreset.label} />
                <Metric label="Apply" value={selectedApplyMode.label} />
                <Metric label="Frame" value={`${result.preview?.timeMs ?? 0} ms`} />
                <Metric label="Pixels" value={result.preview?.pixelCount ?? 0} />
                <Metric label="Max FPS" value={result.preview?.estimatedMaxRefreshRateFps ?? 0} />
              </div>
              <PixelPreview rows={result.preview?.outputRows ?? []} />
            </>
          ) : result ? (
            <ValidationErrors result={result} />
          ) : (
            <div className="rounded-md border border-dashed bg-surface-2 p-10 text-center text-body-sm text-muted-foreground">
              Generate a frame to start testing.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function createEffectLabDocument(presetId: LabPresetId, applyMode: LabApplyMode, effectId: string, params: ClipParams, durationMs: number): PartituraDocument {
  const preset = buildLabPreset(presetId);
  const elementZones = preset.zones.filter((zone) => zone.id !== "lab_area");
  const targets = applyMode === "whole_sign" || elementZones.length === 0 ? ["lab_area"] : elementZones.map((zone) => zone.id);
  const clipDurationMs = applyMode === "sequential_elements" ? Math.max(180, Math.round(durationMs / Math.max(1, targets.length))) : durationMs;
  const clips = [
    {
      id: "lab_base_off",
      name: "Base off",
      target: "lab_area",
      effect: "off",
      blend: "replace",
      startMs: 0,
      durationMs,
      layer: -100,
      params: {}
    },
    ...targets.map((target, index) => ({
    id: `lab_clip_${index + 1}`,
    name: `${effectId} ${target}`,
    target,
    effect: effectId,
    blend: "replace",
    startMs: applyMode === "sequential_elements" ? index * clipDurationMs : 0,
    durationMs: clipDurationMs,
    layer: index,
    params
    }))
  ];

  return {
    projectId: `effect_lab_${presetId}`,
    chain1Pixels: preset.chain1Pixels,
    chain2Pixels: preset.chain2Pixels,
    chain3Pixels: preset.chain3Pixels,
    segments: preset.segments,
    zones: preset.zones,
    scenes: [
      {
        id: "lab_scene",
        name: "Lab Scene",
        loop: true,
        durationMs,
        clips
      }
    ],
    activeSceneId: "lab_scene",
    previewTimeMs: 0,
    accentColor: "#FFFFFF"
  };
}

function buildLabPreset(presetId: LabPresetId): Pick<PartituraDocument, "chain1Pixels" | "chain2Pixels" | "chain3Pixels" | "segments" | "zones"> {
  if (presetId === "strip_300") {
    return {
      chain1Pixels: 300,
      chain2Pixels: 0,
      chain3Pixels: 0,
      segments: [{ id: "strip_segment", name: "Flat strip", output: 1, start: 0, length: 300, reverse: false, x: 0, y: 0, stepX: 1, stepY: 0 }],
      zones: [{ id: "lab_area", name: "Lab area", segments: ["strip_segment"] }]
    };
  }

  if (presetId === "matrix_25x12") {
    const segments = createMatrixSegments("panel_a", "Panel A", 1, 25, 12, 0, 0, 0);
    return {
      chain1Pixels: 300,
      chain2Pixels: 0,
      chain3Pixels: 0,
      segments,
      zones: [{ id: "lab_area", name: "Lab area", segments: segments.map((segment) => segment.id) }]
    };
  }

  if (presetId === "dual_20x15") {
    const panelA = createMatrixSegments("panel_a", "Panel A", 1, 20, 15, 0, 0, 0);
    const panelB = createMatrixSegments("panel_b", "Panel B", 2, 20, 15, 24, 0, 0);
    return {
      chain1Pixels: 300,
      chain2Pixels: 300,
      chain3Pixels: 0,
      segments: [...panelA, ...panelB],
      zones: [
        { id: "panel_a", name: "Panel A", segments: panelA.map((segment) => segment.id) },
        { id: "panel_b", name: "Panel B", segments: panelB.map((segment) => segment.id) },
        { id: "lab_area", name: "Lab area", segments: [...panelA, ...panelB].map((segment) => segment.id) }
      ]
    };
  }

  if (presetId === "five_letter_sign") {
    return createLetterSignPreset([
      { id: "letter_1", name: "Letter 1", width: 11 },
      { id: "letter_2", name: "Letter 2", width: 8 },
      { id: "letter_3", name: "Letter 3", width: 12 },
      { id: "letter_4", name: "Letter 4", width: 7 },
      { id: "letter_5", name: "Letter 5", width: 10 }
    ], 15);
  }

  if (presetId === "six_letter_sign") {
    return createLetterSignPreset([
      { id: "letter_1", name: "Letter 1", width: 8 },
      { id: "letter_2", name: "Letter 2", width: 9 },
      { id: "letter_3", name: "Letter 3", width: 7 },
      { id: "letter_4", name: "Letter 4", width: 10 },
      { id: "letter_5", name: "Letter 5", width: 8 },
      { id: "letter_6", name: "Letter 6", width: 9 }
    ], 14);
  }

  const segments = createMatrixSegments("panel_a", "Panel A", 1, 20, 15, 0, 0, 0);
  return {
    chain1Pixels: 300,
    chain2Pixels: 0,
    chain3Pixels: 0,
    segments,
    zones: [{ id: "lab_area", name: "Lab area", segments: segments.map((segment) => segment.id) }]
  };
}

function createLetterSignPreset(letters: Array<{ id: string; name: string; width: number }>, height: number): Pick<PartituraDocument, "chain1Pixels" | "chain2Pixels" | "chain3Pixels" | "segments" | "zones"> {
  const outputStarts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let cursorX = 0;
  const letterZones: ZoneForm[] = [];
  const segments: SegmentForm[] = [];

  letters.forEach((letter, index) => {
    const output = Math.min(3, Math.floor(index / 2) + 1);
    const letterSegments = createMatrixSegments(letter.id, letter.name, output, letter.width, height, cursorX, 0, outputStarts[output]);
    outputStarts[output] += letter.width * height;
    cursorX += letter.width + 3;
    segments.push(...letterSegments);
    letterZones.push({ id: letter.id, name: letter.name, segments: letterSegments.map((segment) => segment.id) });
  });

  return {
    chain1Pixels: outputStarts[1],
    chain2Pixels: outputStarts[2],
    chain3Pixels: outputStarts[3],
    segments,
    zones: [
      ...letterZones,
      { id: "lab_area", name: "Whole sign", segments: segments.map((segment) => segment.id) }
    ]
  };
}

function createMatrixSegments(id: string, name: string, output: number, width: number, height: number, originX: number, originY: number, startOffset: number): SegmentForm[] {
  return Array.from({ length: height }, (_, row) => ({
    id: `${id}_row_${row + 1}`,
    name: `${name} row ${row + 1}`,
    output,
    start: startOffset + row * width,
    length: width,
    reverse: row % 2 === 1,
    x: originX,
    y: originY + row,
    stepX: 1,
    stepY: 0
  }));
}

function SimulatorTab({
  result,
  generating,
  onGenerate,
  onOpenPlayer
}: {
  result: ApiResult | null;
  generating: boolean;
  onGenerate: () => void;
  onOpenPlayer: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-card-title font-medium">Simulator</div>
            <div className="mt-1 text-body-sm text-muted-foreground">Generate the firmware-facing partitura and open the larger player modal.</div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating" : "Generate"}
            </Button>
            <Button type="button" onClick={onOpenPlayer}>
              <Play className="h-4 w-4" />
              Open Player
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result ? (
          <div className="rounded-md border border-dashed bg-surface-2 p-8 text-center text-body-sm text-muted-foreground">
            Generate the partitura or open the player to render the first frame.
          </div>
        ) : result.ok ? (
          <div className="grid gap-3 md:grid-cols-6">
            <Metric label="Scene" value={result.preview?.sceneId ?? "-"} />
            <Metric label="Frame" value={`${result.preview?.timeMs ?? 0} ms`} />
            <Metric label="Pixels" value={result.preview?.pixelCount ?? 0} />
            <Metric label="Protocol" value={result.preview?.protocol ?? "-"} />
            <Metric label="Longest" value={`${Math.round(result.preview?.longestOutputTransmitTimeUs ?? 0)} us`} />
            <Metric label="Max FPS" value={result.preview?.estimatedMaxRefreshRateFps ?? 0} />
          </div>
        ) : (
          <ValidationErrors result={result} />
        )}
      </CardContent>
    </Card>
  );
}

function PlayerModal({
  open,
  onClose,
  document,
  result,
  generating,
  onGenerate,
  onResult
}: {
  open: boolean;
  onClose: () => void;
  document: PartituraDocument;
  result: ApiResult | null;
  generating: boolean;
  onGenerate: () => void;
  onResult: (result: ApiResult) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const playStartRef = useRef<number | null>(null);
  const playOffsetRef = useRef(0);
  const lastRequestRef = useRef(0);
  const inFlightRef = useRef(false);
  const resultRef = useRef<ApiResult | null>(result);
  const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
  const activeSceneDurationMs = Math.max(1, activeScene?.durationMs ?? 4000);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (!open) setPlaying(false);
  }, [open]);

  useEffect(() => {
    const currentResult = resultRef.current;
    if (!playing || !currentResult?.ok || !currentResult.partitura) return;

    let cancelled = false;
    playStartRef.current = performance.now();
    playOffsetRef.current = currentResult.preview?.timeMs ?? Math.min(document.previewTimeMs, activeSceneDurationMs - 1);
    lastRequestRef.current = 0;

    async function tick(now: number) {
      const latestResult = resultRef.current;
      if (cancelled || !latestResult?.partitura) return;
      const elapsedMs = now - (playStartRef.current ?? now);
      const nextTimeMs = Math.floor((playOffsetRef.current + elapsedMs) % activeSceneDurationMs);

      if (!inFlightRef.current && now - lastRequestRef.current >= 33) {
        inFlightRef.current = true;
        lastRequestRef.current = now;
        try {
          const response = await fetch("/api/lighting/partituras/simulate-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partitura: latestResult.partitura, sceneId: document.activeSceneId, timeMs: nextTimeMs })
          });
          const payload = (await response.json()) as { ok: boolean; preview?: Preview };
          if (!cancelled && payload.ok && payload.preview) onResult({ ...latestResult, preview: payload.preview });
        } finally {
          inFlightRef.current = false;
        }
      }

      requestAnimationFrame(tick);
    }

    const frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [activeSceneDurationMs, document.activeSceneId, document.previewTimeMs, onResult, playing]);

  return (
    <Modal open={open} title="Partitura Player" description="Large WS2812B-like simulator preview for the active scene." onClose={onClose} className="max-w-[min(1500px,96vw)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge>Scene: {document.activeSceneId}</Badge>
            <Badge>{result?.preview?.pixelCount ?? 0} LEDs</Badge>
            <Badge>{result?.preview?.estimatedMaxRefreshRateFps ?? 0} fps max</Badge>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating" : "Generate"}
            </Button>
            <Button type="button" onClick={() => setPlaying((current) => !current)} disabled={!result?.ok || !result.partitura}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPlaying(false)}>
              <RotateCcw className="h-4 w-4" />
              Stop
            </Button>
          </div>
        </div>
        {!result ? (
          <div className="rounded-md border border-dashed bg-surface-2 p-10 text-center text-body-sm text-muted-foreground">
            Generate a partitura to start the simulator.
          </div>
        ) : result.ok ? (
          <PixelPreview rows={result.preview?.outputRows ?? []} />
        ) : (
          <ValidationErrors result={result} />
        )}
      </div>
    </Modal>
  );
}

function EditableTable({ title, description, onAdd, children }: { title: string; description: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-card-title font-medium">{title}</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{description}</div>
          </div>
          <Button type="button" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[520px] overflow-auto rounded-md border border-border-2">
          <table className="min-w-full border-collapse text-grid-cell">{children}</table>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-label font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-label font-medium text-ink-secondary">{label}</div>
      <div className="h-control overflow-hidden rounded-md border bg-surface-2 px-3 py-2 font-mono text-body-sm">{value}</div>
    </div>
  );
}

function LongReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-label font-medium text-ink-secondary">{label}</div>
      <div className="min-h-control max-h-24 overflow-auto rounded-md border bg-surface-2 px-3 py-2 font-mono text-meta leading-5 text-ink-secondary break-words">
        {value}
      </div>
    </div>
  );
}

function NumberField({ label, value, min = 1, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring"
        value={draftValue}
        onBlur={() => {
          const next = Number(draftValue);
          if (!Number.isFinite(next) || draftValue.trim() === "") {
            setDraftValue(String(value));
            return;
          }
          const bounded = Math.max(min, Math.round(next));
          setDraftValue(String(bounded));
          onChange(bounded);
        }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          if (nextDraft.trim() === "") return;
          const next = Number(nextDraft);
          if (Number.isFinite(next) && next >= min) onChange(Math.round(next));
        }}
      />
    </Field>
  );
}

function GridInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input className="h-8 w-full min-w-0 rounded-md border bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function GridNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" step="any" className="h-8 w-20 rounded-md border bg-card px-2 text-right font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(Number(event.target.value))} />;
}

function GridSelect({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return (
    <select className="h-8 w-full min-w-0 rounded-md border bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-label-sm font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-section-title font-semibold">{value}</div>
    </div>
  );
}

function ValidationErrors({ result }: { result: ApiResult }) {
  return (
    <Alert title="Partitura has validation errors" variant="error">
      <div className="mt-2 space-y-2">
        {result.validation.errors.map((issue) => (
          <div key={`${issue.code}:${issue.path}`} className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{issue.message}</span>
          </div>
        ))}
      </div>
    </Alert>
  );
}

function PixelPreview({ rows }: { rows: Preview["outputRows"] }) {
  const pixels = rows.flatMap((row) => row.pixels);
  const hasSpatialPixels = pixels.some((pixel) => Number.isFinite(pixel.x) && Number.isFinite(pixel.y));

  if (hasSpatialPixels) {
    return <SpatialPixelMap pixels={pixels} />;
  }

  return <PixelRows rows={rows} />;
}

function SpatialPixelMap({ pixels }: { pixels: Preview["outputRows"][number]["pixels"] }) {
  const minX = Math.min(...pixels.map((pixel) => pixel.x));
  const maxX = Math.max(...pixels.map((pixel) => pixel.x));
  const minY = Math.min(...pixels.map((pixel) => pixel.y));
  const maxY = Math.max(...pixels.map((pixel) => pixel.y));
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const cell = 12;

  return (
    <div className="max-h-[68vh] overflow-auto rounded-md border border-slate-700 bg-slate-950 p-4">
      <div
        className="relative"
        style={{
          width: `${width * cell}px`,
          height: `${height * cell}px`
        }}
      >
        {pixels.map((pixel) => (
          <div
            key={`${pixel.output}:${pixel.index}`}
            title={`Output ${pixel.output}, LED ${pixel.index} · x ${pixel.x}, y ${pixel.y}`}
            className="absolute h-[8px] w-[10px] rounded-[2px] ring-1 ring-white/15"
            style={{
              left: `${(pixel.x - minX) * cell}px`,
              top: `${(pixel.y - minY) * cell}px`,
              backgroundColor: ledDisplayColor(pixel.color)
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PixelRows({ rows }: { rows: Preview["outputRows"] }) {
  return (
    <div className="max-h-[68vh] overflow-auto rounded-md border border-slate-700 bg-slate-950 p-3">
      <div className="min-w-max space-y-3">
        {rows.map((row) => (
          <div key={row.output} className="grid grid-cols-[96px_1fr] items-center gap-3">
            <div className="text-meta font-medium uppercase text-slate-200">
              Output {row.output}
              <span className="block font-mono text-[10px] normal-case text-slate-400">{row.pixelCount} leds</span>
              <span className="block font-mono text-[10px] normal-case text-slate-400">{Math.round(row.transmitTimeUs)} us</span>
            </div>
            <div className="flex w-max gap-px">
              {row.pixels.map((pixel) => (
                <div
                  key={`${pixel.output}:${pixel.index}`}
                  title={`Output ${pixel.output}, LED ${pixel.index}`}
                  className="h-[6px] w-[8.33px] shrink-0 rounded-[1px] ring-1 ring-white/10"
                  style={{ backgroundColor: ledDisplayColor(pixel.color) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ledDisplayColor(color: { r: number; g: number; b: number }) {
  const calibrated = {
    r: calibrateLedChannel(color.r, 0.92),
    g: calibrateLedChannel(color.g, 0.78),
    b: calibrateLedChannel(color.b, 0.86)
  };
  return `rgb(${calibrated.r}, ${calibrated.g}, ${calibrated.b})`;
}

function calibrateLedChannel(value: number, gain: number) {
  const normalized = Math.min(1, Math.max(0, value / 255));
  const gammaAdjusted = Math.pow(normalized, 1.35);
  return Math.round(Math.min(235, gammaAdjusted * 255 * gain));
}
