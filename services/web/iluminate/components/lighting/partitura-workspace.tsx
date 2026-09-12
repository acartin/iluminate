"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Cable, Circle, Copy, Hand, Layers, Maximize2, MousePointer2, Pause, PenLine, Play, Plus, Ruler, Route, RotateCcw, Save, Scissors, Sparkles, Spline, Square, Trash2, ZoomIn, ZoomOut } from "lucide-react";
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
  clampViewport,
  deletePolygonPoint,
  findMatchingControllerPort,
  findMatchingSolderTerminal,
  fitViewportToDesigner,
  insertPolygonPoint,
  isRouteTerminal,
  moveRoutePoint,
  moveRouteTerminals,
  movedShape,
  nearestRouteInsertIndex,
  rectanglePoints,
  resolveRouteOutputs,
  resizedBuildArea,
  resizedZone,
  routeLengthCm,
  sameSnapPoint,
  setPolygonNodeType,
  sampleRouteLedDots,
  snapValue,
  summarizeRoute,
  updatePolygonPoint
} from "./designer/designer-geometry";
import { DesignerStudioCanvas } from "./designer/designer-paper-canvas";
import { DesignerLayersPanel, NodeTypePicker, ToolbarField, ToolbarNumber, ToolButton } from "./designer/designer-ui";
import type { DesignerActiveLayer, DesignerRouteTerminal, DesignerSelection, DesignerTool, DesignerViewport } from "./designer/types";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import {
  clonePartituraDocument,
  ClipParams,
  ClipForm,
  DesignerArtworkForm,
  DesignerBuildAreaForm,
  DesignerControllerForm,
  DesignerForm,
  DesignerLayerSettings,
  DesignerLayersForm,
  DesignerPoint,
  DesignerPointNodeType,
  DesignerRouteKind,
  DesignerRouteForm,
  DesignerZoneForm,
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

export function PartituraDesignerStudio({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState<PartituraDocument>(() => normalizeDefaultSignLayout(initialPartitura.document));
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<"design" | "animate">("design");
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [animationResult, setAnimationResult] = useState<ApiResult | null>(null);
  const [animationGenerating, setAnimationGenerating] = useState(false);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationPlayerOpen, setAnimationPlayerOpen] = useState(false);
  const animationResultRef = useRef<ApiResult | null>(null);
  const animationRequestInFlightRef = useRef(false);
  const animationLastRequestRef = useRef(0);
  const animationStartRef = useRef<number | null>(null);
  const animationOffsetRef = useRef(0);
  const [tool, setTool] = useState<DesignerTool>("select");
  // A new design starts by defining its physical reference, not by wiring it.
  // This also keeps the seeded build area immediately selectable and removable.
  const [activeLayer, setActiveLayer] = useState<DesignerActiveLayer>("reference");
  const [selection, setSelection] = useState<DesignerSelection>(null);
  const [clipboard, setClipboard] = useState<DesignerSelection>(null);
  const [fabricationNotice, setFabricationNotice] = useState("Ready");
  const [viewport, setViewport] = useState<DesignerViewport | null>(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const artworkUrls = useMemo(() => Object.fromEntries(projectAssets.map((asset) => [asset.id, `/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/${encodeURIComponent(asset.id)}`])), [document.projectId, projectAssets]);
  const animationPixels = animationResult?.preview?.outputRows.flatMap((row) => row.pixels) ?? [];

  useEffect(() => {
    animationResultRef.current = animationResult;
  }, [animationResult]);

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
  }, [animationPlaying, document.activeSceneId, document.scenes, editorMode]);
  const designerState = document.designer;
  if (!designerState) return null;
  const designer: DesignerForm = designerState;
  const selectedArtwork = selection?.type === "artwork" ? designer.artwork.find((artwork) => artwork.id === selection.id) ?? null : null;
  const selectedBuildArea = selection?.type === "build_area" ? designer.buildAreas.find((buildArea) => buildArea.id === selection.id) ?? null : null;
  const selectedBuildAreaPointIndex = selection?.type === "build_area" ? selection.pointIndex : undefined;
  const selectedZone = selection?.type === "zone" ? designer.zones.find((zone) => zone.id === selection.id) ?? null : null;
  const selectedZonePointIndex = selection?.type === "zone" ? selection.pointIndex : undefined;
  const selectedRoute = selection?.type === "route" ? designer.routes.find((route) => route.id === selection.id) ?? null : null;
  const selectedRoutePointIndex = selection?.type === "route" ? selection.pointIndex : undefined;
  const selectedController = selection?.type === "controller" ? designer.controller : null;
  const routeSummaries = designer.routes.map((route) => summarizeRoute(route, designer));
  const routeOutputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const totalGeneratedPixels = routeSummaries.reduce((total, route) => total + route.pixels, 0);
  const ledsPerAddressablePixel = designer.ledsPerMeter / Math.max(1, designer.addressablePixelsPerMeter);
  const activeViewport = viewport ?? { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };
  const compileIsCurrent = Boolean(document.compiledLayout && document.compiledDesignerSignature === designerCompileSignature(designer));
  const compileErrors = document.compiledLayout?.validation.errors ?? [];
  const canAnimate = compileIsCurrent && compileErrors.length === 0;

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
  }, [document.projectId]);

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
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
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
      if (activeLayer === "reference" && event.key.toLowerCase() === "p") setTool("build_area_polygon");
      if (activeLayer === "reference" && event.key.toLowerCase() === "b") setTool("build_area_bezier");
      if (activeLayer === "strings" && event.key.toLowerCase() === "l") setTool("led_string");
      if (activeLayer === "strings" && event.key.toLowerCase() === "d") setTool("data_cable");
      if (activeLayer === "strings" && event.key.toLowerCase() === "x") setTool("cut");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function save(nextDocument = document, generatedPartitura = partitura.generatedPartitura) {
    const normalizedDocument = normalizeDefaultSignLayout(nextDocument);
    setSaving(true);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: partitura.name,
          status: partitura.status,
          document: normalizedDocument,
          generatedPartitura: generatedPartitura ?? null,
          validationReport: partitura.validationReport ?? {}
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

  function updateDesigner(nextDesigner: DesignerForm) {
    setDocument((current) => ({ ...current, designer: nextDesigner }));
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

  function addArtwork(asset: ProjectAsset) {
    if (designer.layers.artwork.locked) return;
    const next = designer.artwork.length + 1;
    const width = Math.max(12, Math.round(activeViewport.width * 0.3));
    const height = Math.max(8, Math.round(activeViewport.height * 0.3));
    const artwork: DesignerArtworkForm = {
      id: `artwork_${asset.id}_${Date.now()}`,
      assetId: asset.id,
      name: asset.fileName.replace(/\.[^.]+$/, "") || `Artwork ${next}`,
      x: snapValue(activeViewport.x + activeViewport.width / 2 - width / 2, designer.snapCm),
      y: snapValue(activeViewport.y + activeViewport.height / 2 - height / 2, designer.snapCm),
      width,
      height,
      visible: true,
      locked: false,
      opacity: 0.85
    };
    updateDesigner({ ...designer, artwork: [...designer.artwork, artwork] });
    setActiveLayer("artwork");
    setSelection({ type: "artwork", id: artwork.id });
    setTool("select");
    setFabricationNotice("Artwork reference added.");
  }

  function patchArtwork(artworkId: string, patch: Partial<DesignerArtworkForm>) {
    if (designer.layers.artwork.locked) return;
    const artwork = designer.artwork.find((entry) => entry.id === artworkId);
    if (artwork?.locked && !("locked" in patch)) return;
    updateDesigner({ ...designer, artwork: designer.artwork.map((entry) => (entry.id === artworkId ? { ...entry, ...patch } : entry)) });
  }

  function patchZoneVisual(zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchBuildAreaVisual(buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === buildAreaId ? { ...buildArea, ...patch } : buildArea)) });
  }

  function patchBuildArea(buildAreaId: string, patch: Partial<DesignerBuildAreaForm>) {
    if (designer.layers.reference.locked) return;
    const currentBuildArea = designer.buildAreas.find((buildArea) => buildArea.id === buildAreaId);
    if (currentBuildArea?.locked) return;
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

  function selectDesignerItem(nextSelection: DesignerSelection) {
    setSelection(nextSelection);
  }

  function activateDesignerLayer(layer: DesignerActiveLayer) {
    setActiveLayer(layer);
    setTool("select");
    setSelection(null);
  }

  function patchController(patch: Partial<DesignerControllerForm>) {
    if (designer.layers.strings.locked) return;
    updateDesigner({ ...designer, controller: { ...designer.controller, ...patch, id: "controller" } });
  }

  function patchZone(zoneId: string, patch: Partial<DesignerZoneForm>) {
    if (designer.layers.zones.locked) return;
    const currentZone = designer.zones.find((zone) => zone.id === zoneId);
    if (currentZone?.locked) return;
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

  function addZone(shape: DesignerZoneForm["shape"] = "rect") {
    const next = designer.zones.length + 1;
    const defaultWidth = Math.max(8, Math.round(activeViewport.width * 0.22));
    const defaultHeight = Math.max(6, Math.round(activeViewport.height * 0.22));
    const width = shape === "ellipse" ? Math.max(defaultWidth, defaultHeight) : defaultWidth;
    const height = shape === "ellipse" ? width : defaultHeight;
    const zone = {
      id: `zone_${next}`,
      name: `Zone ${next}`,
      shape,
      x: snapValue(activeViewport.x + activeViewport.width / 2 - width / 2, designer.snapCm),
      y: snapValue(activeViewport.y + activeViewport.height / 2 - height / 2, designer.snapCm),
      width,
      height,
      visible: true,
      locked: false,
      opacity: 1
    };
    updateDesigner({
      ...designer,
      zones: [...designer.zones, zone]
    });
    setSelection({ type: "zone", id: zone.id });
    setTool("select");
  }

  function addBuildArea(shape: DesignerBuildAreaForm["shape"] = "rect") {
    if (designer.layers.reference.locked) return;
    const next = designer.buildAreas.length + 1;
    const defaultWidth = Math.max(12, Math.round(activeViewport.width * 0.28));
    const defaultHeight = Math.max(8, Math.round(activeViewport.height * 0.28));
    const width = shape === "ellipse" ? Math.max(defaultWidth, defaultHeight) : defaultWidth;
    const height = shape === "ellipse" ? width : defaultHeight;
    const buildArea: DesignerBuildAreaForm = {
      id: `build_area_${next}`,
      name: next === 1 ? "Build Area" : `Build Area ${next}`,
      shape,
      x: snapValue(activeViewport.x + activeViewport.width / 2 - width / 2, designer.snapCm),
      y: snapValue(activeViewport.y + activeViewport.height / 2 - height / 2, designer.snapCm),
      width,
      height,
      visible: true,
      locked: false,
      opacity: 1
    };
    updateDesigner({ ...designer, buildAreas: [...designer.buildAreas, buildArea] });
    setSelection({ type: "build_area", id: buildArea.id });
    setTool("select");
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
    if (!buildArea || designer.layers.reference.locked || buildArea.locked) return;
    patchBuildArea(buildAreaId, setPolygonNodeType(buildArea, pointIndex, nodeType));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function setZoneNodeType(zoneId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked || zone.locked) return;
    patchZone(zoneId, setPolygonNodeType(zone, pointIndex, nodeType));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function insertBuildAreaPoint(buildAreaId: string, insertIndex: number, point: DesignerPoint) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.reference.locked || buildArea.locked) return;
    patchBuildArea(buildAreaId, insertPolygonPoint(buildArea, insertIndex, point, designer.snapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: insertIndex });
    setFabricationNotice("Reference polygon point inserted.");
  }

  function insertZonePoint(zoneId: string, insertIndex: number, point: DesignerPoint) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked || zone.locked) return;
    patchZone(zoneId, insertPolygonPoint(zone, insertIndex, point, designer.snapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex: insertIndex });
    setFabricationNotice("Zone polygon point inserted.");
  }

  function deleteBuildAreaPoint(buildAreaId: string, pointIndex: number) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.reference.locked || buildArea.locked) return;
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
    if (!zone || designer.layers.zones.locked || zone.locked) return;
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

  function autoSolderRoutePoint(routeId: string, pointIndex: number, finalPoint?: DesignerPoint) {
    const routes = finalPoint ? moveRoutePoint(designer.routes, routeId, pointIndex, finalPoint) : designer.routes;
    const route = routes.find((entry) => entry.id === routeId);
    if (!route || !isRouteTerminal(route, pointIndex)) {
      return;
    }
    const matchingTerminal = findMatchingSolderTerminal(routes, routeId, pointIndex, designer.snapCm);
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
      if (designer.layers.artwork.locked || designer.artwork.find((artwork) => artwork.id === selection.id)?.locked) return;
      updateDesigner({ ...designer, artwork: designer.artwork.filter((artwork) => artwork.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Artwork reference deleted.");
      return;
    }
    if (selection.type === "build_area") {
      if (designer.layers.reference.locked || designer.buildAreas.find((buildArea) => buildArea.id === selection.id)?.locked) return;
      if (typeof selection.pointIndex === "number") {
        deleteBuildAreaPoint(selection.id, selection.pointIndex);
        return;
      }
      updateDesigner({ ...designer, buildAreas: designer.buildAreas.filter((buildArea) => buildArea.id !== selection.id) });
      setSelection(null);
      return;
    }
    if (selection.type === "zone" && designer.layers.zones.locked) return;
    if (selection.type === "route" && designer.layers.strings.locked) return;
    if (selection.type === "zone" && typeof selection.pointIndex === "number") {
      deleteZonePoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "zone") {
      const zones = designer.zones.filter((zone) => zone.id !== selection.id);
      updateDesigner({
        ...designer,
        zones
      });
      setSelection(null);
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
      updateDesigner({ ...designer, routes });
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
      const next = designer.zones.length + 1;
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

  function zoom(factor: number) {
    setViewport((current) => {
      const base = current ?? activeViewport;
      const width = clamp(base.width * factor, designer.canvasWidthCm * 0.08, designer.canvasWidthCm * 2);
      const height = clamp(base.height * factor, designer.canvasHeightCm * 0.08, designer.canvasHeightCm * 2);
      return clampViewport({
        x: clamp(base.x + (base.width - width) / 2, -designer.canvasWidthCm, designer.canvasWidthCm),
        y: clamp(base.y + (base.height - height) / 2, -designer.canvasHeightCm, designer.canvasHeightCm),
        width,
        height
      }, designer);
    });
  }

  function zoomToFit() {
    setViewport(fitViewportToDesigner(designer));
  }

  function compileLayout() {
    const nextDocument = buildDocumentFromDesigner(document);
    setDocument(nextDocument);
    const layout = nextDocument.compiledLayout;
    setFabricationNotice(layout?.validation.errors.length
      ? `Compile failed: ${layout.validation.errors.length} electrical error${layout.validation.errors.length === 1 ? "" : "s"}.`
      : `Compiled: ${layout?.pixelMap.length ?? 0} mapped pixels across ${layout?.outputs.filter((output) => output.pixelCount > 0).length ?? 0} outputs.`);
    void save(nextDocument);
  }

  async function previewAnimation() {
    if (!canAnimate) return;
    setAnimationGenerating(true);
    try {
      const previewDocument = { ...document, previewTimeMs: initialAnimationPreviewTime(document) };
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewDocument)
      });
      const payload = (await response.json()) as ApiResult;
      setAnimationResult(payload);
      if (payload.ok) {
        setAnimationPlayerOpen(false);
        setAnimationPlaying(true);
        setFabricationNotice(`Animation running: ${payload.preview?.pixelCount ?? 0} mapped pixels.`);
      } else {
        setAnimationPlaying(false);
        setFabricationNotice(payload.message ?? payload.validation?.errors[0]?.message ?? "Animation generation failed.");
      }
    } finally {
      setAnimationGenerating(false);
    }
  }

  const canCopySelection = Boolean(selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "route"));
  const canDeleteSelection = Boolean(selection)
    && selection?.type !== "controller"
    && !(selection?.type === "artwork" && (designer.layers.artwork.locked || Boolean(selectedArtwork?.locked)))
    && !(selection?.type === "build_area" && (designer.layers.reference.locked || Boolean(selectedBuildArea?.locked)))
    && !(selection?.type === "zone" && designer.layers.zones.locked)
    && !(selection?.type === "route" && designer.layers.strings.locked);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border-2 bg-card px-3 py-2 whitespace-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" type="button" className="h-9 px-3">
            <Link href={`/partituras/generator/${encodeURIComponent(partitura.id)}`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0 pr-1">
            <div className="max-w-[220px] truncate text-body-sm font-semibold">{partitura.name}</div>
            <div className="font-mono text-[10px] uppercase text-muted-foreground">{partitura.partituraKey}</div>
          </div>
        </div>
        {editorMode === "design" ? <><div className="h-8 w-px shrink-0 bg-border" />
        <ToolbarField label="Ruler" className="shrink-0">
          <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.rulerUnit} onChange={(event) => patchDesigner({ rulerUnit: event.target.value as DesignerForm["rulerUnit"] })}>
            <option value="cm">cm</option>
            <option value="in">inches</option>
          </select>
        </ToolbarField>
        <label className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-input bg-card px-2 text-body-sm">
          <input type="checkbox" checked={designer.rulerVisible} onChange={(event) => patchDesigner({ rulerVisible: event.target.checked })} />
          Ruler
        </label>
        <ToolbarNumber label="W" value={designer.canvasWidthCm} suffix="cm" onChange={(canvasWidthCm) => patchDesigner({ canvasWidthCm })} />
        <ToolbarNumber label="H" value={designer.canvasHeightCm} suffix="cm" onChange={(canvasHeightCm) => patchDesigner({ canvasHeightCm })} />
        <ToolbarNumber label="Snap" value={designer.snapCm} suffix="cm" onChange={(snapCm) => patchDesigner({ snapCm })} /></> : <div className="ml-2 text-body-sm text-muted-foreground">Animation preview</div>}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <ThemeToggle />
          {editorMode === "design" ? <Button type="button" variant={layersPanelOpen ? "default" : "outline"} title="Layers" className="h-9 px-3" onClick={() => setLayersPanelOpen((open) => !open)}>
            <Layers className="h-4 w-4" />
            Layers
          </Button> : null}
          {editorMode === "design" ? <><Button type="button" variant="outline" title="Copy" className="h-9 w-9 px-0" disabled={!canCopySelection} onClick={copySelection}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" title="Paste" className="h-9 px-2" disabled={!clipboard} onClick={pasteSelection}>
            Paste
          </Button>
          <Button type="button" variant="outline" title="Delete" className="h-9 w-9 px-0" disabled={!canDeleteSelection} onClick={deleteSelection}>
            <Trash2 className="h-4 w-4" />
          </Button></> : null}
          <Button type="button" variant="outline" onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </Button>
          <Button type="button" onClick={compileLayout} disabled={saving}>
            <Cable className="h-4 w-4" />
            Compile
          </Button>
          {editorMode === "animate" ? (
            <Button type="button" variant="outline" title="Return to design tools" onClick={() => setEditorMode("design")}>
              <MousePointer2 className="h-4 w-4" />
              Design
            </Button>
          ) : canAnimate ? (
            <Button type="button" title="Open animation timeline" onClick={() => setEditorMode("animate")}>
              <Play className="h-4 w-4" />
              Animate
            </Button>
          ) : (
            <Button type="button" disabled title="Compile the current Designer without electrical errors to enable Animate">
              <Play className="h-4 w-4" />
              Animate
            </Button>
          )}
        </div>
      </header>

      <div className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-border-2 bg-surface-2 px-3 whitespace-nowrap">
        <div className="flex min-w-max items-center gap-2">
        {editorMode === "design" ? <Badge className="shrink-0 capitalize">{activeLayer}</Badge> : <Badge>Animate</Badge>}
        <Badge className={compileIsCurrent ? (compileErrors.length ? "border border-destructive/50 bg-destructive/10 text-destructive" : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300") : "border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"}>
          {compileIsCurrent ? (compileErrors.length ? `Compile errors: ${compileErrors.length}` : `Compiled: ${document.compiledLayout?.pixelMap.length ?? 0} px`) : "Compile required"}
        </Badge>
        <span className="max-w-[280px] truncate text-meta text-muted-foreground">{fabricationNotice}</span>
        {editorMode === "design" ? <div className="h-8 w-px shrink-0 bg-border" /> : null}
        {editorMode === "design" && activeLayer === "strings" ? (
          <>
            <ToolbarNumber label="Pixels/m" value={designer.addressablePixelsPerMeter} onChange={(addressablePixelsPerMeter) => patchDesigner({ addressablePixelsPerMeter, ledDensityPerMeter: addressablePixelsPerMeter })} />
            <ToolbarNumber label="LEDs/m" value={designer.ledsPerMeter} onChange={(ledsPerMeter) => patchDesigner({ ledsPerMeter })} />
            <div className="h-8 w-px shrink-0 bg-border" />
          </>
        ) : null}
        {editorMode === "design" && selectedArtwork ? (
          <>
            <ToolbarNumber label="X" value={selectedArtwork.x} suffix="cm" onChange={(x) => patchArtwork(selectedArtwork.id, { x })} />
            <ToolbarNumber label="Y" value={selectedArtwork.y} suffix="cm" onChange={(y) => patchArtwork(selectedArtwork.id, { y })} />
            <ToolbarNumber label="W" value={selectedArtwork.width} suffix="cm" onChange={(width) => patchArtwork(selectedArtwork.id, { width })} />
            <ToolbarNumber label="H" value={selectedArtwork.height} suffix="cm" onChange={(height) => patchArtwork(selectedArtwork.id, { height })} />
            <Badge>Artwork</Badge>
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
                <Button type="button" variant="outline" disabled={(selectedBuildArea.points?.length ?? 0) <= 3} onClick={() => deleteBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex)}>
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
        ) : editorMode === "design" && selectedZone ? (
          <>
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
                <Button type="button" variant="outline" disabled={(selectedZone.points?.length ?? 0) <= 3} onClick={() => deleteZonePoint(selectedZone.id, selectedZonePointIndex)}>
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
        ) : editorMode === "design" && selectedController ? (
          <>
            <ToolbarNumber label="X" value={selectedController.x} onChange={(x) => patchController({ x })} />
            <ToolbarNumber label="Y" value={selectedController.y} onChange={(y) => patchController({ y })} />
            <ToolbarNumber label="Ports" value={selectedController.dataOutputs} onChange={(dataOutputs) => patchController({ dataOutputs: Math.max(1, Math.round(dataOutputs)) })} />
            <Badge>Controller</Badge>
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
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 ${editorMode === "animate" ? "grid-cols-[minmax(0,1fr)]" : layersPanelOpen ? "grid-cols-[56px_minmax(0,1fr)_320px]" : "grid-cols-[56px_minmax(0,1fr)]"}`}>
        {editorMode === "design" ? <aside className="flex min-h-0 flex-col border-r border-border-2 bg-card py-2">
          <div className="flex shrink-0 flex-col items-center gap-2 px-2">
          <ToolButton active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
            <ToolButton active={tool === "pan"} label="Pan" icon={Hand} onClick={() => setTool("pan")} />
          <ToolButton active={tool === "measure"} label="Measure distance" icon={Ruler} onClick={() => setTool("measure")} />
          <ToolButton label="Delete selected" icon={Trash2} disabled={!canDeleteSelection} onClick={deleteSelection} />
          </div>
          <div className="mx-3 my-2 h-px shrink-0 bg-border" />
          {editorMode === "design" ? <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2">
          {activeLayer === "reference" ? (
            <>
              <ToolButton active={tool === "build_area_rect"} label="Rectangle Build Area" icon={Square} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => addBuildArea("rect")} />
              <ToolButton active={tool === "build_area_ellipse"} label="Ellipse Build Area" icon={Circle} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => addBuildArea("ellipse")} />
              <ToolButton active={tool === "build_area_polygon"} label="Polygon Build Area" icon={PenLine} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => setTool("build_area_polygon")} />
              <ToolButton active={tool === "build_area_bezier"} label="Bezier Build Area" icon={Spline} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => setTool("build_area_bezier")} />
            </>
          ) : null}
          {activeLayer === "zones" ? (
            <>
              <ToolButton active={tool === "zone_rect"} label="Rectangle Zone" icon={Square} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => addZone("rect")} />
              <ToolButton active={tool === "zone_ellipse"} label="Ellipse Zone" icon={Circle} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => addZone("ellipse")} />
              <ToolButton active={tool === "zone_polygon"} label="Polygon Zone" icon={PenLine} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_polygon")} />
              <ToolButton active={tool === "zone_bezier"} label="Bezier Zone" icon={Spline} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_bezier")} />
            </>
          ) : null}
          {activeLayer === "strings" ? (
            <>
              <ToolButton active={tool === "led_string"} label="LED string" icon={Route} tone="amber" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("led_string")} />
              <ToolButton active={tool === "data_cable"} label="Data cable" icon={Cable} tone="green" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("data_cable")} />
              <ToolButton active={tool === "cut"} label="Cut route" icon={Scissors} disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("cut")} />
            </>
          ) : null}
          </div> : <div className="min-h-0 flex-1" />}
          <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border px-2 pt-2">
          <ToolButton label="Zoom In" icon={ZoomIn} onClick={() => zoom(0.78)} />
          <ToolButton label="Zoom Out" icon={ZoomOut} onClick={() => zoom(1.28)} />
          <ToolButton label="Fit" icon={Maximize2} onClick={zoomToFit} />
          </div>
        </aside> : null}

        <main className="min-w-0 overflow-hidden bg-muted p-2">
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
            selectedRouteId={selectedRoute?.id}
            selectedRoutePointIndex={selectedRoutePointIndex}
            selectedController={Boolean(selectedController)}
            onViewportChange={setViewport}
            onChange={updateDesigner}
            onSelect={selectDesignerItem}
            onInsertBuildAreaPoint={insertBuildAreaPoint}
            onInsertZonePoint={insertZonePoint}
            onInsertRoutePoint={insertRoutePoint}
            onCutRoutePoint={handleCutRoutePoint}
            onRoutePointDragEnd={autoSolderRoutePoint}
            onSolderedTerminalsDragEnd={moveSolderedTerminals}
          /> : document.compiledLayout ? <DesignerStudioCanvas
            designer={designer}
            activeLayer="zones"
            tool="select"
            onToolChange={() => undefined}
            viewport={activeViewport}
            artworkUrls={{}}
            selectedZoneId={selection?.type === "zone" ? selection.id : undefined}
            onViewportChange={setViewport}
            onChange={() => undefined}
            onSelect={selectDesignerItem}
            onInsertBuildAreaPoint={() => undefined}
            onInsertZonePoint={() => undefined}
            onInsertRoutePoint={() => undefined}
            onCutRoutePoint={() => undefined}
            onRoutePointDragEnd={() => undefined}
            onSolderedTerminalsDragEnd={() => undefined}
            presentation="animate"
            compiledLayout={document.compiledLayout}
            animationPixels={animationPixels}
            showRulers={false}
          /> : null}
        </main>
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
            onAddArtwork={addArtwork}
            onPatchArtwork={patchArtwork}
            onPatchBuildArea={patchBuildAreaVisual}
            onPatchZone={patchZoneVisual}
            onPatchController={patchController}
            onPatchRoute={patchRoute}
            onSelect={selectDesignerItem}
            onClose={() => setLayersPanelOpen(false)}
          />
        ) : null}
      </div>
      {editorMode === "animate" ? (
        <DesignerAnimateTimeline
          document={document}
          effects={effectCatalog}
          selectedTargetId={selection?.type === "zone" ? selection.id : undefined}
          onChange={setDocument}
          onPreview={() => void previewAnimation()}
          previewing={animationGenerating}
          playing={animationPlaying}
          onSave={() => void save()}
          saving={saving}
          onTogglePlayback={() => {
            if (!animationResult?.ok) void previewAnimation();
            else setAnimationPlaying((current) => !current);
          }}
        />
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
    const nextIndex = (activeScene?.clips.length ?? 0) + 1;
    const clip: ClipForm = {
      id: `clip_${nextIndex}`,
      name: `Clip ${nextIndex}`,
      target: sceneTargets[0]?.id ?? "full_sign",
      coordinateSpace: "local",
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
                      <MapRow label="Space" value={clip.coordinateSpace ?? "local"} />
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
  const zoneTargets = document.designer?.zones ?? [];
  const groupTargets = document.designer?.groups ?? [];
  const mappedZones = new Map(layout?.zones.map((zone) => [zone.id, zone.pixelIds.length]) ?? []);

  return [
    { id: "full_sign", name: "Full sign", detail: `${layout?.pixelMap.length ?? 0} mapped pixels` },
    ...zoneTargets.map((zone) => ({ id: zone.id, name: zone.name || zone.id, detail: `${mappedZones.get(zone.id) ?? 0} mapped pixels` })),
    ...groupTargets.map((group) => ({ id: group.id, name: group.name || group.id, detail: "Designer group" }))
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
      <Field label="Coordinate space">
        <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.coordinateSpace ?? "local"} onChange={(event) => onChange({ coordinateSpace: event.target.value as ClipForm["coordinateSpace"] })}>
          <option value="serial">Serial route</option>
          <option value="local">Target local</option>
          <option value="global">Full sign global</option>
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
    .filter((clip) => clip.effect !== "off" && clip.durationMs > 0)
    .sort((left, right) => left.startMs - right.startMs || left.layer - right.layer)[0];
  if (!visibleClip) return 0;
  return Math.min(Math.max(0, scene.durationMs - 1), visibleClip.startMs + Math.floor(visibleClip.durationMs / 2));
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
