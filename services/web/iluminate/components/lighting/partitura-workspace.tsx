"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Cable, Circle, CircleDotDashed, Cloud, Copy, Grid2X2, Hammer, Hand, Image as ImageIcon, LampWallUp, Layers, Maximize2, MousePointer2, Pause, PenLine, Play, Plus, Redo2, Ruler, Route, RotateCcw, Save, Scissors, Settings2, Sparkles, Spline, Square, Sun, SunMoon, Trash2, Undo2, Waves } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { buildDocumentFromDesigner, designerCompileSignature } from "./designer/designer-compiler";
import { DesignerAnimateTimeline } from "./designer/designer-animate-timeline";
import {
  clearFloatingTerminalJoints,
  canSolderRoutes,
  clamp,
  deleteChannelPoint as deleteChannelPointPath,
  deletePolygonPoint,
  detachSolderedRoutePoint,
  findMatchingControllerPort,
  findMatchingSolderTerminal,
  findNearbyControllerPort,
  findNearbySolderTerminal,
  fitViewportToDesigner,
  insertChannelPoint as insertChannelPointPath,
  insertPolygonPoint,
  isRouteTerminal,
  moveRoutePoint,
  moveRouteTerminals,
  movedShape,
  nextDesignerItemNumber,
  nearestRouteInsertIndex,
  rectanglePoints,
  resolveRouteOutputs,
  resizedBuildArea,
  resizedZone,
  routeLengthCm,
  sameSnapPoint,
  setChannelNodeType as setChannelNodeTypePath,
  setPolygonNodeType,
  sampleRouteLedDots,
  snapValue,
  summarizeRoute,
  updateChannelBezierHandle,
  updateChannelPoint as updateChannelPointPath,
  updatePolygonPoint
} from "./designer/designer-geometry";
import { DesignerStudioCanvas, type DesignerAnimationDiffuser, type DesignerAnimationPixel } from "./designer/designer-paper-canvas";
import { DEFAULT_DIFFUSER_RENDER_SETTINGS, DesignerWebglPlayer, type DiffuserRenderSettings } from "./designer/designer-webgl-player";
import { DesignerLayersPanel, NodeTypePicker, ToolbarField, ToolbarNumber, ToolButton } from "./designer/designer-ui";
import { designerLayerForSelection, designerSelectionForClipTarget, type DesignerActiveLayer, type DesignerRouteTerminal, type DesignerSelection, type DesignerTool, type DesignerViewport } from "./designer/types";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import { installClientDebugHandlers, recordClientDebug } from "@/lib/client-debug";
import {
  clonePartituraDocument,
  createDefaultOpticalTreatment,
  createClipIdentity,
  ClipParams,
  ClipForm,
  DesignerArtworkForm,
  DesignerBuildAreaForm,
  DesignerChannelForm,
  DesignerControllerForm,
  DesignerForm,
  DesignerGroupForm,
  DesignerLayerSettings,
  DesignerLayersForm,
  DesignerOpticalMode,
  DesignerOpticalTreatment,
  DesignerPoint,
  DesignerPointNodeType,
  DesignerRouteKind,
  DesignerRouteForm,
  DesignerZoneForm,
  nextEmptyClipLayer,
  normalizeDefaultSignLayout,
  PartituraDocument,
  PersistedPartitura,
  SceneForm
} from "@/lib/lighting/partitura-model";

type ProjectAsset = {
  id: string;
  fileName: string;
  mimeType: string;
};

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

type DesignerHistoryEntry = {
  document: PartituraDocument;
  selection: DesignerSelection;
};

type OpticalTargetRef = { type: "zone" | "channel"; id: string };

const DESIGNER_HISTORY_LIMIT = 100;

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
    pixelCount: number;
    transmitTimeUs: number;
    maxRefreshRateFps: number;
    pixels: Array<{ output: number; serialIndex: number; stringId: string; x: number; y: number; tangentDeg: number; normalizedX: number; normalizedY: number; color: { r: number; g: number; b: number } }>;
  }>;
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "scenes", label: "Scenes" },
  { id: "simulator", label: "Simulator" }
];
const GENERATED_PARTITURA_UNSPECIFIED = Symbol("generated-partitura-unspecified");
const ACTIVE_LAYER_LABELS: Record<DesignerActiveLayer, string> = {
  artwork: "Artwork",
  reference: "Reference",
  zones: "Zones",
  lightSources: "Light Sources",
  hardware: "Hardware",
  strings: "Strings"
};

const DESIGNER_TOOL_LABELS: Record<DesignerTool, string> = {
  select: "Select",
  pan: "Pan",
  measure: "Measure",
  image_place: "Image",
  build_area_rect: "Rectangle reference",
  build_area_ellipse: "Ellipse reference",
  build_area_polygon: "Polygon reference",
  build_area_bezier: "Bezier reference",
  zone_rect: "Rectangle zone",
  zone_ellipse: "Ellipse zone",
  zone_polygon: "Polygon zone",
  zone_bezier: "Bezier zone",
  channel_bezier: "Channel",
  led_string: "LED string",
  data_cable: "Data cable",
  cut: "Cut route"
};

function MeasuringTapeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 16V8a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v8" />
      <path d="M4 16h13v5H7a3 3 0 0 1-3-3v-2Z" />
      <circle cx="10.5" cy="10" r="2" />
      <path d="M17 16h4v5h-4M19 16v2M8 18v3M11 18v2M14 18v3" />
    </svg>
  );
}

function LightingSetupIndicators({ treatments }: { treatments: DesignerOpticalTreatment[] }) {
  const configured = treatments.filter((treatment) => treatment.enabled && treatment.stringIds.length > 0);
  const hasDraft = treatments.some((treatment) => treatment.enabled && treatment.stringIds.length === 0);
  const uniqueModes = configured.filter((treatment, index) => configured.findIndex((candidate) => candidate.mode === treatment.mode) === index);
  const frontMaterials = configured
    .filter((treatment) => treatment.mode === "front")
    .filter((treatment, index, entries) => entries.findIndex((candidate) => candidate.material === treatment.material) === index);

  const modeMeta = {
    front: { label: "Front", icon: Sun },
    halo: { label: "Halo-Lit", icon: CircleDotDashed },
    wall_wash: { label: "Wall Washer", icon: LampWallUp }
  } satisfies Record<DesignerOpticalMode, { label: string; icon: React.ComponentType<{ className?: string }> }>;
  const materialMeta: Record<DesignerOpticalTreatment["material"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    none: { label: "LED Pixels", icon: Grid2X2 },
    silicone: { label: "Silicone Strip", icon: Waves },
    milky_white: { label: "Milky White", icon: Cloud },
    day_night: { label: "Day/Night", icon: SunMoon },
    opaque: { label: "Opaque", icon: Square }
  };

  if (!uniqueModes.length && !hasDraft) return <span className="text-body-sm text-muted-foreground">No lighting setup</span>;
  return (
    <div className="flex items-center gap-1" aria-label="Lighting setup status">
      {uniqueModes.map((treatment) => {
        const meta = modeMeta[treatment.mode];
        const Icon = meta.icon;
        return <span key={treatment.mode} title={`${meta.label} configured`} className="flex h-7 w-7 items-center justify-center rounded border border-amber-400/70 bg-amber-400/10 text-amber-600"><Icon className="h-4 w-4" /></span>;
      })}
      {frontMaterials.length ? <div className="mx-1 h-5 w-px bg-border" /> : null}
      {frontMaterials.map((treatment) => {
        const meta = materialMeta[treatment.material];
        const Icon = meta.icon;
        return <span key={treatment.material} title={`Front material: ${meta.label}`} className="flex h-7 w-7 items-center justify-center rounded border border-border-2 bg-card text-muted-foreground"><Icon className="h-4 w-4" /></span>;
      })}
      {hasDraft ? <span title="Lighting setup incomplete: assign an LED string" className="flex h-7 w-7 items-center justify-center rounded border border-amber-500/50 bg-amber-500/10 text-amber-600"><AlertCircle className="h-4 w-4" /></span> : null}
    </div>
  );
}

function designerToolInstruction(tool: DesignerTool) {
  if (tool === "select") return "Click an object to edit its properties";
  if (tool === "pan") return "Drag the canvas to move the view";
  if (tool === "measure") return "Drag between two points to measure";
  if (tool === "image_place") return "Drag on the canvas to place the image container";
  if (tool === "build_area_rect" || tool === "build_area_ellipse" || tool === "zone_rect" || tool === "zone_ellipse") return "Drag on the canvas to create it";
  if (tool === "build_area_polygon" || tool === "build_area_bezier" || tool === "zone_polygon" || tool === "zone_bezier" || tool === "channel_bezier") return "Click to add nodes and close the path to finish";
  if (tool === "led_string" || tool === "data_cable") return "Click to draw the route";
  return "Click a route point to split it";
}

function persistedDocumentSignature(document: PartituraDocument) {
  const { previewTimeMs: _previewTimeMs, ...persistedDocument } = document;
  return JSON.stringify(persistedDocument);
}

export function PartituraDesignerStudio({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState<PartituraDocument>(() => normalizeDefaultSignLayout(initialPartitura.document));
  const documentRef = useRef<PartituraDocument>(document);
  const savedDocumentSignatureRef = useRef(persistedDocumentSignature(document));
  const generatedPartituraStaleRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<"design" | "animate">("design");
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [animationResult, setAnimationResult] = useState<ApiResult | null>(null);
  const [animationGenerating, setAnimationGenerating] = useState(false);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationPlayerOpen, setAnimationPlayerOpen] = useState(false);
  const [animationViewerOpen, setAnimationViewerOpen] = useState(false);
  const [animationViewerViewport, setAnimationViewerViewport] = useState<DesignerViewport | null>(null);
  const animationResultRef = useRef<ApiResult | null>(null);
  const animationGenerationIdRef = useRef(0);
  const animationRequestInFlightRef = useRef(false);
  const animationLastRequestRef = useRef(0);
  const animationStartRef = useRef<number | null>(null);
  const animationOffsetRef = useRef(0);
  const [tool, setTool] = useState<DesignerTool>("select");
  // No work plane is active until the operator picks a category in the Layers
  // panel. Until then the canvas must not select or drag any object.
  const [activeLayer, setActiveLayer] = useState<DesignerActiveLayer | null>(null);
  const [selection, setSelection] = useState<DesignerSelection>(null);
  const [opticalTargetSelection, setOpticalTargetSelection] = useState<OpticalTargetRef[]>([]);
  const undoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const redoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const historyInteractionIdRef = useRef(0);
  const historyRecordedInteractionRef = useRef<number | null>(null);
  const [, setHistoryRevision] = useState(0);
  const [clipboard, setClipboard] = useState<DesignerSelection>(null);
  const [fabricationNotice, setFabricationNotice] = useState("Ready");
  const [compileIssuesOpen, setCompileIssuesOpen] = useState(false);
  const [viewport, setViewport] = useState<DesignerViewport | null>(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const [lightingEditorOpen, setLightingEditorOpen] = useState(false);
  const [animationTimelineHeight, setAnimationTimelineHeight] = useState(260);
  const [animationTimelineCollapsed, setAnimationTimelineCollapsed] = useState(false);
  const [animationDiffuser, setAnimationDiffuser] = useState<DesignerAnimationDiffuser>("as_built");
  const [diffuserSettings, setDiffuserSettings] = useState<DiffuserRenderSettings>(DEFAULT_DIFFUSER_RENDER_SETTINGS);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const artworkUrls = useMemo(() => Object.fromEntries(projectAssets.map((asset) => [asset.id, `/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/${encodeURIComponent(asset.id)}`])), [document.projectId, projectAssets]);
  const animationPixels = animationResult?.preview?.outputRows.flatMap((row) => row.pixels) ?? [];

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => installClientDebugHandlers(), []);

  useEffect(() => {
    const beginPointerInteraction = () => {
      historyInteractionIdRef.current += 1;
    };
    window.addEventListener("pointerdown", beginPointerInteraction, true);
    return () => window.removeEventListener("pointerdown", beginPointerInteraction, true);
  }, []);

  useEffect(() => {
    animationResultRef.current = animationResult;
  }, [animationResult]);

  useEffect(() => {
    if (editorMode !== "animate") {
      setLightingEditorOpen(false);
      return;
    }
    if (selection?.type === "zone" || selection?.type === "channel" || selection?.type === "light_source") setLightingEditorOpen(true);
  }, [editorMode]);

  useEffect(() => {
    const fitTimelineToViewport = () => setAnimationTimelineHeight((current) => Math.min(current, maximumTimelineHeight(window.innerHeight)));
    fitTimelineToViewport();
    window.addEventListener("resize", fitTimelineToViewport);
    return () => window.removeEventListener("resize", fitTimelineToViewport);
  }, []);

  useEffect(() => {
    if (!animationPlaying || editorMode !== "animate") return;
    const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
    const durationMs = Math.max(100, activeScene?.durationMs ?? 4000);
    const current = animationResultRef.current;
    if (!current?.ok || !current.partitura) return;

    let cancelled = false;
    animationStartRef.current = performance.now();
    animationOffsetRef.current = current.preview?.timeMs ?? 0;
    animationLastRequestRef.current = 0;

    async function tick(now: number) {
      const result = animationResultRef.current;
      if (cancelled || !result?.partitura) return;
      const elapsed = now - (animationStartRef.current ?? now);
      const timeMs = Math.floor((animationOffsetRef.current + elapsed) % durationMs);
      if (!animationRequestInFlightRef.current && now - animationLastRequestRef.current >= 33) {
        animationRequestInFlightRef.current = true;
        animationLastRequestRef.current = now;
        try {
          const response = await fetch("/api/lighting/partituras/simulate-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ partitura: result.partitura, sceneId: document.activeSceneId, timeMs })
          });
          const payload = (await response.json()) as { ok: boolean; preview?: Preview };
          if (!cancelled && payload.ok && payload.preview) setAnimationResult({ ...result, preview: payload.preview });
        } finally {
          animationRequestInFlightRef.current = false;
        }
      }
      requestAnimationFrame(tick);
    }

    const frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [animationPlaying, animationResult?.partitura, document.activeSceneId, document.scenes, editorMode]);
  const designerState = document.designer;
  if (!designerState) return null;
  const designer: DesignerForm = designerState;
  const selectedArtwork = selection?.type === "artwork" ? designer.artwork.find((artwork) => artwork.id === selection.id) ?? null : null;
  const selectedBuildArea = selection?.type === "build_area" ? designer.buildAreas.find((buildArea) => buildArea.id === selection.id) ?? null : null;
  const selectedBuildAreaPointIndex = selection?.type === "build_area" ? selection.pointIndex : undefined;
  const selectedLightSource = selection?.type === "light_source" ? designer.lightSources.find((source) => source.id === selection.id) ?? null : null;
  const selectedZone = selection?.type === "zone" ? designer.zones.find((zone) => zone.id === selection.id) ?? null : selectedLightSource?.targetType === "zone" ? designer.zones.find((zone) => zone.id === selectedLightSource.targetId) ?? null : null;
  const selectedZonePointIndex = selection?.type === "zone" ? selection.pointIndex : undefined;
  const selectedChannel = selection?.type === "channel" ? designer.channels.find((channel) => channel.id === selection.id) ?? null : selectedLightSource?.targetType === "channel" ? designer.channels.find((channel) => channel.id === selectedLightSource.targetId) ?? null : null;
  const selectedChannelPointIndex = selection?.type === "channel" ? selection.pointIndex : undefined;
  const selectedRoute = selection?.type === "route" ? designer.routes.find((route) => route.id === selection.id) ?? null : null;
  const selectedRoutePointIndex = selection?.type === "route" ? selection.pointIndex : undefined;
  const selectedController = selection?.type === "controller" ? designer.controller : null;
  const selectedObjectLocked = selection?.type === "artwork" || selection?.type === "build_area"
    ? designer.layers.artwork.locked
    : selection?.type === "zone" || selection?.type === "channel"
      ? designer.layers.zones.locked
      : selection?.type === "light_source"
        ? designer.layers.lightSources.locked
        : selection?.type === "route"
          ? designer.layers.strings.locked
          : selection?.type === "controller"
            ? designer.layers.hardware.locked
            : false;
  const selectedOpticalTarget = selectedZone ? { type: "zone" as const, id: selectedZone.id } : selectedChannel ? { type: "channel" as const, id: selectedChannel.id } : null;
  const selectedOpticalTargets = (opticalTargetSelection.length ? opticalTargetSelection : selectedOpticalTarget ? [selectedOpticalTarget] : [])
    .filter((target) => target.type === "zone" ? designer.zones.some((zone) => zone.id === target.id) : designer.channels.some((channel) => channel.id === target.id));
  const selectedOpticalTargetEntries = selectedOpticalTargets.map((target) => ({
    ...target,
    name: target.type === "zone"
      ? designer.zones.find((zone) => zone.id === target.id)?.name ?? target.id
      : designer.channels.find((channel) => channel.id === target.id)?.name ?? target.id,
    treatments: designer.lightSources.filter((source) => source.targetType === target.type && source.targetId === target.id)
  }));
  const selectedOpticalTreatments = selectedOpticalTarget
    ? designer.lightSources.filter((treatment) => treatment.targetType === selectedOpticalTarget.type && treatment.targetId === selectedOpticalTarget.id)
    : [];
  const selectedAnimationTargetId = selectedLightSource?.id
    ?? (selectedOpticalTarget ? designer.lightSources.find((source) => source.targetType === selectedOpticalTarget.type && source.targetId === selectedOpticalTarget.id && source.mode === "front")?.id
      ?? designer.lightSources.find((source) => source.targetType === selectedOpticalTarget.type && source.targetId === selectedOpticalTarget.id)?.id
      ?? selectedOpticalTarget.id : undefined);
  const routeSummaries = designer.routes.map((route) => summarizeRoute(route, designer));
  const routeOutputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const totalGeneratedPixels = routeSummaries.reduce((total, route) => total + route.pixels, 0);
  const ledsPerAddressablePixel = designer.ledsPerMeter / Math.max(1, designer.addressablePixelsPerMeter);
  const activeViewport = viewport ?? { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };
  const compileIsCurrent = Boolean(document.compiledLayout && document.compiledDesignerSignature === designerCompileSignature(designer));
  const compileErrors = document.compiledLayout?.validation.errors ?? [];
  const compileWarnings = document.compiledLayout?.validation.warnings ?? [];
  const compileIssueCount = compileErrors.length + compileWarnings.length;
  const canAnimate = compileIsCurrent && compileErrors.length === 0;
  const hasUnsavedChanges = persistedDocumentSignature(document) !== savedDocumentSignatureRef.current;

  useEffect(() => {
    if (viewport) return;
    setViewport(fitViewportToDesigner(designer));
  }, [designer.canvasHeightCm, designer.canvasWidthCm, viewport]);

  useEffect(() => {
    let cancelled = false;
    async function loadProjectAssets() {
      if (!document.projectId) return;
      const response = await fetch(`/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets`, { cache: "no-store" });
      const payload = (await response.json()) as { records?: ProjectAsset[] };
      if (!cancelled) setProjectAssets(payload.records ?? []);
    }
    void loadProjectAssets();
    return () => {
      cancelled = true;
    };
  }, [document.projectId, assetsVersion]);

  useEffect(() => {
    let cancelled = false;
    async function loadEffects() {
      const response = await fetch("/api/lighting/effects", { cache: "no-store" });
      const payload = (await response.json()) as { effects?: EffectCatalog };
      if (!cancelled) setEffectCatalog(payload.effects ?? {});
    }
    void loadEffects();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDesignerChange();
        else undoDesignerChange();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        redoDesignerChange();
        return;
      }
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      historyInteractionIdRef.current += 1;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      }
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "h") setTool("pan");
      if (activeLayer === "zones" && event.key.toLowerCase() === "r") setTool("zone_rect");
      if (activeLayer === "zones" && event.key.toLowerCase() === "e") setTool("zone_ellipse");
      if (activeLayer === "zones" && event.key.toLowerCase() === "p") setTool("zone_polygon");
      if (activeLayer === "zones" && event.key.toLowerCase() === "b") setTool("zone_bezier");
      if (activeLayer === "zones" && event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey) setTool("channel_bezier");
      if (activeLayer === "artwork" && event.key.toLowerCase() === "i") setTool("image_place");
      if ((activeLayer === "artwork" || activeLayer === "reference") && event.key.toLowerCase() === "p") setTool("build_area_polygon");
      if ((activeLayer === "artwork" || activeLayer === "reference") && event.key.toLowerCase() === "b") setTool("build_area_bezier");
      if (activeLayer === "strings" && event.key.toLowerCase() === "l") setTool("led_string");
      if (activeLayer === "strings" && event.key.toLowerCase() === "d") setTool("data_cable");
      if (activeLayer === "strings" && event.key.toLowerCase() === "x") setTool("cut");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function replaceDocument(nextDocument: PartituraDocument) {
    documentRef.current = nextDocument;
    setDocument(nextDocument);
  }

  function recordDesignerHistory(currentDocument: PartituraDocument) {
    const interactionId = historyInteractionIdRef.current;
    if (historyRecordedInteractionRef.current === interactionId) return;
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(currentDocument), selection }
    ];
    redoHistoryRef.current = [];
    historyRecordedInteractionRef.current = interactionId;
    setHistoryRevision((revision) => revision + 1);
  }

  function restoreDesignerHistory(entry: DesignerHistoryEntry, notice: "Undo" | "Redo") {
    const restoredDocument = clonePartituraDocument(entry.document);
    replaceDocument(restoredDocument);
    setSelection(entry.selection);
    discardRuntimeArtifacts();
    historyInteractionIdRef.current += 1;
    historyRecordedInteractionRef.current = null;
    setFabricationNotice(notice);
    setHistoryRevision((revision) => revision + 1);
  }

  function undoDesignerChange() {
    const entry = undoHistoryRef.current.at(-1);
    if (!entry) return;
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    redoHistoryRef.current = [
      ...redoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(documentRef.current), selection }
    ];
    restoreDesignerHistory(entry, "Undo");
  }

  function redoDesignerChange() {
    const entry = redoHistoryRef.current.at(-1);
    if (!entry) return;
    redoHistoryRef.current = redoHistoryRef.current.slice(0, -1);
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(documentRef.current), selection }
    ];
    restoreDesignerHistory(entry, "Redo");
  }

  function discardRuntimeArtifacts() {
    animationGenerationIdRef.current += 1;
    animationResultRef.current = null;
    generatedPartituraStaleRef.current = true;
    setAnimationResult(null);
    setAnimationPlaying(false);
    setPartitura((current) => (
      current.generatedPartitura === undefined ? current : { ...current, generatedPartitura: undefined }
    ));
  }

  function updateLiveDocument(updater: (current: PartituraDocument) => PartituraDocument, options: { invalidateRuntime?: boolean; recordHistory?: boolean } = {}) {
    const nextDocument = updater(documentRef.current);
    if (nextDocument === documentRef.current) return nextDocument;
    if (options.recordHistory !== false) recordDesignerHistory(documentRef.current);
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    if (options.invalidateRuntime) discardRuntimeArtifacts();
    return nextDocument;
  }

  async function save(nextDocument?: PartituraDocument, generatedPartitura: unknown | typeof GENERATED_PARTITURA_UNSPECIFIED = GENERATED_PARTITURA_UNSPECIFIED) {
    const normalizedDocument = normalizeDefaultSignLayout(nextDocument ?? documentRef.current);
    const persistedGeneratedPartitura = generatedPartitura !== GENERATED_PARTITURA_UNSPECIFIED
      ? generatedPartitura
      : generatedPartituraStaleRef.current ? null : partitura.generatedPartitura;
    setSaving(true);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: partitura.name,
          status: partitura.status,
          document: normalizedDocument,
          generatedPartitura: persistedGeneratedPartitura ?? null,
          validationReport: partitura.validationReport ?? {}
        })
      });
      const payload = (await response.json()) as { partitura?: PersistedPartitura };
      if (payload.partitura) {
        generatedPartituraStaleRef.current = false;
        setPartitura(payload.partitura);
        const savedDocument = clonePartituraDocument(payload.partitura.document);
        savedDocumentSignatureRef.current = persistedDocumentSignature(savedDocument);
        replaceDocument(savedDocument);
      }
    } finally {
      setSaving(false);
    }
  }

  function updateDesigner(nextDesigner: DesignerForm) {
    updateLiveDocument((current) => ({ ...current, designer: nextDesigner }), { invalidateRuntime: true });
  }

  function patchDesigner(patch: Partial<DesignerForm>) {
    updateDesigner({ ...designer, ...patch });
  }

  function patchDesignerLayer(layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) {
    updateDesigner({
      ...designer,
      layers: {
        ...designer.layers,
        [layer]: { ...designer.layers[layer], ...patch }
      }
    });
  }

  function ensureLayerVisible(layer: keyof DesignerLayersForm) {
    if (designer.layers[layer].visible) return;
    updateDesigner({
      ...designer,
      layers: { ...designer.layers, [layer]: { ...designer.layers[layer], visible: true } }
    });
  }

  function reorderDesignerItems(layer: "artwork" | "reference" | "zones" | "strings", activeId: string, overId: string) {
    if (layer === "artwork") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, artwork: reorderById(designer.artwork, activeId, overId) });
      setSelection({ type: "artwork", id: activeId });
      return;
    }
    if (layer === "reference") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, buildAreas: reorderById(designer.buildAreas, activeId, overId) });
      setSelection({ type: "build_area", id: activeId });
      return;
    }
    if (layer === "zones") {
      if (designer.layers.zones.locked) return;
      updateDesigner({ ...designer, zones: reorderById(designer.zones, activeId, overId) });
      setSelection({ type: "zone", id: activeId });
      return;
    }
    if (designer.layers.strings.locked) return;
    const activeRoute = designer.routes.find((route) => route.id === activeId);
    const overRoute = designer.routes.find((route) => route.id === overId);
    if (!activeRoute || !overRoute || activeRoute.kind !== overRoute.kind) return;
    updateDesigner({ ...designer, routes: reorderRoutesWithinKind(designer.routes, activeId, overId) });
    setSelection({ type: "route", id: activeId });
  }

  function addArtwork(point?: DesignerPoint) {
    if (designer.layers.artwork.locked) {
      setFabricationNotice("Artwork layer is locked. Unlock it to add images.");
      setTool("select");
      return;
    }
    const next = designer.artwork.length + 1;
    const width = Math.max(12, Math.round(activeViewport.width * 0.3));
    const height = Math.max(8, Math.round(activeViewport.height * 0.3));
    const centerX = point?.x ?? activeViewport.x + activeViewport.width / 2;
    const centerY = point?.y ?? activeViewport.y + activeViewport.height / 2;
    const artwork: DesignerArtworkForm = {
      id: `artwork_${Date.now()}`,
      assetId: "",
      name: `Image ${next}`,
      x: snapValue(centerX - width / 2, designer.snapCm),
      y: snapValue(centerY - height / 2, designer.snapCm),
      width,
      height,
      visible: true,
      locked: false,
      opacity: 0.85
    };
    updateDesigner({
      ...designer,
      layers: { ...designer.layers, artwork: { ...designer.layers.artwork, visible: true } },
      artwork: [...designer.artwork, artwork]
    });
    setActiveLayer("artwork");
    setSelection({ type: "artwork", id: artwork.id });
    setTool("select");
    setFabricationNotice("Image container added. Pick its image in the panel.");
  }

  function placeImageAt(point: DesignerPoint) {
    addArtwork(point);
  }

  async function uploadArtwork(file: File) {
    if (!document.projectId) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/upload`, { method: "POST", body: form });
      if (!response.ok) {
        setFabricationNotice("Image upload failed.");
        return;
      }
      setFabricationNotice(`Uploaded ${file.name}. Pick it in Images and place it.`);
      setAssetsVersion((version) => version + 1);
    } catch {
      setFabricationNotice("Image upload failed.");
    }
  }

  function patchArtwork(artworkId: string, patch: Partial<DesignerArtworkForm>) {
    const touchesGeometry = patch.x !== undefined || patch.y !== undefined || patch.width !== undefined || patch.height !== undefined;
    if (designer.layers.artwork.locked && touchesGeometry) return;
    updateDesigner({ ...designer, artwork: designer.artwork.map((entry) => (entry.id === artworkId ? { ...entry, ...patch } : entry)) });
  }

  function patchZoneVisual(zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchBuildAreaVisual(buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === buildAreaId ? { ...buildArea, ...patch } : buildArea)) });
  }

  function patchBuildArea(buildAreaId: string, patch: Partial<DesignerBuildAreaForm>) {
    if (designer.layers.artwork.locked) return;
    const currentBuildArea = designer.buildAreas.find((buildArea) => buildArea.id === buildAreaId);
    const previousId = buildAreaId;
    const nextId = patch.id ?? previousId;
    const nextPatch = patch.shape === "polygon" && currentBuildArea && !currentBuildArea.points
      ? { ...patch, points: rectanglePoints(currentBuildArea) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({
      ...designer,
      buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === buildAreaId ? { ...buildArea, ...nextPatch } : buildArea))
    });
    if (nextId !== previousId) setSelection({ type: "build_area", id: nextId });
  }

  function selectDesignerItem(nextSelection: DesignerSelection, additive = false) {
    // Empty-space drags are used to pan/zoom in Animate. Keep the current
    // optical target selected so its properties panel does not disappear.
    if (editorMode === "animate" && nextSelection === null) return;
    if (editorMode === "animate") {
      const source = nextSelection?.type === "light_source" ? designer.lightSources.find((entry) => entry.id === nextSelection.id) : null;
      const opticalTarget: OpticalTargetRef | null = nextSelection?.type === "zone" || nextSelection?.type === "channel"
        ? { type: nextSelection.type, id: nextSelection.id }
        : source ? { type: source.targetType, id: source.targetId } : null;
      if (opticalTarget && additive) {
        const base = opticalTargetSelection.length ? opticalTargetSelection : selectedOpticalTarget ? [selectedOpticalTarget] : [];
        const exists = base.some((target) => target.type === opticalTarget.type && target.id === opticalTarget.id);
        const nextTargets = exists
          ? base.filter((target) => target.type !== opticalTarget.type || target.id !== opticalTarget.id)
          : [...base, opticalTarget];
        setOpticalTargetSelection(nextTargets);
        const primary = nextTargets.at(-1);
        setSelection(primary ? { type: primary.type, id: primary.id } : null);
        setLightingEditorOpen(Boolean(primary));
        return;
      }
      setOpticalTargetSelection(opticalTarget ? [opticalTarget] : []);
    } else {
      setOpticalTargetSelection([]);
      const selectionLayer = designerLayerForSelection(nextSelection);
      if (selectionLayer) {
        setActiveLayer(selectionLayer);
        setLayersPanelOpen(true);
      }
    }
    setSelection(nextSelection);
    if (editorMode === "animate") {
      setLightingEditorOpen(nextSelection?.type === "zone" || nextSelection?.type === "channel" || nextSelection?.type === "light_source");
    }
  }

  function activateDesignerLayer(layer: DesignerActiveLayer) {
    setActiveLayer(layer);
    setTool("select");
    setSelection(null);
  }

  function openLightingSetup(target: OpticalTargetRef) {
    selectDesignerItem({ type: target.type, id: target.id });
    setLightingEditorOpen(true);
  }

  function patchController(patch: Partial<DesignerControllerForm>) {
    if (designer.layers.hardware.locked) return;
    updateDesigner({ ...designer, controller: { ...designer.controller, ...patch, id: "controller" } });
  }

  function patchZone(zoneId: string, patch: Partial<DesignerZoneForm>) {
    if (designer.layers.zones.locked) return;
    const currentZone = designer.zones.find((zone) => zone.id === zoneId);
    const nextPatch = patch.shape === "polygon" && currentZone && !currentZone.points
      ? { ...patch, points: rectanglePoints(currentZone) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({
      ...designer,
      zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...nextPatch } : zone))
    });
    if (patch.id && patch.id !== zoneId) setSelection({ type: "zone", id: patch.id });
  }

  function patchRoute(routeId: string, patch: Partial<DesignerRouteForm>) {
    if (designer.layers.strings.locked) return;
    updateDesigner({
      ...designer,
      routes: designer.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route))
    });
    if (patch.id && patch.id !== routeId) setSelection({ type: "route", id: patch.id });
  }

  function patchChannel(channelId: string, patch: Partial<DesignerChannelForm>) {
    if (designer.layers.zones.locked) return;
    updateDesigner({
      ...designer,
      channels: designer.channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel))
    });
    if (patch.id && patch.id !== channelId) setSelection({ type: "channel", id: patch.id });
  }

  function removeChannel(channelId: string) {
    updateDesigner({
      ...designer,
      channels: designer.channels.filter((channel) => channel.id !== channelId),
      lightSources: designer.lightSources.filter((source) => !(source.targetType === "channel" && source.targetId === channelId))
    });
    setSelection(null);
    setFabricationNotice("Channel deleted.");
  }

  function addGroup() {
    const groups = designer.groups ?? [];
    const usedIds = new Set(groups.map((group) => group.id));
    let index = groups.length + 1;
    while (usedIds.has(`group_${index}`)) index += 1;
    const members = designer.zones.map((zone) => ({ type: "zone" as const, id: zone.id }));
    const group: DesignerGroupForm = { id: `group_${index}`, name: `Group ${index}`, members };
    updateDesigner({ ...designer, groups: [...groups, group] });
    setFabricationNotice(`Group ${index} created with ${members.length} zones. Uncheck the ones to exclude, then Compile.`);
  }

  function patchGroup(groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? []).map((group) => (group.id === groupId ? { ...group, ...patch } : group))
    });
  }

  function removeGroup(groupId: string) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? [])
        .filter((group) => group.id !== groupId)
        .map((group) => ({ ...group, members: group.members.filter((member) => !(member.type === "group" && member.id === groupId)) }))
    });
    setFabricationNotice("Group deleted.");
  }

  function toggleGroupMember(groupId: string, memberType: "zone" | "group", memberId: string) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? []).map((group) => {
        if (group.id !== groupId) return group;
        const exists = group.members.some((member) => member.type === memberType && member.id === memberId);
        return {
          ...group,
          members: exists
            ? group.members.filter((member) => !(member.type === memberType && member.id === memberId))
            : [...group.members, { type: memberType, id: memberId }]
        };
      })
    });
  }

  function selectGroupZone(zoneId: string) {
    if (!designer.zones.some((zone) => zone.id === zoneId)) return;
    setActiveLayer("zones");
    setTool("select");
    setSelection({ type: "zone", id: zoneId });
  }

  function updateBuildAreaPoint(buildAreaId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    const point = buildArea?.points?.[pointIndex];
    if (!buildArea || !point) return;
    patchBuildArea(buildAreaId, updatePolygonPoint(buildArea, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function updateZonePoint(zoneId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    const point = zone?.points?.[pointIndex];
    if (!zone || !point) return;
    patchZone(zoneId, updatePolygonPoint(zone, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function setBuildAreaNodeType(buildAreaId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    patchBuildArea(buildAreaId, setPolygonNodeType(buildArea, pointIndex, nodeType));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function setZoneNodeType(zoneId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    patchZone(zoneId, setPolygonNodeType(zone, pointIndex, nodeType));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function insertBuildAreaPoint(buildAreaId: string, insertIndex: number, point: DesignerPoint) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    patchBuildArea(buildAreaId, insertPolygonPoint(buildArea, insertIndex, point, designer.snapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: insertIndex });
    setFabricationNotice("Reference polygon point inserted.");
  }

  function insertZonePoint(zoneId: string, insertIndex: number, point: DesignerPoint) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    patchZone(zoneId, insertPolygonPoint(zone, insertIndex, point, designer.snapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex: insertIndex });
    setFabricationNotice("Zone polygon point inserted.");
  }

  function deleteBuildAreaPoint(buildAreaId: string, pointIndex: number) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    if (!buildArea.points || buildArea.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextBuildArea = deletePolygonPoint(buildArea, pointIndex);
    patchBuildArea(buildAreaId, nextBuildArea);
    const nextIndex = Math.min(pointIndex, Math.max(0, (nextBuildArea.points?.length ?? 1) - 1));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: nextIndex });
    setFabricationNotice("Reference polygon point deleted.");
  }

  function deleteZonePoint(zoneId: string, pointIndex: number) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    if (!zone.points || zone.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextZone = deletePolygonPoint(zone, pointIndex);
    patchZone(zoneId, nextZone);
    const nextIndex = Math.min(pointIndex, Math.max(0, (nextZone.points?.length ?? 1) - 1));
    setSelection({ type: "zone", id: zoneId, pointIndex: nextIndex });
    setFabricationNotice("Zone polygon point deleted.");
  }

  function setChannelNodeType(channelId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    patchChannel(channelId, setChannelNodeTypePath(channel, pointIndex, nodeType));
    setSelection({ type: "channel", id: channelId, pointIndex });
  }

  function setChannelNodeRadius(channelId: string, pointIndex: number, radiusMm: number) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    const value = Math.max(0, Math.round(radiusMm));
    patchChannel(channelId, { points: channel.points.map((point, index) => (index === pointIndex ? { ...point, radiusMm: value } : point)) });
    setSelection({ type: "channel", id: channelId, pointIndex });
    setFabricationNotice(value > 0 ? `Corner fillet ${value} mm.` : "Corner fillet removed.");
  }

  function insertChannelPoint(channelId: string, insertIndex: number, point: DesignerPoint) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    patchChannel(channelId, insertChannelPointPath(channel, insertIndex, point, designer.snapCm));
    setSelection({ type: "channel", id: channelId, pointIndex: insertIndex });
    setFabricationNotice("Channel point inserted.");
  }

  function updateChannelPoint(channelId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    const current = channel?.points[pointIndex];
    if (!channel || !current) return;
    patchChannel(channelId, updateChannelPointPath(channel, pointIndex, { ...current, ...patch }, designer.snapCm));
  }

  function deleteChannelPoint(channelId: string, pointIndex: number) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    if (channel.points.length <= 2) {
      setFabricationNotice("Channel needs at least 2 points.");
      return;
    }
    const nextChannel = deleteChannelPointPath(channel, pointIndex);
    patchChannel(channelId, nextChannel);
    const nextIndex = Math.min(pointIndex, Math.max(0, nextChannel.points.length - 1));
    setSelection({ type: "channel", id: channelId, pointIndex: nextIndex });
    setFabricationNotice("Channel point deleted.");
  }

  function updateRoutePoint(routeId: string, pointIndex: number, patch: Partial<{ x: number; y: number }>) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route) return;
    patchRoute(routeId, { points: route.points.map((point, index) => (index === pointIndex ? { ...point, ...patch } : point)) });
  }

  function insertRoutePoint(routeId: string, point: DesignerPoint) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route) return;
    const insertIndex = nearestRouteInsertIndex(route, point);
    const nextPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) };
    patchRoute(routeId, { points: [...route.points.slice(0, insertIndex), nextPoint, ...route.points.slice(insertIndex)] });
    setSelection({ type: "route", id: routeId, pointIndex: insertIndex });
  }

  function deleteRoutePoint(routeId: string, pointIndex: number) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route || route.points.length <= 2 || pointIndex <= 0 || pointIndex >= route.points.length - 1) return;
    patchRoute(routeId, { points: route.points.filter((_, index) => index !== pointIndex) });
    setSelection({ type: "route", id: routeId });
  }

  function splitRoute(routeId: string, pointIndex: number) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route || pointIndex <= 0 || pointIndex >= route.points.length - 1) return;
    const next = designer.routes.length + 1;
    const firstRoute = { ...route, points: route.points.slice(0, pointIndex + 1) };
    const secondRoute = {
      ...route,
      id: `${route.id}_cut_${next}`,
      name: `${route.name} cut`,
      points: route.points.slice(pointIndex)
    };
    updateDesigner({
      ...designer,
      routes: designer.routes.flatMap((entry) => entry.id === routeId ? [firstRoute, secondRoute] : [entry])
    });
    setSelection({ type: "route", id: secondRoute.id });
  }

  function handleCutRoutePoint(routeId: string, pointIndex: number) {
    splitRoute(routeId, pointIndex);
    setTool("select");
  }

  function detachSelectedRoutePoint() {
    if (!selectedRoute || typeof selectedRoutePointIndex !== "number") return;
    const result = detachSolderedRoutePoint(
      designer.routes,
      designer.controller,
      selectedRoute.id,
      selectedRoutePointIndex,
      designer.snapCm
    );
    if (!result.changed) return;
    updateDesigner({ ...designer, routes: result.routes });
    setSelection({ type: "route", id: result.routeId, pointIndex: result.pointIndex });
    setFabricationNotice("Solder joint detached; routes were preserved.");
  }

  function autoSolderRoutePoint(routeId: string, pointIndex: number, finalPoint?: DesignerPoint) {
    const routes = finalPoint ? moveRoutePoint(designer.routes, routeId, pointIndex, finalPoint) : designer.routes;
    const route = routes.find((entry) => entry.id === routeId);
    if (!route || !isRouteTerminal(route, pointIndex)) {
      return;
    }
    const point = route.points[pointIndex];
    const portSpacingCm = designer.controller.height / Math.max(1, designer.controller.dataOutputs + 1);
    const captureRadiusCm = Math.max(0.65, Math.min(1.5, portSpacingCm * 0.45));
    const nearbyControllerPort = findNearbyControllerPort(designer.controller, route, pointIndex, point, captureRadiusCm, designer.snapCm);
    if (nearbyControllerPort) {
      updateDesigner({
        ...designer,
        routes: routes.map((entry) => (
          entry.id === routeId
            ? {
              ...entry,
              points: entry.points.map((entryPoint, index) => index === pointIndex ? { ...entryPoint, ...nearbyControllerPort.point, joint: true } : entryPoint)
            }
            : entry
        ))
      });
      setFabricationNotice(`Data cable soldered to controller output ${nearbyControllerPort.portIndex + 1}.`);
      return;
    }
    const matchingTerminal = findMatchingSolderTerminal(routes, routeId, pointIndex, designer.snapCm)
      ?? findNearbySolderTerminal(routes, routeId, pointIndex, point, captureRadiusCm);
    if (matchingTerminal) {
      solderRouteTerminals({ routeId, pointIndex }, matchingTerminal, routes);
      return;
    }
    const controllerPort = findMatchingControllerPort(designer.controller, routes, routeId, pointIndex, designer.snapCm);
    if (controllerPort !== null) {
      updateDesigner({
        ...designer,
        routes: routes.map((entry) => (
          entry.id === routeId
            ? {
              ...entry,
              points: entry.points.map((point, index) => index === pointIndex ? { ...point, joint: true } : point)
            }
            : entry
        ))
      });
      setFabricationNotice(`Data cable soldered to controller output ${controllerPort + 1}.`);
      return;
    }
    if (finalPoint) updateDesigner({ ...designer, routes });
    setFabricationNotice("Place a green and red terminal on the same snap point to solder.");
  }

  function moveSolderedTerminals(terminals: DesignerRouteTerminal[], finalPoint: DesignerPoint) {
    updateDesigner({
      ...designer,
      routes: moveRouteTerminals(designer.routes, terminals, { ...finalPoint, joint: true })
    });
    setFabricationNotice("Soldered joint moved.");
  }

  function solderRouteTerminals(source: DesignerRouteTerminal, target: DesignerRouteTerminal, routeSet = designer.routes) {
    const sourceRoute = routeSet.find((route) => route.id === source.routeId);
    const targetRoute = routeSet.find((route) => route.id === target.routeId);
    if (!sourceRoute || !targetRoute || sourceRoute.id === targetRoute.id) return;
    if (!canSolderRoutes(sourceRoute, source.pointIndex, targetRoute, target.pointIndex, designer.snapCm)) {
      return;
    }

    const sourcePoint = sourceRoute.points[source.pointIndex];
    const targetPoint = targetRoute.points[target.pointIndex];
    const solderPoint = {
      x: snapValue((sourcePoint.x + targetPoint.x) / 2, designer.snapCm),
      y: snapValue((sourcePoint.y + targetPoint.y) / 2, designer.snapCm),
      joint: true
    };
    if (sourceRoute.kind !== targetRoute.kind) {
      updateDesigner({
        ...designer,
        routes: moveRouteTerminals(routeSet, [source, target], solderPoint)
      });
      setSelection({ type: "route", id: source.routeId, pointIndex: source.pointIndex });
      setFabricationNotice("Cable and LED string snapped and soldered.");
      return;
    }
    const sourcePoints = sourceRoute.points.map((point, index) => index === source.pointIndex ? solderPoint : point);
    const targetPoints = targetRoute.points.map((point, index) => index === target.pointIndex ? solderPoint : point);
    const sourceAtStart = source.pointIndex === 0;
    const targetAtStart = target.pointIndex === 0;
    const orientedSource = sourceAtStart ? [...sourcePoints].reverse() : sourcePoints;
    const orientedTarget = targetAtStart ? targetPoints : [...targetPoints].reverse();
    const mergedRoute = {
      ...sourceRoute,
      name: `${sourceRoute.name} soldered`,
      points: [...orientedSource, ...orientedTarget.slice(1)]
    };
    updateDesigner({
      ...designer,
      routes: routeSet.flatMap((route) => {
        if (route.id === sourceRoute.id) return [mergedRoute];
        if (route.id === targetRoute.id) return [];
        return [route];
      })
    });
    setSelection({ type: "route", id: mergedRoute.id });
    setFabricationNotice("Routes snapped and soldered.");
  }

  function deleteSelection() {
    if (!selection) return;
    if (selection.type === "artwork") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, artwork: designer.artwork.filter((artwork) => artwork.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Artwork reference deleted.");
      return;
    }
    if (selection.type === "build_area") {
      if (designer.layers.artwork.locked) return;
      if (typeof selection.pointIndex === "number") {
        deleteBuildAreaPoint(selection.id, selection.pointIndex);
        return;
      }
      updateDesigner({
        ...designer,
        buildAreas: designer.buildAreas.filter((buildArea) => buildArea.id !== selection.id),
        lightSources: designer.lightSources.map((source) => source.receiverType === "build_area" && source.receiverId === selection.id ? { ...source, receiverType: "canvas", receiverId: undefined } : source)
      });
      setSelection(null);
      return;
    }
    if (selection.type === "zone" && designer.layers.zones.locked) return;
    if (selection.type === "channel" && designer.layers.zones.locked) return;
    if (selection.type === "light_source" && designer.layers.lightSources.locked) return;
    if (selection.type === "route" && designer.layers.strings.locked) return;
    if (selection.type === "zone" && typeof selection.pointIndex === "number") {
      deleteZonePoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "channel" && typeof selection.pointIndex === "number") {
      deleteChannelPoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "zone") {
      const zones = designer.zones.filter((zone) => zone.id !== selection.id);
      updateDesigner({
        ...designer,
        zones,
        lightSources: designer.lightSources
          .filter((source) => !(source.targetType === "zone" && source.targetId === selection.id))
          .map((source) => source.receiverType === "zone" && source.receiverId === selection.id ? { ...source, receiverType: "canvas", receiverId: undefined } : source),
        groups: (designer.groups ?? []).map((group) => ({
          ...group,
          members: group.members.filter((member) => !(member.type === "zone" && member.id === selection.id))
        }))
      });
      setSelection(null);
    }
    if (selection.type === "channel") {
      removeChannel(selection.id);
      return;
    }
    if (selection.type === "light_source") {
      updateDesigner({ ...designer, lightSources: designer.lightSources.filter((source) => source.id !== selection.id) });
      setSelection(null);
      return;
    }
    if (selection.type === "route" && typeof selection.pointIndex === "number") {
      deleteRoutePoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "route" && designer.routes.length > 1) {
      const routes = clearFloatingTerminalJoints(
        designer.routes.filter((route) => route.id !== selection.id),
        designer.controller,
        designer.snapCm
      );
      updateDesigner({
        ...designer,
        routes,
        lightSources: designer.lightSources.map((source) => ({ ...source, stringIds: source.stringIds.filter((id) => id !== selection.id) }))
      });
      setSelection(null);
    }
  }

  function copySelection() {
    if (selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "route")) setClipboard(selection);
  }

  function pasteSelection() {
    if (!clipboard) return;
    if (clipboard.type === "artwork") {
      const source = designer.artwork.find((artwork) => artwork.id === clipboard.id);
      if (!source) return;
      const next = designer.artwork.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, x: source.x + designer.snapCm, y: source.y + designer.snapCm };
      updateDesigner({ ...designer, artwork: [...designer.artwork, copy] });
      setActiveLayer("artwork");
      setSelection({ type: "artwork", id: copy.id });
    }
    if (clipboard.type === "zone") {
      const source = designer.zones.find((zone) => zone.id === clipboard.id);
      if (!source) return;
      const next = nextDesignerItemNumber(designer.zones, `${source.id}_copy_`);
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, x: source.x + designer.snapCm, y: source.y + designer.snapCm };
      updateDesigner({ ...designer, zones: [...designer.zones, copy] });
      setSelection({ type: "zone", id: copy.id });
    }
    if (clipboard.type === "route") {
      const source = designer.routes.find((route) => route.id === clipboard.id);
      if (!source) return;
      const next = designer.routes.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, points: source.points.map((point) => ({ x: point.x + designer.snapCm, y: point.y + designer.snapCm })) };
      updateDesigner({ ...designer, routes: [...designer.routes, copy] });
      setSelection({ type: "route", id: copy.id });
    }
  }

  function zoomToFit() {
    setViewport(fitViewportToDesigner(designer));
  }

  function compileLayout() {
    const nextDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(documentRef.current));
    replaceDocument(nextDocument);
    discardRuntimeArtifacts();
    const layout = nextDocument.compiledLayout;
    setFabricationNotice(layout?.validation.errors.length
      ? layout.validation.errors[0]
      : `Compiled: ${layout?.pixelMap.length ?? 0} mapped pixels across ${layout?.outputs.filter((output) => output.pixelCount > 0).length ?? 0} outputs.`);
    void save(nextDocument, null);
  }

  function openAnimationViewer() {
    setAnimationViewerViewport(fitViewportToDesigner(designer));
    setAnimationViewerOpen(true);
    if (!animationResultRef.current?.ok) void previewAnimation();
  }

  function stopAnimationViewer() {
    setAnimationPlaying(false);
    void previewAnimationAt(0);
  }

  async function previewAnimation(sourceDocument = documentRef.current, options: { play?: boolean } = {}) {
    const generationId = ++animationGenerationIdRef.current;
    const shouldPlay = options.play ?? true;
    setAnimationGenerating(true);
    try {
      const compiledDocument = normalizeDefaultSignLayout(sourceDocument);
      const compileIsFresh = Boolean(
        compiledDocument.compiledLayout
        && compiledDocument.compiledDesignerSignature === designerCompileSignature(compiledDocument.designer)
      );
      if (!compileIsFresh || !compiledDocument.compiledLayout || compiledDocument.compiledLayout.validation.errors.length) {
        setAnimationPlaying(false);
        setAnimationResult(null);
        setFabricationNotice("Compile the Designer without electrical errors before animating.");
        return;
      }
      const previewDocument = { ...compiledDocument, previewTimeMs: initialAnimationPreviewTime(compiledDocument) };
      replaceDocument(previewDocument);
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewDocument)
      });
      const payload = (await response.json()) as ApiResult;
      if (generationId !== animationGenerationIdRef.current) return;
      animationResultRef.current = payload;
      setAnimationResult(payload);
      if (payload.ok) {
        setAnimationPlayerOpen(false);
        setAnimationPlaying(shouldPlay);
        setFabricationNotice(`Animation running: ${payload.preview?.pixelCount ?? 0} mapped pixels.`);
      } else {
        setAnimationPlaying(false);
        setFabricationNotice(payload.message ?? payload.validation?.errors[0]?.message ?? "Animation generation failed.");
      }
    } finally {
      if (generationId === animationGenerationIdRef.current) setAnimationGenerating(false);
    }
  }

  async function previewAnimationAt(timeMs: number) {
    const nextTimeMs = Math.max(0, Math.round(timeMs));
    setAnimationPlaying(false);
    const previewDocument = updateLiveDocument((current) => ({ ...current, previewTimeMs: nextTimeMs }), { recordHistory: false });
    const current = animationResultRef.current;
    if (!current?.ok || !current.partitura) return;
    try {
      const response = await fetch("/api/lighting/partituras/simulate-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partitura: current.partitura, sceneId: previewDocument.activeSceneId, timeMs: nextTimeMs })
      });
      const payload = (await response.json()) as { ok: boolean; preview?: Preview };
      if (payload.ok && payload.preview) setAnimationResult({ ...current, preview: payload.preview });
    } catch {
      setFabricationNotice("Animation frame request failed.");
    }
  }

  function beginAnimationTimelineResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = Math.min(animationTimelineHeight, maximumTimelineHeight(window.innerHeight));
    setAnimationTimelineCollapsed(false);
    const move = (moveEvent: PointerEvent) => {
      setAnimationTimelineHeight(Math.min(maximumTimelineHeight(window.innerHeight), Math.max(140, startHeight - (moveEvent.clientY - startY))));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function patchOpticalTreatment(treatmentId: string, patch: Partial<DesignerOpticalTreatment>) {
    recordClientDebug("optical_treatment_patch", {
      target: selectedOpticalTarget ? `${selectedOpticalTarget.type}:${selectedOpticalTarget.id}` : null,
      treatmentId,
      patch
    });
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return {
        ...current,
        designer: {
          ...currentDesigner,
          lightSources: currentDesigner.lightSources.map((treatment) => treatment.id === treatmentId ? { ...treatment, ...patch } : treatment)
        }
      };
    });
  }

  function addOpticalTreatment(mode: DesignerOpticalMode) {
    if (!selectedOpticalTarget || selectedOpticalTreatments.some((treatment) => treatment.mode === mode)) return;
    const treatment = {
      ...createDefaultOpticalTreatment(selectedOpticalTarget.type, selectedOpticalTarget.id, mode),
      name: `${selectedZone?.name ?? selectedChannel?.name ?? selectedOpticalTarget.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`,
      stringIds: Array.from(new Set((document.compiledLayout?.zones.find((zone) => zone.id === selectedOpticalTarget.id)?.pixelIds ?? [])
        .map((pixelId) => document.compiledLayout?.pixelMap.find((pixel) => pixel.id === pixelId)?.stringId)
        .filter((stringId): stringId is string => Boolean(stringId))))
    };
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      if (currentDesigner.lightSources.some((entry) => entry.id === treatment.id)) return current;
      return { ...current, designer: { ...currentDesigner, lightSources: [...currentDesigner.lightSources, treatment] } };
    });
  }

  function removeOpticalTreatment(treatmentId: string) {
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return { ...current, designer: { ...currentDesigner, lightSources: currentDesigner.lightSources.filter((treatment) => treatment.id !== treatmentId) } };
    });
  }

  function setSelectedOpticalMode(mode: DesignerOpticalMode, enabled: boolean) {
    if (!selectedOpticalTargets.length) return;
    const selectedKeys = new Set(selectedOpticalTargets.map((target) => `${target.type}:${target.id}`));
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      const existingKeys = new Set<string>();
      const lightSources = currentDesigner.lightSources.map((source) => {
        const key = `${source.targetType}:${source.targetId}`;
        if (source.mode !== mode || !selectedKeys.has(key)) return source;
        existingKeys.add(key);
        return source.enabled === enabled ? source : { ...source, enabled };
      });
      if (enabled) {
        selectedOpticalTargets.forEach((target) => {
          const key = `${target.type}:${target.id}`;
          if (existingKeys.has(key)) return;
          const targetName = target.type === "zone"
            ? currentDesigner.zones.find((zone) => zone.id === target.id)?.name
            : currentDesigner.channels.find((channel) => channel.id === target.id)?.name;
          const source = {
            ...createDefaultOpticalTreatment(target.type, target.id, mode),
            name: `${targetName ?? target.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`,
            stringIds: Array.from(new Set((current.compiledLayout?.zones.find((zone) => zone.id === target.id)?.pixelIds ?? [])
              .map((pixelId) => current.compiledLayout?.pixelMap.find((pixel) => pixel.id === pixelId)?.stringId)
              .filter((stringId): stringId is string => Boolean(stringId))))
          };
          lightSources.push(source);
        });
      }
      return { ...current, designer: { ...currentDesigner, lightSources } };
    });
  }

  function patchSelectedOpticalMode(mode: DesignerOpticalMode, patch: Partial<DesignerOpticalTreatment>) {
    if (!selectedOpticalTargets.length) return;
    const selectedKeys = new Set(selectedOpticalTargets.map((target) => `${target.type}:${target.id}`));
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return {
        ...current,
        designer: {
          ...currentDesigner,
          lightSources: currentDesigner.lightSources.map((source) => (
            source.mode === mode && source.enabled && selectedKeys.has(`${source.targetType}:${source.targetId}`)
              ? { ...source, ...patch }
              : source
          ))
        }
      };
    });
  }

  function updateAnimationDocument(nextDocument: PartituraDocument) {
    const hadPreview = Boolean(animationResultRef.current?.ok);
    const resumePlayback = animationPlaying;
    const previewTimeMs = animationResultRef.current?.preview?.timeMs ?? nextDocument.previewTimeMs;
    const clipEnablementChanged = clipEnablementSignature(documentRef.current) !== clipEnablementSignature(nextDocument);
    if (nextDocument !== documentRef.current) recordDesignerHistory(documentRef.current);
    replaceDocument(nextDocument);
    if (hadPreview) {
      // Structural timeline edits must not compete with the active frame loop.
      // Pause while the replacement partitura is generated, then resume only
      // after the new runtime artifact is installed.
      if (resumePlayback) setAnimationPlaying(false);
      if (clipEnablementChanged) {
        // A muted clip must stop contributing immediately. Do not let playback
        // continue from the previously generated partitura while its replacement
        // is being rendered.
        animationResultRef.current = null;
        setAnimationResult(null);
      }
      // Keep the last valid frame visible while regenerating. Clearing it here
      // made every color edit appear as the renderer's neutral gray fallback.
      generatedPartituraStaleRef.current = true;
      setPartitura((current) => (
        current.generatedPartitura === undefined ? current : { ...current, generatedPartitura: undefined }
      ));
      void previewAnimation({ ...nextDocument, previewTimeMs }, { play: resumePlayback });
    } else {
      discardRuntimeArtifacts();
    }
  }

  const canCopySelection = Boolean(selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "route"));
  const canDeleteSelection = Boolean(selection)
    && selection?.type !== "controller"
    && !(selection?.type === "artwork" && designer.layers.artwork.locked)
    && !(selection?.type === "build_area" && designer.layers.artwork.locked)
    && !(selection?.type === "zone" && designer.layers.zones.locked)
    && !(selection?.type === "channel" && designer.layers.zones.locked)
    && !(selection?.type === "light_source" && designer.layers.lightSources.locked)
    && !(selection?.type === "route" && designer.layers.strings.locked);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border-2 bg-card px-2 whitespace-nowrap">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" density="compact" type="button" className="shrink-0 px-2">
            <Link href={`/partituras/generator/${encodeURIComponent(partitura.id)}`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0 pr-1">
            <div className="max-w-[220px] truncate text-body-sm font-semibold">{partitura.name}</div>
          </div>
        </div>
        <div className="flex h-8 shrink-0 items-center rounded-md border border-input bg-surface-2 p-0.5">
          <button type="button" className={`flex h-7 items-center gap-1 rounded px-2 text-body-sm ${editorMode === "design" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover"}`} onClick={() => setEditorMode("design")}>
            <MousePointer2 className="h-3.5 w-3.5" /> Design
          </button>
          <button type="button" disabled={editorMode !== "animate" && !canAnimate} title={!canAnimate && editorMode !== "animate" ? "Compile the current Designer without electrical errors to enable Animate" : "Open animation timeline"} className={`flex h-7 items-center gap-1 rounded px-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-40 ${editorMode === "animate" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover"}`} onClick={() => setEditorMode("animate")}>
            <Play className="h-3.5 w-3.5" /> Animate
          </button>
        </div>

        <div className="h-7 w-px shrink-0 bg-border" />
        {editorMode === "design" ? (
          <>
            <details className="group relative shrink-0">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-card px-2 text-body-sm hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <Settings2 className="h-4 w-4" /> Setup
              </summary>
              <div className="absolute left-0 top-10 z-50 w-72 space-y-3 rounded-lg border border-border-2 bg-card p-3 shadow-xl">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Canvas</div>
                <ToolbarField label="Units">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.rulerUnit} onChange={(event) => patchDesigner({ rulerUnit: event.target.value as DesignerForm["rulerUnit"] })}>
                    <option value="cm">cm</option>
                    <option value="in">inches</option>
                  </select>
                </ToolbarField>
                <div className="flex items-center gap-3">
                  <ToolbarNumber label="W" value={designer.canvasWidthCm} suffix="cm" onChange={(canvasWidthCm) => patchDesigner({ canvasWidthCm })} />
                  <ToolbarNumber label="H" value={designer.canvasHeightCm} suffix="cm" onChange={(canvasHeightCm) => patchDesigner({ canvasHeightCm })} />
                </div>
                <ToolbarNumber label="Snap" value={designer.snapCm} suffix="cm" onChange={(snapCm) => patchDesigner({ snapCm })} />
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">LED layout</div>
                <div className="flex items-center gap-3">
                  <ToolbarNumber label="Pixels/m" value={designer.addressablePixelsPerMeter} onChange={(addressablePixelsPerMeter) => patchDesigner({ addressablePixelsPerMeter, ledDensityPerMeter: addressablePixelsPerMeter })} />
                  <ToolbarNumber label="LEDs/m" value={designer.ledsPerMeter} onChange={(ledsPerMeter) => patchDesigner({ ledsPerMeter })} />
                </div>
              </div>
            </details>
            <Button type="button" variant={designer.rulerVisible ? "default" : "outline"} density="compact" className="px-2" title="Show or hide rulers" aria-pressed={designer.rulerVisible} onClick={() => patchDesigner({ rulerVisible: !designer.rulerVisible })}>
              <Ruler className="h-4 w-4" /><span className="hidden 2xl:inline">Ruler</span>
            </Button>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Fit canvas to view" aria-label="Fit canvas to view" onClick={zoomToFit}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant={layersPanelOpen ? "default" : "outline"} density="compact" className="px-2" title={layersPanelOpen ? "Close Layers panel" : "Open Layers panel"} aria-label="Layers" onClick={() => setLayersPanelOpen((open) => !open)}>
              <Layers className="h-4 w-4" /> <span className="hidden xl:inline">{activeLayer ? ACTIVE_LAYER_LABELS[activeLayer] : "Layers"}</span>
            </Button>
          </>
        ) : (
          <>
            <ToolbarField label="Preview">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={animationDiffuser} onChange={(event) => setAnimationDiffuser(event.target.value as DesignerAnimationDiffuser)}>
                <option value="as_built">As built</option>
                <option value="led_map">LED map</option>
              </select>
            </ToolbarField>
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border-2 bg-card px-2 text-body-sm font-medium text-ink-secondary hover:border-border-strong hover:bg-surface-hover hover:text-foreground" title="Show or hide zone and channel outlines">
              <input
                type="checkbox"
                checked={diffuserSettings.showOutlines}
                onChange={(event) => setDiffuserSettings((current) => ({ ...current, showOutlines: event.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-blue-600"
              />
              <span>Outlines</span>
            </label>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Open fullscreen viewer" onClick={openAnimationViewer}>
              <Maximize2 className="h-4 w-4" /> <span className="hidden xl:inline">Viewer</span>
            </Button>
          </>
        )}

        <div className="ml-auto flex min-w-0 shrink items-center gap-1.5">
          <Badge className={`hidden shrink-0 xl:inline-flex ${compileIsCurrent ? (compileErrors.length ? "border border-destructive/50 bg-destructive/10 text-destructive" : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300") : "border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
            {compileIsCurrent ? (compileErrors.length ? `${compileErrors.length} errors` : `${document.compiledLayout?.pixelMap.length ?? 0} px`) : "Compile required"}
          </Badge>
          {compileIsCurrent && compileIssueCount ? (
            <Button type="button" variant="outline" density="compact" className="px-2" title={`${compileIssueCount} compile issues`} onClick={() => setCompileIssuesOpen(true)}>
              <AlertCircle className="h-4 w-4" /> {compileIssueCount}
            </Button>
          ) : null}
          <span className="hidden max-w-[160px] truncate text-meta text-muted-foreground 2xl:inline" title={fabricationNotice}>{fabricationNotice}</span>
          <ThemeToggle compact />
          <Button type="button" variant="outline" density="compact" className="px-2" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" disabled={!undoHistoryRef.current.length} onClick={undoDesignerChange}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" density="compact" className="px-2" title="Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y)" aria-label="Redo" disabled={!redoHistoryRef.current.length} onClick={redoDesignerChange}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" density="compact" className={`px-2 ${compileIsCurrent ? "text-muted-foreground" : "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950"}`} onClick={compileLayout} disabled={saving || compileIsCurrent} title={compileIsCurrent ? "Layout is compiled and current" : "Compile pending Designer changes"} aria-label={compileIsCurrent ? "Layout compiled" : "Compile pending Designer changes"}>
            <Hammer className="h-4 w-4" /> <span className="hidden xl:inline">{compileIsCurrent ? "Compiled" : "Compile"}</span>
          </Button>
          <Button type="button" variant="outline" density="compact" className={`px-2 ${hasUnsavedChanges ? "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950" : "text-muted-foreground"}`} onClick={() => void save()} disabled={saving || !hasUnsavedChanges} title={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"} aria-label={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"}>
            <Save className="h-4 w-4" /> <span className="hidden xl:inline">{saving ? "Saving" : "Save"}</span>
          </Button>
        </div>
      </header>

      {editorMode === "design" ? <div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-3 whitespace-nowrap">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
        <span className="shrink-0 text-body-sm font-semibold text-foreground">
          {selectedArtwork?.name ?? selectedBuildArea?.name ?? selectedLightSource?.name ?? selectedZone?.name ?? selectedChannel?.name ?? selectedController?.name ?? selectedRoute?.name ?? (editorMode === "design" ? DESIGNER_TOOL_LABELS[tool] : "Animate")}
        </span>
        <div className="h-6 w-px shrink-0 bg-border" />
        {editorMode === "design" && !selection ? <span className="text-body-sm text-muted-foreground">{designerToolInstruction(tool)}{activeLayer ? ` · ${ACTIVE_LAYER_LABELS[activeLayer]} layer` : " · Choose a layer to begin"}</span> : null}
        {editorMode === "design" && selection && selectedObjectLocked ? <Badge className="border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300">Locked · inspect only</Badge> : null}
        <fieldset disabled={editorMode === "design" && selectedObjectLocked} className="contents">
        {editorMode === "design" && selectedArtwork ? (
          <>
            <ToolbarNumber label="X" value={selectedArtwork.x} suffix="cm" onChange={(x) => patchArtwork(selectedArtwork.id, { x })} />
            <ToolbarNumber label="Y" value={selectedArtwork.y} suffix="cm" onChange={(y) => patchArtwork(selectedArtwork.id, { y })} />
            <ToolbarNumber label="W" value={selectedArtwork.width} suffix="cm" onChange={(width) => patchArtwork(selectedArtwork.id, { width })} />
            <ToolbarNumber label="H" value={selectedArtwork.height} suffix="cm" onChange={(height) => patchArtwork(selectedArtwork.id, { height })} />
          </>
        ) : editorMode === "design" && selectedBuildArea ? (
          <>
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedBuildArea.shape} onChange={(event) => patchBuildArea(selectedBuildArea.id, { shape: event.target.value as DesignerBuildAreaForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedBuildAreaPointIndex === "number" && selectedBuildArea.points?.[selectedBuildAreaPointIndex] ? (
              <>
                <Badge>Point {selectedBuildAreaPointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedBuildArea.points[selectedBuildAreaPointIndex].nodeType ?? (selectedBuildArea.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setBuildAreaNodeType(selectedBuildArea.id, selectedBuildAreaPointIndex, nodeType)} />
                </ToolbarField>
                <ToolbarNumber label="PX" value={selectedBuildArea.points[selectedBuildAreaPointIndex].x} suffix="cm" onChange={(x) => updateBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedBuildArea.points[selectedBuildAreaPointIndex].y} suffix="cm" onChange={(y) => updateBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex, { y })} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedBuildArea.points?.length ?? 0) <= 3} onClick={() => deleteBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : (
              <>
                <ToolbarNumber label="X" value={selectedBuildArea.x} suffix="cm" onChange={(x) => patchBuildArea(selectedBuildArea.id, { x })} />
                <ToolbarNumber label="Y" value={selectedBuildArea.y} suffix="cm" onChange={(y) => patchBuildArea(selectedBuildArea.id, { y })} />
                <ToolbarNumber label="W" value={selectedBuildArea.width} suffix="cm" onChange={(width) => patchBuildArea(selectedBuildArea.id, { width })} />
                <ToolbarNumber label="H" value={selectedBuildArea.height} suffix="cm" onChange={(height) => patchBuildArea(selectedBuildArea.id, { height })} />
              </>
            )}
          </>
        ) : editorMode === "design" && selectedLightSource ? (
          <>
            <Badge>{selectedLightSource.mode === "front" ? "Front Source" : selectedLightSource.mode === "halo" ? "Halo Source" : "Wall Wash Source"}</Badge>
            <Button type="button" variant="outline" density="compact" onClick={() => setLightingEditorOpen(true)}>
              <Sparkles className="h-4 w-4" /> Configure source
            </Button>
          </>
        ) : editorMode === "design" && selectedZone ? (
          <>
            <LightingSetupIndicators treatments={selectedOpticalTreatments} />
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedZone.shape} onChange={(event) => patchZone(selectedZone.id, { shape: event.target.value as DesignerZoneForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedZonePointIndex === "number" && selectedZone.points?.[selectedZonePointIndex] ? (
              <>
                <Badge>Point {selectedZonePointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedZone.points[selectedZonePointIndex].nodeType ?? (selectedZone.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setZoneNodeType(selectedZone.id, selectedZonePointIndex, nodeType)} />
                </ToolbarField>
                <ToolbarNumber label="PX" value={selectedZone.points[selectedZonePointIndex].x} suffix="cm" onChange={(x) => updateZonePoint(selectedZone.id, selectedZonePointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedZone.points[selectedZonePointIndex].y} suffix="cm" onChange={(y) => updateZonePoint(selectedZone.id, selectedZonePointIndex, { y })} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedZone.points?.length ?? 0) <= 3} onClick={() => deleteZonePoint(selectedZone.id, selectedZonePointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : (
              <>
                <ToolbarNumber label="X" value={selectedZone.x} onChange={(x) => patchZone(selectedZone.id, { x })} />
                <ToolbarNumber label="Y" value={selectedZone.y} onChange={(y) => patchZone(selectedZone.id, { y })} />
                <ToolbarNumber label="W" value={selectedZone.width} onChange={(width) => patchZone(selectedZone.id, { width })} />
                <ToolbarNumber label="H" value={selectedZone.height} onChange={(height) => patchZone(selectedZone.id, { height })} />
              </>
            )}
          </>
        ) : editorMode === "design" && selectedChannel ? (
          <>
            <LightingSetupIndicators treatments={selectedOpticalTreatments} />
            <ToolbarNumber label="Width" value={selectedChannel.widthMm} suffix="mm" onChange={(widthMm) => patchChannel(selectedChannel.id, { widthMm: Math.max(3, Math.min(20, Math.round(widthMm))) })} />
            <ToolbarField label="Path">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedChannel.closed ? "closed" : "open"} onChange={(event) => patchChannel(selectedChannel.id, { closed: event.target.value === "closed" })}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </ToolbarField>
            <ToolbarField label="Ends">
              <select disabled={selectedChannel.closed} className="h-8 rounded-md border border-input bg-card px-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-50" value={selectedChannel.cap} onChange={(event) => patchChannel(selectedChannel.id, { cap: event.target.value as DesignerChannelForm["cap"] })}>
                <option value="butt">Straight</option>
                <option value="round">Round</option>
              </select>
            </ToolbarField>
            {typeof selectedChannelPointIndex === "number" && selectedChannel.points[selectedChannelPointIndex] ? (
              <>
                <Badge>Point {selectedChannelPointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedChannel.points[selectedChannelPointIndex].nodeType ?? (selectedChannel.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setChannelNodeType(selectedChannel.id, selectedChannelPointIndex, nodeType)} />
                </ToolbarField>
                <ToolbarNumber label="PX" value={selectedChannel.points[selectedChannelPointIndex].x} suffix="cm" onChange={(x) => updateChannelPoint(selectedChannel.id, selectedChannelPointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedChannel.points[selectedChannelPointIndex].y} suffix="cm" onChange={(y) => updateChannelPoint(selectedChannel.id, selectedChannelPointIndex, { y })} />
                <ToolbarNumber label="Fillet" value={selectedChannel.points[selectedChannelPointIndex].radiusMm ?? 0} suffix="mm" onChange={(radiusMm) => setChannelNodeRadius(selectedChannel.id, selectedChannelPointIndex, radiusMm)} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedChannel.points?.length ?? 0) <= 2} onClick={() => deleteChannelPoint(selectedChannel.id, selectedChannelPointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedController ? (
          <>
            <ToolbarNumber label="X" value={selectedController.x} onChange={(x) => patchController({ x })} />
            <ToolbarNumber label="Y" value={selectedController.y} onChange={(y) => patchController({ y })} />
            <ToolbarNumber label="Ports" value={selectedController.dataOutputs} onChange={(dataOutputs) => patchController({ dataOutputs: Math.max(1, Math.round(dataOutputs)) })} />
          </>
        ) : editorMode === "design" && selectedRoute ? (
          <>
            <ToolbarField label="Type">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedRoute.kind} onChange={(event) => patchRoute(selectedRoute.id, { kind: event.target.value as DesignerRouteKind })}>
                <option value="led_string">LED string</option>
                <option value="data_cable">Data cable</option>
              </select>
            </ToolbarField>
          </>
        ) : null}
        </fieldset>
        {editorMode === "design" && (canCopySelection || clipboard || canDeleteSelection) ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            {canCopySelection ? (
              <Button type="button" variant="outline" density="compact" title="Copy selected object (Ctrl/Cmd+C)" className="px-2" onClick={copySelection}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            ) : null}
            {clipboard ? (
              <Button type="button" variant="outline" density="compact" title="Paste copied object (Ctrl/Cmd+V)" className="px-2" onClick={pasteSelection}>
                Paste
              </Button>
            ) : null}
            {canDeleteSelection ? (
              <Button type="button" variant="outline" density="compact" title="Delete selected object" className="px-2 text-destructive hover:text-destructive" onClick={deleteSelection}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
          </>
        ) : null}
          </div>
        </div>
      </div> : null}
      <div className={`grid min-h-0 flex-1 ${editorMode === "animate" ? "grid-cols-[minmax(0,1fr)_380px]" : layersPanelOpen ? "grid-cols-[56px_minmax(0,1fr)_320px]" : "grid-cols-[56px_minmax(0,1fr)]"}`}>
        {editorMode === "design" ? <aside className="flex min-h-0 flex-col border-r border-border-2 bg-card py-2">
          <div className="flex shrink-0 flex-col items-center gap-2 px-2">
          <ToolButton active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
            <ToolButton active={tool === "pan"} label="Pan" icon={Hand} onClick={() => setTool("pan")} />
          <ToolButton active={tool === "measure"} label="Measure distance" icon={MeasuringTapeIcon} onClick={() => setTool("measure")} />
          </div>
          <div className="mx-3 my-2 h-px shrink-0 bg-border" />
          {editorMode === "design" ? <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2">
          {activeLayer === "artwork" ? (
            <>
              <ToolButton
                active={tool === "image_place"}
                label="Image (place a container, then pick its image in the panel)"
                icon={ImageIcon}
                disabled={designer.layers.artwork.locked}
                onClick={() => {
                  ensureLayerVisible("artwork");
                  setTool("image_place");
                }}
              />
            </>
          ) : null}
          {activeLayer === "artwork" || activeLayer === "reference" ? (
            <>
              <ToolButton active={tool === "build_area_rect"} label="Rectangle Build Area (drag on canvas)" icon={Square} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_rect"); }} />
              <ToolButton active={tool === "build_area_ellipse"} label="Ellipse Build Area (drag on canvas)" icon={Circle} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_ellipse"); }} />
              <ToolButton active={tool === "build_area_polygon"} label="Polygon Build Area" icon={PenLine} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_polygon"); }} />
              <ToolButton active={tool === "build_area_bezier"} label="Bezier Build Area" icon={Spline} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_bezier"); }} />
            </>
          ) : null}
          {activeLayer === "zones" ? (
            <>
              <ToolButton active={tool === "zone_rect"} label="Rectangle Zone (drag on canvas)" icon={Square} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_rect")} />
              <ToolButton active={tool === "zone_ellipse"} label="Ellipse Zone (drag on canvas)" icon={Circle} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_ellipse")} />
              <ToolButton active={tool === "zone_polygon"} label="Polygon Zone" icon={PenLine} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_polygon")} />
              <ToolButton active={tool === "zone_bezier"} label="Bezier Zone" icon={Spline} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_bezier")} />
              <ToolButton active={tool === "channel_bezier"} label="Channel (neon flex trace)" icon={Waves} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("channel_bezier")} />
            </>
          ) : null}
          {activeLayer === "strings" ? (
            <>
              <ToolButton active={tool === "led_string"} label="LED string" icon={Route} tone="amber" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("led_string")} />
              <ToolButton active={tool === "data_cable"} label="Data cable" icon={Cable} tone="green" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("data_cable")} />
              <ToolButton
                active={tool === "cut"}
                label={typeof selectedRoutePointIndex === "number" && selectedRoute?.points[selectedRoutePointIndex]?.joint ? "Detach solder joint" : "Cut route"}
                icon={Scissors}
                disabled={designer.layers.strings.locked || !designer.layers.strings.visible}
                onClick={() => {
                  if (typeof selectedRoutePointIndex === "number" && selectedRoute?.points[selectedRoutePointIndex]?.joint) {
                    detachSelectedRoutePoint();
                    return;
                  }
                  setTool("cut");
                }}
              />
            </>
          ) : null}
          </div> : <div className="min-h-0 flex-1" />}
        </aside> : null}

        <main className={`min-w-0 overflow-hidden bg-muted ${editorMode === "animate" ? "p-0" : "p-2"}`}>
          {editorMode === "design" ? <DesignerStudioCanvas
            designer={designer}
            activeLayer={activeLayer}
            tool={tool}
            onToolChange={setTool}
            viewport={activeViewport}
            artworkUrls={artworkUrls}
            selectedArtworkId={selectedArtwork?.id}
            selectedBuildAreaId={selectedBuildArea?.id}
            selectedBuildAreaPointIndex={selectedBuildAreaPointIndex}
            selectedZoneId={selectedZone?.id}
            selectedZonePointIndex={selectedZonePointIndex}
            selectedChannelId={selectedChannel?.id}
            selectedChannelPointIndex={selectedChannelPointIndex}
            selectedRouteId={selectedRoute?.id}
            selectedRoutePointIndex={selectedRoutePointIndex}
            selectedController={Boolean(selectedController)}
            onViewportChange={setViewport}
            onChange={updateDesigner}
            onSelect={selectDesignerItem}
            onInsertBuildAreaPoint={insertBuildAreaPoint}
            onInsertZonePoint={insertZonePoint}
            onInsertChannelPoint={insertChannelPoint}
            onInsertRoutePoint={insertRoutePoint}
            onPlaceImage={placeImageAt}
            onCutRoutePoint={handleCutRoutePoint}
            onRoutePointDragEnd={autoSolderRoutePoint}
            onSolderedTerminalsDragEnd={moveSolderedTerminals}
          /> : document.compiledLayout ? <DesignerWebglPlayer
            designer={designer}
            viewport={activeViewport}
            selectedZoneId={selectedZone?.id}
            selectedChannelId={selectedChannel?.id}
            selectedZoneIds={selectedOpticalTargets.filter((target) => target.type === "zone").map((target) => target.id)}
            selectedChannelIds={selectedOpticalTargets.filter((target) => target.type === "channel").map((target) => target.id)}
            onViewportChange={setViewport}
            onSelect={selectDesignerItem}
            layout={document.compiledLayout}
            animationPixels={animationPixels}
            animationDiffuser={animationDiffuser}
            diffuserSettings={diffuserSettings}
          /> : null}
        </main>
        {editorMode === "animate" ? (
          <aside className="flex min-h-0 flex-col border-l border-border-2 bg-surface">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{selectedOpticalTargets.length > 1 ? `Calibration · ${selectedOpticalTargets.length} targets` : selectedOpticalTarget ? `Calibration · ${selectedZone?.name ?? selectedChannel?.name}` : "Lighting calibration"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{selectedOpticalTarget ? (selectedOpticalTargets.length > 1 ? "Shared calibration · mixed values remain unchanged" : "Tune existing sources · construction stays in Design") : "Select a zone or channel"}</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedOpticalTargets.length > 1 ? <MultiLightingMountsEditor
                  entries={selectedOpticalTargetEntries}
                  designer={designer}
                  calibrationOnly
                  onSetMode={setSelectedOpticalMode}
                  onPatchMode={patchSelectedOpticalMode}
                /> : selectedOpticalTarget ? <LightingMountsEditor
                  treatments={selectedOpticalTreatments}
                  designer={designer}
                  compact
                  calibrationOnly
                  onAdd={addOpticalTreatment}
                  onChange={patchOpticalTreatment}
                  onRemove={removeOpticalTreatment}
                /> : <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Select a zone or channel to calibrate its existing light sources.</div>}
            </div>
          </aside>
        ) : null}
        {editorMode === "design" && layersPanelOpen ? (
          <DesignerLayersPanel
            designer={designer}
            activeLayer={activeLayer}
            selection={selection}
            routeSummaries={routeSummaries}
            routeOutputs={routeOutputs}
            onActivateLayer={activateDesignerLayer}
            onPatchLayer={patchDesignerLayer}
            assets={projectAssets}
            onUploadArtwork={uploadArtwork}
            onPatchArtwork={patchArtwork}
            onPatchBuildArea={patchBuildAreaVisual}
            onPatchZone={patchZoneVisual}
            onAddGroup={addGroup}
            onPatchGroup={patchGroup}
            onRemoveGroup={removeGroup}
            onToggleGroupMember={toggleGroupMember}
            onSelectZone={selectGroupZone}
            onOpenLighting={openLightingSetup}
            onPatchChannel={patchChannel}
            onPatchController={patchController}
            onPatchRoute={patchRoute}
            onReorderItems={reorderDesignerItems}
            onSelect={selectDesignerItem}
            onClose={() => setLayersPanelOpen(false)}
          />
        ) : null}
      </div>
      {editorMode === "animate" ? (
        <>
          <div className="h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface-2 hover:bg-blue-200" title="Drag to resize · double-click to collapse or expand" onPointerDown={beginAnimationTimelineResize} onDoubleClick={() => setAnimationTimelineCollapsed((current) => !current)} />
          <DesignerAnimateTimeline
            document={document}
            effects={effectCatalog}
            selectedTargetId={selectedAnimationTargetId}
            previewTimeMs={animationResult?.preview?.timeMs ?? document.previewTimeMs}
            height={animationTimelineCollapsed ? 40 : animationTimelineHeight}
            collapsed={animationTimelineCollapsed}
            onToggleCollapsed={() => setAnimationTimelineCollapsed((current) => !current)}
            onChange={updateAnimationDocument}
            onPreview={() => void previewAnimation()}
            onPreviewTimeChange={(timeMs) => void previewAnimationAt(timeMs)}
            previewing={animationGenerating}
            playing={animationPlaying}
            hasPreview={Boolean(animationResult?.ok && animationResult.partitura)}
            onClipTargetSelect={(targetId) => {
              selectDesignerItem(targetId ? designerSelectionForClipTarget(designer, targetId) : null);
            }}
            onTogglePlayback={() => {
              if (!animationResult?.ok) void previewAnimation();
              else setAnimationPlaying((current) => !current);
            }}
          />
        </>
      ) : null}
      <PlayerModal
        open={animationPlayerOpen}
        onClose={() => setAnimationPlayerOpen(false)}
        document={document}
        result={animationResult}
        generating={animationGenerating}
        onGenerate={() => void previewAnimation()}
        onResult={setAnimationResult}
      />
      <Modal
        open={editorMode === "design" && lightingEditorOpen && Boolean(selectedOpticalTarget)}
        title={`Lighting · ${selectedZone?.name ?? selectedChannel?.name ?? "Selection"}`}
        description="Physical light mounts belong to this zone/channel. Clips only provide color and animation."
        onClose={() => setLightingEditorOpen(false)}
        className="max-w-4xl"
      >
        <LightingMountsEditor
          treatments={selectedOpticalTreatments}
          designer={designer}
          onAdd={addOpticalTreatment}
          onChange={patchOpticalTreatment}
          onRemove={removeOpticalTreatment}
        />
      </Modal>
      <Modal
        open={compileIssuesOpen}
        title="Designer Compile Issues"
        description="Electrical errors block Animate. Warnings are informational and do not block playback."
        onClose={() => setCompileIssuesOpen(false)}
      >
        <div className="space-y-4">
          {compileErrors.length ? (
            <Alert title="Errors" variant="error">
              <ul className="list-disc space-y-1 pl-5">
                {compileErrors.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {compileWarnings.length ? (
            <Alert title="Warnings" variant="warning">
              <ul className="list-disc space-y-1 pl-5">
                {compileWarnings.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {!compileIssueCount ? (
            <Alert title="No issues" variant="success">
              The current compiled layout has no reported errors or warnings.
            </Alert>
          ) : null}
        </div>
      </Modal>
      {animationViewerOpen && document.compiledLayout ? (
        <AnimationFullscreenViewer
          title={partitura.name}
          document={document}
          designer={designer}
          layout={document.compiledLayout}
          viewport={animationViewerViewport ?? fitViewportToDesigner(designer)}
          selectedZoneId={selectedZone?.id}
          animationPixels={animationPixels}
          animationDiffuser={animationDiffuser}
          diffuserSettings={diffuserSettings}
          playing={animationPlaying}
          previewing={animationGenerating}
          hasPreview={Boolean(animationResult?.ok && animationResult.partitura)}
          onViewportChange={setAnimationViewerViewport}
          onSelect={selectDesignerItem}
          onReturn={() => setAnimationViewerOpen(false)}
          onPlayPause={() => {
            if (!animationResult?.ok) void previewAnimation();
            else setAnimationPlaying((current) => !current);
          }}
          onStop={stopAnimationViewer}
        />
      ) : null}
    </div>
  );
}

export function PartituraWorkspace({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const searchParams = useSearchParams();
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState<PartituraDocument>(() => normalizeDefaultSignLayout(initialPartitura.document));
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") === "scenes" ? "scenes" : "overview");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);

  const activeScene = useMemo(
    () => document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0],
    [document.activeSceneId, document.scenes]
  );
  const clipCount = document.scenes.reduce((total, scene) => total + scene.clips.length, 0);
  const ledCount = document.compiledLayout?.pixelMap.length ?? 0;

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
    const normalizedDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(nextDocument));
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
    const normalizedDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(document));
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
            Partitura workspace for scenes and firmware-facing simulator validation.
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
        <Metric label="Mapped pixels" value={document.compiledLayout?.pixelMap.length ?? 0} />
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
  const sceneTargets = buildSceneTargets(document);
  const targetOptions = sceneTargets.map((target) => [target.id, `${target.name} · ${target.detail}`] as const);
  const targetSummaries = Object.fromEntries(sceneTargets.map((target) => [target.id, target]));
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
    const clips = activeScene?.clips ?? [];
    const layer = activeScene ? nextEmptyClipLayer(activeScene) : 0;
    const identity = createClipIdentity(clips);
    const clip: ClipForm = {
      id: identity.id,
      name: identity.name,
      enabled: true,
      target: sceneTargets[0]?.id ?? "full_sign",
      coordinateSpace: "local",
      effect: "solid",
      blend: "max",
      startMs: 0,
      durationMs: activeScene?.durationMs ?? 4000,
      layer,
      params: defaultParamsForEffect(effectCatalog, "solid", document.accentColor)
    };
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => (scene.id === document.activeSceneId ? { ...scene, laneCount: Math.max(scene.laneCount ?? 1, layer + 1), clips: [...scene.clips, clip] } : scene))
    });
    setSelectedClipIndex(clips.length);
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
                const target = targetSummaries[clip.target];
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
                      <MapRow label="Target" value={target?.name ?? clip.target} />
                      <MapRow label="Map" value={target?.detail ?? "Missing Designer target"} />
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

function buildSceneTargets(document: PartituraDocument) {
  const layout = document.compiledLayout;
  const sourceTargets = document.designer?.lightSources ?? [];
  const zoneTargets = document.designer?.zones ?? [];
  const groupTargets = document.designer?.groups ?? [];
  const channelTargets = document.designer?.channels ?? [];
  const mappedZones = new Map(layout?.zones.map((zone) => [zone.id, zone.pixelIds.length]) ?? []);

  return [
    { id: "full_sign", name: "Full sign", detail: `${layout?.pixelMap.length ?? 0} mapped pixels` },
    ...sourceTargets.map((source) => ({ id: source.id, name: source.name || source.id, detail: `${source.mode === "front" ? "Front" : source.mode === "halo" ? "Halo" : "Wall Wash"} · ${mappedZones.get(source.id) ?? 0} mapped pixels` })),
    ...zoneTargets.map((zone) => ({ id: zone.id, name: zone.name || zone.id, detail: `${mappedZones.get(zone.id) ?? 0} mapped pixels` })),
    ...channelTargets.map((channel) => ({ id: channel.id, name: channel.name || channel.id, detail: `Channel · ${mappedZones.get(channel.id) ?? 0} mapped pixels` })),
    ...groupTargets.map((group) => ({ id: group.id, name: group.name || group.id, detail: `Group · ${group.members.length} member${group.members.length === 1 ? "" : "s"}` }))
  ];
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

function AnimationFullscreenViewer({
  title,
  document,
  designer,
  layout,
  viewport,
  selectedZoneId,
  animationPixels,
  animationDiffuser,
  diffuserSettings,
  playing,
  previewing,
  hasPreview,
  onViewportChange,
  onSelect,
  onReturn,
  onPlayPause,
  onStop
}: {
  title: string;
  document: PartituraDocument;
  designer: DesignerForm;
  layout: NonNullable<PartituraDocument["compiledLayout"]>;
  viewport: DesignerViewport;
  selectedZoneId?: string;
  animationPixels: DesignerAnimationPixel[];
  animationDiffuser: DesignerAnimationDiffuser;
  diffuserSettings: DiffuserRenderSettings;
  playing: boolean;
  previewing: boolean;
  hasPreview: boolean;
  onViewportChange: (viewport: DesignerViewport) => void;
  onSelect: (selection: DesignerSelection) => void;
  onReturn: () => void;
  onPlayPause: () => void;
  onStop: () => void;
}) {
  const activeScene = document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-2 bg-card px-4">
        <Button type="button" variant="outline" className="h-9" onClick={onReturn}>
          <ArrowLeft className="h-4 w-4" />
          Return
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-sm font-semibold">{title}</div>
          <div className="truncate font-mono text-[10px] uppercase text-muted-foreground">{activeScene?.name ?? document.activeSceneId}</div>
        </div>
        <Badge>{layout.pixelMap.length} px</Badge>
        <Button type="button" className="h-9" disabled={previewing} onClick={onPlayPause}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {previewing ? "Rendering" : playing ? "Pause" : "Play"}
        </Button>
        <Button type="button" variant="outline" className="h-9" disabled={!hasPreview} onClick={onStop}>
          <RotateCcw className="h-4 w-4" />
          Stop
        </Button>
      </header>
      <main className="min-h-0 flex-1 bg-muted p-3">
        <DesignerWebglPlayer
          designer={designer}
          layout={layout}
          viewport={viewport}
          selectedZoneId={selectedZoneId}
          animationPixels={animationPixels}
          animationDiffuser={animationDiffuser}
          diffuserSettings={diffuserSettings}
          onViewportChange={onViewportChange}
          onSelect={onSelect}
        />
      </main>
    </div>
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

function MultiLightingMountsEditor({ entries, designer, calibrationOnly = false, onSetMode, onPatchMode }: {
  entries: Array<OpticalTargetRef & { name: string; treatments: DesignerOpticalTreatment[] }>;
  designer: DesignerForm;
  calibrationOnly?: boolean;
  onSetMode: (mode: DesignerOpticalMode, enabled: boolean) => void;
  onPatchMode: (mode: DesignerOpticalMode, patch: Partial<DesignerOpticalTreatment>) => void;
}) {
  const modes: Array<{ mode: DesignerOpticalMode; label: string }> = [
    { mode: "front", label: "Front" },
    { mode: "halo", label: "Halo-Lit" },
    { mode: "wall_wash", label: "Wall Washer" }
  ];
  const routeNames = new Map(designer.routes.map((route) => [route.id, route.name]));
  return (
    <div className="space-y-4">
      {!calibrationOnly ? <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Lighting modes</legend>
        <div className="grid gap-2">
          {modes.map(({ mode, label }) => {
            const enabledCount = entries.filter((entry) => entry.treatments.some((source) => source.mode === mode && source.enabled)).length;
            const allEnabled = enabledCount === entries.length;
            const mixed = enabledCount > 0 && !allEnabled;
            return (
              <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${enabledCount ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-surface-2"}`}>
                <input
                  type="checkbox"
                  ref={(input) => { if (input) input.indeterminate = mixed; }}
                  checked={allEnabled}
                  onChange={(event) => onSetMode(mode, event.target.checked)}
                />
                <span className="font-medium">{label}</span>
                <span className="ml-auto text-[11px]">{mixed ? `${enabledCount}/${entries.length}` : allEnabled ? "Enabled" : "Off"}</span>
              </label>
            );
          })}
        </div>
      </fieldset> : null}
      {modes.map(({ mode, label }) => {
        const sources = entries.flatMap((entry) => entry.treatments.filter((source) => source.mode === mode && source.enabled));
        if (!sources.length) return null;
        const assignedStrings = Array.from(new Set(sources.flatMap((source) => source.stringIds)));
        const materials = sources.map((source) => source.material);
        const material = commonValue(materials);
        return (
          <section key={mode} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{label}</div>
              <Badge>{sources.length === entries.length ? `${entries.length} zones` : `${sources.length}/${entries.length} zones`}</Badge>
            </div>
            {!calibrationOnly ? <div className="space-y-1 text-xs text-muted-foreground">
              <div className="font-medium">Assigned strings</div>
              <div>{assignedStrings.length ? assignedStrings.map((id) => routeNames.get(id) ?? id).join(", ") : "No strings assigned"}</div>
            </div> : null}
            {mode === "front" ? (
              <>
                {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Material
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={material.mixed ? "" : material.value} onChange={(event) => {
                    if (!event.target.value) return;
                    const nextMaterial = event.target.value as DesignerOpticalTreatment["material"];
                    onPatchMode(mode, nextMaterial === "silicone"
                      ? { material: nextMaterial, sourceDistanceCm: 0.5, transmissionPct: 55, beamAngleDeg: 115, softnessCm: 0 }
                      : { material: nextMaterial });
                  }}>
                    {material.mixed ? <option value="">Mixed</option> : null}
                    <option value="none">LED Pixels</option>
                    <option value="silicone">Silicone Strip</option>
                    <option value="milky_white">Milky White</option>
                    <option value="day_night">Day/Night</option>
                  </select>
                </label> : null}
                <MixedDiffuserSlider label="Distance to diffusor" values={sources.map((source) => source.sourceDistanceCm)} min={0.5} max={30} step={0.5} suffix="cm" onChange={(sourceDistanceCm) => onPatchMode(mode, { sourceDistanceCm })} />
                <MixedDiffuserSlider label="Intensity" values={sources.map((source) => source.intensity)} min={0.1} max={3} step={0.05} onChange={(intensity) => onPatchMode(mode, { intensity })} />
                <MixedDiffuserSlider label="Softness" values={sources.map((source) => source.softnessCm)} min={0} max={10} step={0.25} suffix="cm" onChange={(softnessCm) => onPatchMode(mode, { softnessCm })} />
                {!material.mixed && material.value === "silicone" ? <>
                  <MixedDiffuserSlider label="Transmission" values={sources.map((source) => source.transmissionPct)} min={35} max={90} step={1} suffix="%" onChange={(transmissionPct) => onPatchMode(mode, { transmissionPct })} />
                  <MixedDiffuserSlider label="Beam" values={sources.map((source) => source.beamAngleDeg)} min={90} max={180} step={5} suffix="°" onChange={(beamAngleDeg) => onPatchMode(mode, { beamAngleDeg })} />
                </> : null}
              </>
            ) : (
              <>
                <MixedDiffuserSlider label="Intensity" values={sources.map((source) => source.intensity)} min={0.05} max={3} step={0.01} onChange={(intensity) => onPatchMode(mode, { intensity })} />
                <MixedDiffuserSlider label="Spread" values={sources.map((source) => source.spreadCm)} min={0} max={30} step={0.1} suffix="cm" onChange={(spreadCm) => onPatchMode(mode, { spreadCm })} />
                <MixedDiffuserSlider label="Softness" values={sources.map((source) => source.softnessCm)} min={0} max={20} step={0.1} suffix="cm" onChange={(softnessCm) => onPatchMode(mode, { softnessCm })} />
                {mode === "halo" ? <>
                  <MixedDiffuserSlider label="Wall gap" values={sources.map((source) => source.sourceDistanceCm)} min={0} max={30} step={0.1} suffix="cm" onChange={(sourceDistanceCm) => onPatchMode(mode, { sourceDistanceCm })} />
                  <MixedColorField label="Face color" values={sources.map((source) => source.faceColor)} onChange={(faceColor) => onPatchMode(mode, { faceColor })} />
                </> : null}
                {mode === "wall_wash" ? <>
                  <MixedDiffuserSlider label="Direction" values={sources.map((source) => source.directionDeg)} min={-180} max={180} step={5} suffix="°" onChange={(directionDeg) => onPatchMode(mode, { directionDeg })} />
                  <MixedDiffuserSlider label="Throw" values={sources.map((source) => source.throwCm)} min={1} max={120} step={1} suffix="cm" onChange={(throwCm) => onPatchMode(mode, { throwCm })} />
                  <MixedDiffuserSlider label="Beam" values={sources.map((source) => source.beamAngleDeg)} min={5} max={150} step={5} suffix="°" onChange={(beamAngleDeg) => onPatchMode(mode, { beamAngleDeg })} />
                  <MixedDiffuserSlider label="Falloff" values={sources.map((source) => source.falloff)} min={0.25} max={4} step={0.05} onChange={(falloff) => onPatchMode(mode, { falloff })} />
                </> : null}
                {!calibrationOnly ? <MixedReceiverField values={sources} designer={designer} onChange={(patch) => onPatchMode(mode, patch)} /> : null}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function commonValue<T>(values: T[]) {
  const value = values[0];
  return { value, mixed: values.some((entry) => entry !== value) };
}

function MixedDiffuserSlider({ label, values, min, max, step, suffix = "", onChange }: {
  label: string; values: number[]; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void;
}) {
  const current = commonValue(values);
  return <DiffuserSlider label={`${label}${current.mixed ? " · Mixed" : ""}`} value={current.value ?? min} min={min} max={max} step={step} suffix={suffix} onChange={onChange} />;
}

function MixedColorField({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string) => void }) {
  const current = commonValue(values);
  return <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{label}{current.mixed ? " · Mixed" : ""}<input type="color" value={current.value ?? "#000000"} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MixedReceiverField({ values, designer, onChange }: { values: DesignerOpticalTreatment[]; designer: DesignerForm; onChange: (patch: Partial<DesignerOpticalTreatment>) => void }) {
  const receivers = values.map((source) => source.receiverType === "canvas" ? "canvas" : `${source.receiverType}:${source.receiverId ?? ""}`);
  const receiver = commonValue(receivers);
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      Receiver{receiver.mixed ? " · Mixed" : ""}
      <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={receiver.mixed ? "" : receiver.value} onChange={(event) => {
        if (!event.target.value) return;
        const [receiverType, receiverId] = event.target.value.split(":");
        onChange({ receiverType: receiverType as DesignerOpticalTreatment["receiverType"], receiverId: receiverId || undefined });
      }}>
        {receiver.mixed ? <option value="">Mixed</option> : null}
        <option value="canvas">Canvas</option>
        {designer.buildAreas.map((area) => <option key={area.id} value={`build_area:${area.id}`}>Area: {area.name}</option>)}
        {designer.zones.map((zone) => <option key={zone.id} value={`zone:${zone.id}`}>Zone: {zone.name}</option>)}
      </select>
    </label>
  );
}

function LightingMountsEditor({ treatments, designer, compact = false, calibrationOnly = false, onAdd, onChange, onRemove }: {
  treatments: DesignerOpticalTreatment[];
  designer: DesignerForm;
  compact?: boolean;
  calibrationOnly?: boolean;
  onAdd: (mode: DesignerOpticalMode) => void;
  onChange: (id: string, patch: Partial<DesignerOpticalTreatment>) => void;
  onRemove: (id: string) => void;
}) {
  const modes: Array<{ mode: DesignerOpticalMode; label: string }> = [
    { mode: "front", label: "Front" },
    { mode: "halo", label: "Halo-Lit" },
    { mode: "wall_wash", label: "Wall Washer" }
  ];
  const enabledTreatments = treatments.filter((treatment) => treatment.enabled);
  return (
    <div className="space-y-4">
      {!calibrationOnly ? <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Lighting modes</legend>
        <div className="grid gap-2">
        {modes.map(({ mode, label }) => {
          const treatment = treatments.find((entry) => entry.mode === mode);
          const checked = treatment?.enabled === true;
          return (
            <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-surface-2"}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (treatment) onChange(treatment.id, { enabled: event.target.checked });
                  else if (event.target.checked) onAdd(mode);
                }}
              />
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-[11px]">{checked ? "Enabled" : "Off"}</span>
            </label>
          );
        })}
        </div>
      </fieldset> : null}
      {!enabledTreatments.length ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{calibrationOnly ? "No light sources are configured for this target. Add them in Design." : "Enable a lighting mode to configure it."}</div> : null}
      {enabledTreatments.map((treatment) => {
        const receiverValue = treatment.receiverType === "canvas" ? "canvas" : `${treatment.receiverType}:${treatment.receiverId ?? ""}`;
        const title = treatment.mode === "front" ? "Front" : treatment.mode === "halo" ? "Halo-Lit" : "Wall Washer";
        return (
          <section key={treatment.id} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{title}</div>
              {!calibrationOnly ? <Button type="button" variant="ghost" className="h-8 text-xs" onClick={() => onRemove(treatment.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button> : null}
            </div>
            {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Source name
              <input className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={treatment.name} onChange={(event) => onChange(treatment.id, { name: event.target.value })} />
            </label> : null}
            {!calibrationOnly ? <div className="grid gap-2 text-xs font-medium text-muted-foreground">
              <span>LED strings</span>
              {designer.routes.filter((route) => route.kind === "led_string").length ? designer.routes.filter((route) => route.kind === "led_string").map((route) => (
                <label key={route.id} className="flex items-center gap-2 rounded border border-border-2 bg-surface-2 px-2 py-1.5 font-normal text-foreground">
                  <input
                    type="checkbox"
                    checked={treatment.stringIds.includes(route.id)}
                    onChange={(event) => onChange(treatment.id, {
                      stringIds: event.target.checked
                        ? Array.from(new Set([...treatment.stringIds, route.id]))
                        : treatment.stringIds.filter((id) => id !== route.id)
                    })}
                  />
                  {route.name}
                </label>
              )) : <span className="font-normal">No LED strings available.</span>}
            </div> : null}
            {treatment.mode === "front" ? (
              <>
                {!calibrationOnly ? <label className="grid max-w-sm gap-1.5 text-xs font-medium text-muted-foreground">
                  Material
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={treatment.material} onChange={(event) => {
                    const material = event.target.value as DesignerOpticalTreatment["material"];
                    onChange(treatment.id, material === "silicone"
                      ? { material, sourceDistanceCm: 0.5, transmissionPct: 55, beamAngleDeg: 115, softnessCm: 0 }
                      : { material });
                  }}>
                    <option value="none">LED Pixels</option>
                    <option value="silicone">Silicone Strip</option>
                    <option value="milky_white">Milky White</option>
                    <option value="day_night">Day/Night</option>
                  </select>
                </label> : null}
                <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
                  <DiffuserSlider label="Intensity" value={treatment.intensity} min={0.1} max={3} step={0.05} onChange={(intensity) => onChange(treatment.id, { intensity })} />
                  {treatment.material !== "none" ? <>
                    <DiffuserSlider label="Distance to diffusor" value={treatment.sourceDistanceCm} min={0.5} max={treatment.material === "silicone" ? 3 : 30} step={0.5} suffix="cm" onChange={(sourceDistanceCm) => onChange(treatment.id, { sourceDistanceCm })} />
                    {treatment.material === "silicone" ? (
                      <>
                        <DiffuserSlider label="Transmission" value={treatment.transmissionPct} min={35} max={90} step={1} suffix="%" onChange={(transmissionPct) => onChange(treatment.id, { transmissionPct })} />
                        <DiffuserSlider label="Beam" value={treatment.beamAngleDeg} min={90} max={180} step={5} suffix="°" onChange={(beamAngleDeg) => onChange(treatment.id, { beamAngleDeg })} />
                      </>
                    ) : <DiffuserSlider label="Softness" value={treatment.softnessCm} min={0} max={10} step={0.25} suffix="cm" onChange={(softnessCm) => onChange(treatment.id, { softnessCm })} />}
                  </> : null}
                </div>
                {treatment.material === "none" ? <p className="text-xs text-muted-foreground">Individual addressable pixels remain visible.</p> : null}
              </>
            ) : (
              <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
                <DiffuserSlider label="Intensity" value={treatment.intensity} min={0.05} center={treatment.mode === "halo" ? 0.3 : undefined} max={3} step={0.01} onChange={(intensity) => onChange(treatment.id, { intensity })} />
                <DiffuserSlider label="Spread" value={treatment.spreadCm} min={0} center={treatment.mode === "halo" ? 3 : undefined} max={30} step={0.1} suffix="cm" onChange={(spreadCm) => onChange(treatment.id, { spreadCm })} />
                <DiffuserSlider label="Softness" value={treatment.softnessCm} min={0} center={treatment.mode === "halo" ? 0.5 : undefined} max={20} step={0.1} suffix="cm" onChange={(softnessCm) => onChange(treatment.id, { softnessCm })} />
                {treatment.mode === "halo" ? <DiffuserSlider label="Wall gap" value={treatment.sourceDistanceCm} min={0} center={0.5} max={30} step={0.1} suffix="cm" onChange={(sourceDistanceCm) => onChange(treatment.id, { sourceDistanceCm })} /> : null}
                {treatment.mode === "wall_wash" ? (
                  <>
                    <DiffuserSlider label="Direction" value={treatment.directionDeg} min={-180} max={180} step={5} suffix="°" onChange={(directionDeg) => onChange(treatment.id, { directionDeg })} />
                    <DiffuserSlider label="Throw" value={treatment.throwCm} min={1} max={120} step={1} suffix="cm" onChange={(throwCm) => onChange(treatment.id, { throwCm })} />
                    <DiffuserSlider label="Beam" value={treatment.beamAngleDeg} min={5} max={150} step={5} suffix="°" onChange={(beamAngleDeg) => onChange(treatment.id, { beamAngleDeg })} />
                    <DiffuserSlider label="Falloff" value={treatment.falloff} min={0.25} max={4} step={0.05} onChange={(falloff) => onChange(treatment.id, { falloff })} />
                  </>
                ) : null}
                {treatment.mode === "halo" ? <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Face color <input type="color" value={treatment.faceColor} onChange={(event) => onChange(treatment.id, { faceColor: event.target.value })} /></label> : null}
                {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Receiver
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={receiverValue} onChange={(event) => {
                    const [receiverType, receiverId] = event.target.value.split(":");
                    onChange(treatment.id, { receiverType: receiverType as DesignerOpticalTreatment["receiverType"], receiverId: receiverId || undefined });
                  }}>
                    <option value="canvas">Canvas</option>
                    {designer.buildAreas.map((area) => <option key={area.id} value={`build_area:${area.id}`}>Area: {area.name}</option>)}
                    {designer.zones.map((zone) => <option key={zone.id} value={`zone:${zone.id}`}>Zone: {zone.name}</option>)}
                  </select>
                </label> : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DiffuserSlider({ label, value, min, center, max, step, suffix = "", onChange }: { label: string; value: number; min: number; center?: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  const displayValue = Math.abs(value - Math.round(value)) < 0.001 ? String(Math.round(value)) : value.toFixed(step < 0.1 ? 2 : 1);
  const centerValue = center ?? min;
  const centered = typeof center === "number" && centerValue > min && centerValue < max;
  const sliderValue = centered ? centeredSliderPosition(value, min, centerValue, max) : value;
  return (
    <label className="flex w-full min-w-0 items-center gap-1.5">
      <span className="w-[112px] shrink-0 text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <span className="relative flex min-w-0 flex-1 items-center">
        {centered ? <span className="pointer-events-none absolute left-1/2 h-3 w-px bg-muted-foreground/60" /> : null}
        <input
          className="h-2 min-w-0 flex-1 accent-primary"
          type="range"
          min={centered ? 0 : min}
          max={centered ? 1000 : max}
          step={centered ? 1 : step}
          value={sliderValue}
          onChange={(event) => {
            const raw = centered ? centeredSliderValue(Number(event.target.value), min, centerValue, max) : Number(event.target.value);
            onChange(clamp(Math.round(raw / step) * step, min, max));
          }}
        />
      </span>
      <span className="min-w-8 text-left font-mono text-[11px] text-muted-foreground">{displayValue}{suffix}</span>
    </label>
  );
}

function centeredSliderPosition(value: number, min: number, center: number, max: number) {
  const bounded = clamp(value, min, max);
  if (bounded <= center) return 500 * (bounded - min) / (center - min);
  return 500 + 500 * Math.log(bounded / center) / Math.log(max / center);
}

function centeredSliderValue(position: number, min: number, center: number, max: number) {
  const bounded = clamp(position, 0, 1000);
  if (bounded <= 500) return min + (center - min) * bounded / 500;
  return center * Math.pow(max / center, (bounded - 500) / 500);
}

function maximumTimelineHeight(viewportHeight: number) {
  const animateChromeHeight = 94;
  return Math.min(420, Math.max(140, (viewportHeight - animateChromeHeight) * 0.45));
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
            key={`${pixel.output}:${pixel.serialIndex}`}
            title={`Output ${pixel.output}, pixel ${pixel.serialIndex} · x ${pixel.x}, y ${pixel.y}`}
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

function initialAnimationPreviewTime(document: PartituraDocument) {
  const scene = document.scenes.find((entry) => entry.id === document.activeSceneId) ?? document.scenes[0];
  if (!scene) return Math.max(0, document.previewTimeMs);
  if (document.previewTimeMs > 0) return Math.min(document.previewTimeMs, Math.max(0, scene.durationMs - 1));
  const visibleClip = scene.clips
    .filter((clip) => clip.enabled !== false && clip.effect !== "off" && clip.durationMs > 0)
    .sort((left, right) => left.startMs - right.startMs || left.layer - right.layer)[0];
  if (!visibleClip) return 0;
  return Math.min(Math.max(0, scene.durationMs - 1), visibleClip.startMs + Math.floor(visibleClip.durationMs / 2));
}

function clipEnablementSignature(document: PartituraDocument) {
  return document.scenes
    .flatMap((scene) => scene.clips.map((clip) => `${scene.id}:${clip.id}:${clip.enabled !== false ? 1 : 0}`))
    .join("|");
}

function reorderById<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function reorderRoutesWithinKind<T extends { id: string; kind: string }>(routes: T[], activeId: string, overId: string) {
  const active = routes.find((route) => route.id === activeId);
  const over = routes.find((route) => route.id === overId);
  if (!active || !over || active.kind !== over.kind) return routes;
  const sameKind = reorderById(routes.filter((route) => route.kind === active.kind), activeId, overId);
  let index = 0;
  return routes.map((route) => route.kind === active.kind ? sameKind[index++] : route);
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
                  key={`${pixel.output}:${pixel.serialIndex}`}
                  title={`Output ${pixel.output}, pixel ${pixel.serialIndex}`}
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
