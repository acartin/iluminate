"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Cable, ChevronDown, ChevronRight, Circle, Copy, Eye, EyeOff, Hand, Layers, Lock, Maximize2, MousePointer2, Pause, PenLine, Play, Plus, Route, RotateCcw, Save, Scissors, Sparkles, Square, Trash2, Unlock, ZoomIn, ZoomOut } from "lucide-react";
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
  DesignerBuildAreaForm,
  DesignerControllerForm,
  DesignerForm,
  DesignerLayerSettings,
  DesignerLayersForm,
  DesignerPoint,
  DesignerRouteKind,
  DesignerRouteForm,
  DesignerZoneForm,
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

type DesignerTool = "select" | "build_area_rect" | "build_area_ellipse" | "build_area_polygon" | "zone_rect" | "zone_ellipse" | "zone_polygon" | "led_string" | "data_cable" | "cut" | "pan";
type DesignerRouteTerminal = { routeId: string; pointIndex: number };
type DesignerSelection =
  | { type: "build_area"; id: string; pointIndex?: number }
  | { type: "zone"; id: string; pointIndex?: number }
  | { type: "route"; id: string; pointIndex?: number }
  | { type: "controller"; id: string }
  | null;
type DesignerDrag =
  | { type: "build-area-move"; buildAreaId: string; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-resize"; buildAreaId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-point"; buildAreaId: string; pointIndex: number }
  | { type: "controller-move"; start: { x: number; y: number }; original: DesignerControllerForm; originalRoutes: DesignerRouteForm[] }
  | { type: "zone-move"; zoneId: string; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-resize"; zoneId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-point"; zoneId: string; pointIndex: number }
  | { type: "route-move"; routeId: string; start: { x: number; y: number }; original: DesignerRouteForm }
  | { type: "route-point"; routeId: string; pointIndex: number; jointGroup: DesignerRouteTerminal[] }
  | { type: "pan"; start: { x: number; y: number }; original: DesignerViewport };
type DesignerRouteDraft = { kind: DesignerRouteKind; points: DesignerPoint[]; routeId?: string };
type DesignerShapeDraft = { target: "build_area" | "zone"; points: DesignerPoint[] };
type DesignerActiveLayer = keyof DesignerLayersForm;
type DesignerViewport = { x: number; y: number; width: number; height: number };
type ResizeHandle = "nw" | "ne" | "sw" | "se";

export function PartituraDesignerStudio({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState(() => normalizeDefaultSignLayout(initialPartitura.document));
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<DesignerTool>("select");
  const [activeLayer, setActiveLayer] = useState<DesignerActiveLayer>("strings");
  const [selection, setSelection] = useState<DesignerSelection>(null);
  const [clipboard, setClipboard] = useState<DesignerSelection>(null);
  const [fabricationNotice, setFabricationNotice] = useState("Ready");
  const [viewport, setViewport] = useState<DesignerViewport | null>(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const designerState = document.designer;
  if (!designerState) return null;
  const designer: DesignerForm = designerState;
  const selectedBuildArea = selection?.type === "build_area" ? designer.buildAreas.find((buildArea) => buildArea.id === selection.id) ?? null : null;
  const selectedBuildAreaPointIndex = selection?.type === "build_area" ? selection.pointIndex : undefined;
  const selectedZone = selection?.type === "zone" ? designer.zones.find((zone) => zone.id === selection.id) ?? null : null;
  const selectedZonePointIndex = selection?.type === "zone" ? selection.pointIndex : undefined;
  const selectedRoute = selection?.type === "route" ? designer.routes.find((route) => route.id === selection.id) ?? null : null;
  const selectedRoutePointIndex = selection?.type === "route" ? selection.pointIndex : undefined;
  const selectedController = selection?.type === "controller" ? designer.controller : null;
  const routeSummaries = designer.routes.map((route) => summarizeRoute(route, designer));
  const totalGeneratedPixels = routeSummaries.reduce((total, route) => total + route.pixels, 0);
  const ledsPerAddressablePixel = designer.ledsPerMeter / Math.max(1, designer.addressablePixelsPerMeter);
  const activeViewport = viewport ?? { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };

  useEffect(() => {
    if (viewport) return;
    setViewport(fitViewportToDesigner(designer));
  }, [designer.canvasHeightCm, designer.canvasWidthCm, viewport]);

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
      if (activeLayer === "reference" && event.key.toLowerCase() === "p") setTool("build_area_polygon");
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

  function patchZoneVisual(zoneId: string, patch: Partial<Pick<DesignerZoneForm, "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchBuildAreaVisual(buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "visible" | "locked" | "opacity">>) {
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
    const previousId = zoneId;
    const nextId = patch.id ?? previousId;
    const nextPatch = patch.shape === "polygon" && currentZone && !currentZone.points
      ? { ...patch, points: rectanglePoints(currentZone) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({
      ...designer,
      zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...nextPatch } : zone)),
      routes: previousId && nextId && previousId !== nextId
        ? designer.routes.map((route) => (route.zoneId === previousId ? { ...route, zoneId: nextId } : route))
        : designer.routes
    });
    if (nextId !== previousId) setSelection({ type: "zone", id: nextId });
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
    const width = Math.max(8, Math.round(activeViewport.width * 0.22));
    const height = Math.max(6, Math.round(activeViewport.height * 0.22));
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
    const width = Math.max(12, Math.round(activeViewport.width * 0.28));
    const height = Math.max(8, Math.round(activeViewport.height * 0.28));
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

  function addRoutePoint(routeId: string) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    const last = route?.points[route.points.length - 1] ?? { x: 0, y: 0 };
    if (!route) return;
    patchRoute(routeId, { points: [...route.points, { x: last.x + designer.snapCm, y: last.y }] });
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
              output: controllerPort + 1,
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
      const ledRoute = sourceRoute.kind === "led_string" ? sourceRoute : targetRoute;
      const dataRoute = sourceRoute.kind === "data_cable" ? sourceRoute : targetRoute;
      updateDesigner({
        ...designer,
        routes: moveRouteTerminals(routeSet, [source, target], solderPoint).map((route) => (
          route.id === dataRoute.id ? { ...route, output: ledRoute.output } : route
        ))
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
    if (selection.type === "zone" && designer.zones.length > 1) {
      const zones = designer.zones.filter((zone) => zone.id !== selection.id);
      const fallbackZoneId = zones[0]?.id ?? "";
      updateDesigner({
        ...designer,
        zones,
        routes: designer.routes.map((route) => (route.zoneId === selection.id ? { ...route, zoneId: fallbackZoneId } : route))
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
    if (selection && (selection.type === "zone" || selection.type === "route")) setClipboard(selection);
  }

  function pasteSelection() {
    if (!clipboard) return;
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
    void save(nextDocument);
  }

  const selectedRouteSummary = selectedRoute ? routeSummaries.find((_, index) => designer.routes[index]?.id === selectedRoute.id) : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="outline" type="button">
            <Link href={`/partituras/generator/${encodeURIComponent(partitura.id)}`}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="truncate text-body-sm font-semibold">{partitura.name}</div>
            <div className="font-mono text-[10px] uppercase text-slate-500">{partitura.partituraKey}</div>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <ToolbarField label="Ruler">
          <select className="h-8 rounded-md border bg-white px-2 text-body-sm" value={designer.rulerUnit} onChange={(event) => patchDesigner({ rulerUnit: event.target.value as DesignerForm["rulerUnit"] })}>
            <option value="cm">cm</option>
            <option value="in">inches</option>
          </select>
        </ToolbarField>
        <label className="flex h-8 items-center gap-2 rounded-md border bg-white px-2 text-body-sm">
          <input type="checkbox" checked={designer.rulerVisible} onChange={(event) => patchDesigner({ rulerVisible: event.target.checked })} />
          Ruler
        </label>
        <ToolbarNumber label="W" value={designer.canvasWidthCm} suffix="cm" onChange={(canvasWidthCm) => patchDesigner({ canvasWidthCm })} />
        <ToolbarNumber label="H" value={designer.canvasHeightCm} suffix="cm" onChange={(canvasHeightCm) => patchDesigner({ canvasHeightCm })} />
        <ToolbarNumber label="Pixels/m" value={designer.addressablePixelsPerMeter} onChange={(addressablePixelsPerMeter) => patchDesigner({ addressablePixelsPerMeter, ledDensityPerMeter: addressablePixelsPerMeter })} />
        <ToolbarNumber label="LEDs/m" value={designer.ledsPerMeter} onChange={(ledsPerMeter) => patchDesigner({ ledsPerMeter })} />
        <ToolbarNumber label="Snap" value={designer.snapCm} suffix="cm" onChange={(snapCm) => patchDesigner({ snapCm })} />
        <Badge>{totalGeneratedPixels} px</Badge>
        <Badge>{formatDecimal(ledsPerAddressablePixel)} LEDs/px</Badge>
        <Badge>{designer.sourceSvg ? "Reference loaded" : "Reference pending"}</Badge>
        <Badge>{fabricationNotice}</Badge>
        <div className="h-8 w-px bg-slate-200" />
        {selectedBuildArea ? (
          <>
            <ToolbarText label="Name" value={selectedBuildArea.name} onChange={(name) => patchBuildArea(selectedBuildArea.id, { name })} />
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border bg-white px-2 text-body-sm" value={selectedBuildArea.shape} onChange={(event) => patchBuildArea(selectedBuildArea.id, { shape: event.target.value as DesignerBuildAreaForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedBuildAreaPointIndex === "number" && selectedBuildArea.points?.[selectedBuildAreaPointIndex] ? (
              <>
                <Badge>Point {selectedBuildAreaPointIndex + 1}</Badge>
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
        ) : selectedZone ? (
          <>
            <ToolbarText label="Name" value={selectedZone.name} onChange={(name) => patchZone(selectedZone.id, { name })} />
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border bg-white px-2 text-body-sm" value={selectedZone.shape} onChange={(event) => patchZone(selectedZone.id, { shape: event.target.value as DesignerZoneForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedZonePointIndex === "number" && selectedZone.points?.[selectedZonePointIndex] ? (
              <>
                <Badge>Point {selectedZonePointIndex + 1}</Badge>
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
        ) : selectedController ? (
          <>
            <ToolbarText label="Name" value={selectedController.name} onChange={(name) => patchController({ name })} />
            <ToolbarNumber label="X" value={selectedController.x} onChange={(x) => patchController({ x })} />
            <ToolbarNumber label="Y" value={selectedController.y} onChange={(y) => patchController({ y })} />
            <ToolbarNumber label="Ports" value={selectedController.dataOutputs} onChange={(dataOutputs) => patchController({ dataOutputs: Math.max(1, Math.round(dataOutputs)) })} />
            <Badge>Controller</Badge>
          </>
        ) : selectedRoute ? (
          <>
            <ToolbarText label="Name" value={selectedRoute.name} onChange={(name) => patchRoute(selectedRoute.id, { name })} />
            <ToolbarField label="Type">
              <select className="h-8 rounded-md border bg-white px-2 text-body-sm" value={selectedRoute.kind} onChange={(event) => patchRoute(selectedRoute.id, { kind: event.target.value as DesignerRouteKind })}>
                <option value="led_string">LED string</option>
                <option value="data_cable">Data cable</option>
              </select>
            </ToolbarField>
            <ToolbarField label="Output">
              <select className="h-8 rounded-md border bg-white px-2 text-body-sm" value={selectedRoute.output} onChange={(event) => patchRoute(selectedRoute.id, { output: Number(event.target.value) })}>
                <option value="1">Out 1</option>
                <option value="2">Out 2</option>
                <option value="3">Out 3</option>
              </select>
            </ToolbarField>
            {selectedRoute.kind === "led_string" ? (
              <ToolbarField label="Zone">
                <select className="h-8 max-w-[160px] rounded-md border bg-white px-2 text-body-sm" value={selectedRoute.zoneId} onChange={(event) => patchRoute(selectedRoute.id, { zoneId: event.target.value })}>
                  {designer.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                </select>
              </ToolbarField>
            ) : null}
            <Badge>{formatMeasure(selectedRouteSummary?.lengthCm ?? 0, designer.rulerUnit)}</Badge>
            <Badge>{selectedRoute.kind === "data_cable" ? "Signal only" : `${selectedRouteSummary?.pixels ?? 0} px · ${selectedRouteSummary?.leds ?? 0} LEDs`}</Badge>
            <Button type="button" variant="outline" onClick={() => addRoutePoint(selectedRoute.id)}>
              <Plus className="h-4 w-4" />
              End
            </Button>
            <Button type="button" variant="outline" disabled={typeof selectedRoutePointIndex !== "number" || selectedRoutePointIndex <= 0 || selectedRoutePointIndex >= selectedRoute.points.length - 1} onClick={() => deleteRoutePoint(selectedRoute.id, selectedRoutePointIndex ?? -1)}>
              <Trash2 className="h-4 w-4" />
              Point
            </Button>
            <Button type="button" variant="outline" disabled={typeof selectedRoutePointIndex !== "number" || selectedRoutePointIndex <= 0 || selectedRoutePointIndex >= selectedRoute.points.length - 1} onClick={() => splitRoute(selectedRoute.id, selectedRoutePointIndex ?? -1)}>
              <Cable className="h-4 w-4" />
              Cut
            </Button>
          </>
        ) : (
          <span className="text-body-sm text-slate-500">Select an object to edit its properties.</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant={layersPanelOpen ? "default" : "outline"} title="Layers" className="h-9 px-3" onClick={() => setLayersPanelOpen((open) => !open)}>
            <Layers className="h-4 w-4" />
            Layers
          </Button>
          <Button type="button" variant="outline" title="Copy" className="h-9 w-9 px-0" disabled={!selection || selection.type === "controller" || selection.type === "build_area"} onClick={copySelection}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" title="Paste" className="h-9 px-2" disabled={!clipboard} onClick={pasteSelection}>
            Paste
          </Button>
          <Button type="button" variant="outline" title="Delete" className="h-9 w-9 px-0" disabled={!selection || selection.type === "controller" || (selection.type === "build_area" && (designer.layers.reference.locked || Boolean(selectedBuildArea?.locked))) || (selection.type === "zone" && designer.layers.zones.locked) || (selection.type === "route" && designer.layers.strings.locked)} onClick={deleteSelection}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" onClick={() => void save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </Button>
          <Button type="button" onClick={compileLayout} disabled={saving}>
            <Cable className="h-4 w-4" />
            Compile
          </Button>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 ${layersPanelOpen ? "grid-cols-[56px_minmax(0,1fr)_320px]" : "grid-cols-[56px_minmax(0,1fr)]"}`}>
        <aside className="flex flex-col items-center gap-2 border-r border-slate-300 bg-white py-3">
          <ToolButton active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
          {activeLayer === "reference" ? (
            <>
              <ToolButton active={tool === "build_area_rect"} label="Rectangle Build Area" icon={Square} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => addBuildArea("rect")} />
              <ToolButton active={tool === "build_area_ellipse"} label="Ellipse Build Area" icon={Circle} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => addBuildArea("ellipse")} />
              <ToolButton active={tool === "build_area_polygon"} label="Polygon Build Area" icon={PenLine} disabled={designer.layers.reference.locked || !designer.layers.reference.visible} onClick={() => setTool("build_area_polygon")} />
            </>
          ) : null}
          {activeLayer === "zones" ? (
            <>
              <ToolButton active={tool === "zone_rect"} label="Rectangle Zone" icon={Square} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => addZone("rect")} />
              <ToolButton active={tool === "zone_ellipse"} label="Ellipse Zone" icon={Circle} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => addZone("ellipse")} />
              <ToolButton active={tool === "zone_polygon"} label="Polygon Zone" icon={PenLine} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_polygon")} />
            </>
          ) : null}
          {activeLayer === "strings" ? (
            <>
              <ToolButton active={tool === "led_string"} label="LED string" icon={Route} tone="amber" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("led_string")} />
              <ToolButton active={tool === "data_cable"} label="Data cable" icon={Cable} tone="green" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("data_cable")} />
              <ToolButton active={tool === "cut"} label="Cut route" icon={Scissors} disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("cut")} />
            </>
          ) : null}
          <ToolButton label="Delete selected" icon={Trash2} disabled={!selection || selection.type === "controller" || (selection.type === "build_area" && (designer.layers.reference.locked || Boolean(selectedBuildArea?.locked))) || (selection.type === "zone" && designer.layers.zones.locked) || (selection.type === "route" && designer.layers.strings.locked)} onClick={deleteSelection} />
          <ToolButton active={tool === "pan"} label="Pan" icon={Hand} onClick={() => setTool("pan")} />
          <div className="my-2 h-px w-8 bg-slate-200" />
          <ToolButton label="Zoom In" icon={ZoomIn} onClick={() => zoom(0.78)} />
          <ToolButton label="Zoom Out" icon={ZoomOut} onClick={() => zoom(1.28)} />
          <ToolButton label="Fit" icon={Maximize2} onClick={zoomToFit} />
        </aside>

        <main className="min-w-0 overflow-hidden bg-slate-900 p-4">
          <DesignerStudioCanvas
            designer={designer}
            activeLayer={activeLayer}
            tool={tool}
            onToolChange={setTool}
            viewport={activeViewport}
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
          />
        </main>
        {layersPanelOpen ? (
          <DesignerLayersPanel
            designer={designer}
            activeLayer={activeLayer}
            selection={selection}
            routeSummaries={routeSummaries}
            onActivateLayer={activateDesignerLayer}
            onPatchLayer={patchDesignerLayer}
            onPatchBuildArea={patchBuildAreaVisual}
            onPatchZone={patchZoneVisual}
            onSelect={selectDesignerItem}
            onClose={() => setLayersPanelOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

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

function DesignerStudioCanvas({
  designer,
  activeLayer,
  tool,
  onToolChange,
  viewport,
  selectedBuildAreaId,
  selectedBuildAreaPointIndex,
  selectedZoneId,
  selectedZonePointIndex,
  selectedRouteId,
  selectedRoutePointIndex,
  selectedController,
  onViewportChange,
  onChange,
  onSelect,
  onInsertBuildAreaPoint,
  onInsertZonePoint,
  onInsertRoutePoint,
  onCutRoutePoint,
  onRoutePointDragEnd,
  onSolderedTerminalsDragEnd
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer;
  tool: DesignerTool;
  onToolChange: (tool: DesignerTool) => void;
  viewport: DesignerViewport;
  selectedBuildAreaId?: string;
  selectedBuildAreaPointIndex?: number;
  selectedZoneId?: string;
  selectedZonePointIndex?: number;
  selectedRouteId?: string;
  selectedRoutePointIndex?: number;
  selectedController?: boolean;
  onViewportChange: (viewport: DesignerViewport) => void;
  onChange: (designer: DesignerForm) => void;
  onSelect: (selection: DesignerSelection) => void;
  onInsertBuildAreaPoint: (buildAreaId: string, insertIndex: number, point: DesignerPoint) => void;
  onInsertZonePoint: (zoneId: string, insertIndex: number, point: DesignerPoint) => void;
  onInsertRoutePoint: (routeId: string, point: DesignerPoint) => void;
  onCutRoutePoint: (routeId: string, pointIndex: number) => void;
  onRoutePointDragEnd: (routeId: string, pointIndex: number, finalPoint: DesignerPoint) => void;
  onSolderedTerminalsDragEnd: (terminals: DesignerRouteTerminal[], finalPoint: DesignerPoint) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DesignerDrag | null>(null);
  const [routeDraft, setRouteDraft] = useState<DesignerRouteDraft | null>(null);
  const [shapeDraft, setShapeDraft] = useState<DesignerShapeDraft | null>(null);
  const viewBox = `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`;
  const rulerGrid = designer.rulerVisible ? "grid-cols-[48px_minmax(0,1fr)] grid-rows-[28px_minmax(0,1fr)]" : "grid-cols-[0_minmax(0,1fr)] grid-rows-[0_minmax(0,1fr)]";

  useEffect(() => {
    if (activeLayer !== "strings" || (tool !== "led_string" && tool !== "data_cable")) setRouteDraft(null);
  }, [activeLayer, tool]);

  useEffect(() => {
    const drawingReferencePolygon = activeLayer === "reference" && tool === "build_area_polygon";
    const drawingZonePolygon = activeLayer === "zones" && tool === "zone_polygon";
    if (!drawingReferencePolygon && !drawingZonePolygon) setShapeDraft(null);
  }, [activeLayer, tool]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRouteDraft(null);
        setShapeDraft(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  function eventPoint(event: React.PointerEvent<SVGElement> | React.MouseEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function patchZone(zoneId: string, patch: Partial<DesignerZoneForm>) {
    onChange({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchRoute(routeId: string, patch: Partial<DesignerRouteForm>) {
    onChange({ ...designer, routes: designer.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route)) });
  }

  function handleRouteDrawClick(event: React.PointerEvent<SVGSVGElement>, kind: DesignerRouteKind) {
    if (activeLayer !== "strings" || designer.layers.strings.locked || !designer.layers.strings.visible) return;
    const rawPoint = eventPoint(event);
    const point = { x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) };
    const activeDraft = routeDraft?.kind === kind ? routeDraft : null;

    if (!activeDraft) {
      setRouteDraft({ kind, points: [point] });
      onSelect(null);
      return;
    }

    if (activeDraft.points.length === 1) {
      if (sameSnapPoint(activeDraft.points[0], point, designer.snapCm)) return;
      const route = createRouteFromDraft(kind, activeDraft.points[0], point, designer);
      onChange({ ...designer, routes: [...designer.routes, route] });
      setRouteDraft({ kind, routeId: route.id, points: route.points });
      onSelect({ type: "route", id: route.id, pointIndex: route.points.length - 1 });
      return;
    }

    const route = designer.routes.find((entry) => entry.id === activeDraft.routeId);
    if (!route || sameSnapPoint(route.points[route.points.length - 1], point, designer.snapCm)) return;
    const points = [...route.points, point];
    onChange({
      ...designer,
      routes: designer.routes.map((entry) => (entry.id === route.id ? { ...entry, points } : entry))
    });
    setRouteDraft({ kind, routeId: route.id, points });
    onSelect({ type: "route", id: route.id, pointIndex: points.length - 1 });
  }

  function handleShapeDrawClick(event: React.PointerEvent<SVGSVGElement>) {
    const target = tool === "build_area_polygon" ? "build_area" : tool === "zone_polygon" ? "zone" : null;
    if (!target) return;
    if (target === "build_area" && (activeLayer !== "reference" || designer.layers.reference.locked || !designer.layers.reference.visible)) return;
    if (target === "zone" && (activeLayer !== "zones" || designer.layers.zones.locked || !designer.layers.zones.visible)) return;

    const rawPoint = eventPoint(event);
    const point = { x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) };
    const activeDraft = shapeDraft?.target === target ? shapeDraft : null;
    const points = activeDraft?.points ?? [];

    if (points.length >= 3 && sameSnapPoint(points[0], point, designer.snapCm)) {
      const polygonPoints = points.map((entry) => ({ x: entry.x, y: entry.y }));
      const bounds = pointsBounds(polygonPoints);
      if (!bounds) return;
      if (target === "build_area") {
        const next = designer.buildAreas.length + 1;
        const buildArea: DesignerBuildAreaForm = {
          id: `build_area_${next}`,
          name: next === 1 ? "Build Area" : `Build Area ${next}`,
          shape: "polygon",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          points: polygonPoints,
          visible: true,
          locked: false,
          opacity: 1
        };
        onChange({ ...designer, buildAreas: [...designer.buildAreas, buildArea] });
        onSelect({ type: "build_area", id: buildArea.id });
      } else {
        const next = designer.zones.length + 1;
        const zone: DesignerZoneForm = {
          id: `zone_${next}`,
          name: `Zone ${next}`,
          shape: "polygon",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          points: polygonPoints,
          visible: true,
          locked: false,
          opacity: 1
        };
        onChange({ ...designer, zones: [...designer.zones, zone] });
        onSelect({ type: "zone", id: zone.id });
      }
      setShapeDraft(null);
      onToolChange("select");
      return;
    }

    setShapeDraft({ target, points: [...points, point] });
    onSelect(null);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const point = eventPoint(event);
    if (drag.type === "pan") {
      const scaleX = viewport.width / Math.max(1, svgRef.current?.clientWidth ?? 1);
      const scaleY = viewport.height / Math.max(1, svgRef.current?.clientHeight ?? 1);
      onViewportChange(clampViewport({
        ...drag.original,
        x: drag.original.x - (event.clientX - drag.start.x) * scaleX,
        y: drag.original.y - (event.clientY - drag.start.y) * scaleY
      }, designer));
      return;
    }
    if (drag.type === "build-area-move") {
      onChange({
        ...designer,
        buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === drag.buildAreaId ? movedShape(drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm) : buildArea))
      });
      return;
    }
    if (drag.type === "build-area-resize") {
      onChange({
        ...designer,
        buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === drag.buildAreaId ? resizedBuildArea(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm) : buildArea))
      });
      return;
    }
    if (drag.type === "build-area-point") {
      onChange({
        ...designer,
        buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === drag.buildAreaId ? updatePolygonPoint(buildArea, drag.pointIndex, point, designer.snapCm) : buildArea))
      });
      return;
    }
    if (drag.type === "controller-move") {
      const nextController = {
        ...designer.controller,
        x: snapValue(drag.original.x + point.x - drag.start.x, designer.snapCm),
        y: snapValue(drag.original.y + point.y - drag.start.y, designer.snapCm)
      };
      onChange(moveControllerWithSolderedCables(designer, drag.original, nextController, drag.originalRoutes, designer.snapCm));
      return;
    }
    if (drag.type === "zone-move") {
      patchZone(drag.zoneId, movedShape(drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm));
      return;
    }
    if (drag.type === "zone-resize") {
      patchZone(drag.zoneId, resizedZone(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm));
      return;
    }
    if (drag.type === "zone-point") {
      const zone = designer.zones.find((entry) => entry.id === drag.zoneId);
      if (zone) patchZone(drag.zoneId, updatePolygonPoint(zone, drag.pointIndex, point, designer.snapCm));
      return;
    }
    if (drag.type === "route-move") {
      onChange({
        ...designer,
        routes: moveRouteWithSolderedTerminals(designer, drag.routeId, drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm)
      });
      return;
    }
    if (drag.type === "route-point") {
      const nextPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm), joint: drag.jointGroup.length > 1 };
      if (drag.jointGroup.length > 1) {
        onChange({ ...designer, routes: moveRouteTerminals(designer.routes, drag.jointGroup, nextPoint) });
        return;
      }
      onChange({ ...designer, routes: moveRoutePoint(designer.routes, drag.routeId, drag.pointIndex, nextPoint) });
    }
  }

  function startPanDrag(event: React.PointerEvent<SVGElement>) {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setDrag({ type: "pan", start: { x: event.clientX, y: event.clientY }, original: viewport });
  }

  return (
    <div className={`grid h-full w-full ${rulerGrid} overflow-hidden rounded-md border border-slate-700 bg-slate-950`}>
      <div className={designer.rulerVisible ? "border-b border-r border-slate-700 bg-slate-900" : "overflow-hidden"} />
      {designer.rulerVisible ? <HorizontalRuler viewport={viewport} unit={designer.rulerUnit} /> : <div className="overflow-hidden" />}
      {designer.rulerVisible ? <VerticalRuler viewport={viewport} unit={designer.rulerUnit} /> : <div className="overflow-hidden" />}
      <div className="min-h-0 min-w-0 overflow-hidden bg-slate-950">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className={`block h-full w-full bg-slate-950 ${drag?.type === "pan" ? "cursor-grabbing" : tool === "pan" ? "cursor-grab" : tool === "led_string" || tool === "data_cable" || tool === "build_area_polygon" || tool === "zone_polygon" ? "cursor-crosshair" : "cursor-default"}`}
        role="img"
        aria-label="Designer studio canvas"
        onPointerDown={(event) => {
          if (tool === "build_area_polygon" || tool === "zone_polygon") {
            handleShapeDrawClick(event);
            return;
          }
          if (tool === "led_string" || tool === "data_cable") {
            handleRouteDrawClick(event, tool);
            return;
          }
          if (tool === "pan" || tool === "select") {
            onSelect(null);
            startPanDrag(event);
            return;
          }
          onSelect(null);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          const endedDrag = drag;
          const point = eventPoint(event);
          const finalPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm), joint: false };
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          setDrag(null);
          if (endedDrag?.type === "route-point" && endedDrag.jointGroup.length > 1) {
            onSolderedTerminalsDragEnd(endedDrag.jointGroup, { ...finalPoint, joint: true });
            return;
          }
          if (endedDrag?.type === "route-point") onRoutePointDragEnd(endedDrag.routeId, endedDrag.pointIndex, finalPoint);
        }}
      >
        <defs>
          <marker id="designer-route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="2.2" markerHeight="2.2" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e2e8f0" />
          </marker>
        </defs>
        <rect x="0" y="0" width={designer.canvasWidthCm} height={designer.canvasHeightCm} fill="#020617" />
        <GridLines width={designer.canvasWidthCm} height={designer.canvasHeightCm} snapCm={designer.snapCm} />
        {shapeDraft ? <ShapeDraftPreview draft={shapeDraft} /> : null}
        {designer.layers.reference.visible ? (
          <g opacity={designer.layers.reference.opacity} pointerEvents={activeLayer === "reference" && !designer.layers.reference.locked ? "auto" : "none"}>
            {designer.buildAreas.map((buildArea) => (
              buildArea.visible ? (
                <g key={buildArea.id} opacity={buildArea.opacity} pointerEvents={buildArea.locked ? "none" : "auto"}>
                  <BuildAreaShape
                    buildArea={buildArea}
                    selected={selectedBuildAreaId === buildArea.id}
                    selectedPointIndex={selectedBuildAreaId === buildArea.id ? selectedBuildAreaPointIndex : undefined}
                    onPointerDown={(event) => {
                      if (tool === "pan") {
                        startPanDrag(event);
                        return;
                      }
                      if (activeLayer !== "reference") return;
                      event.stopPropagation();
                      const point = eventPoint(event);
                      onSelect({ type: "build_area", id: buildArea.id });
                      setDrag({ type: "build-area-move", buildAreaId: buildArea.id, start: point, original: buildArea });
                    }}
                    onResizePointerDown={(event, handle) => {
                      if (tool === "pan") {
                        startPanDrag(event);
                        return;
                      }
                      if (activeLayer !== "reference") return;
                      event.stopPropagation();
                      const point = eventPoint(event);
                      onSelect({ type: "build_area", id: buildArea.id });
                      setDrag({ type: "build-area-resize", buildAreaId: buildArea.id, handle, start: point, original: buildArea });
                    }}
                    onPointPointerDown={(event, pointIndex) => {
                      if (tool === "pan") {
                        startPanDrag(event);
                        return;
                      }
                      if (activeLayer !== "reference") return;
                      event.stopPropagation();
                      onSelect({ type: "build_area", id: buildArea.id, pointIndex });
                      setDrag({ type: "build-area-point", buildAreaId: buildArea.id, pointIndex });
                    }}
                    onSegmentDoubleClick={(event, insertIndex) => {
                      if (activeLayer !== "reference") return;
                      event.stopPropagation();
                      onInsertBuildAreaPoint(buildArea.id, insertIndex, eventPoint(event));
                    }}
                  />
                </g>
              ) : null
            ))}
            {designer.sourceSvg && designer.buildAreas[0] ? <SvgReference sourceSvg={designer.sourceSvg} buildArea={designer.buildAreas[0]} opacity={0.85} /> : null}
          </g>
        ) : null}
        {designer.layers.zones.visible ? (
          <g opacity={designer.layers.zones.opacity} pointerEvents={activeLayer === "zones" && !designer.layers.zones.locked ? "auto" : "none"}>
            {designer.zones.map((zone, index) => (
              zone.visible ? (
                <g key={`${zone.id}:${index}`} opacity={zone.opacity} pointerEvents={zone.locked ? "none" : "auto"}>
                  <ZoneShape
                  zone={zone}
                  selected={zone.id === selectedZoneId}
                  selectedPointIndex={zone.id === selectedZoneId ? selectedZonePointIndex : undefined}
                  onPointerDown={(event) => {
	                    if (tool === "pan") {
	                      startPanDrag(event);
	                      return;
	                    }
                    if (activeLayer !== "zones") return;
	                    event.stopPropagation();
                    const point = eventPoint(event);
                    onSelect({ type: "zone", id: zone.id });
                      setDrag({ type: "zone-move", zoneId: zone.id, start: point, original: zone });
                    }}
                   onResizePointerDown={(event, handle) => {
	                      if (tool === "pan") {
	                        startPanDrag(event);
	                        return;
	                      }
                      if (activeLayer !== "zones") return;
	                      event.stopPropagation();
                      const point = eventPoint(event);
                      onSelect({ type: "zone", id: zone.id });
                      setDrag({ type: "zone-resize", zoneId: zone.id, handle, start: point, original: zone });
                    }}
                    onPointPointerDown={(event, pointIndex) => {
                      if (tool === "pan") {
                        startPanDrag(event);
                        return;
                      }
                      if (activeLayer !== "zones") return;
                      event.stopPropagation();
                      onSelect({ type: "zone", id: zone.id, pointIndex });
                      setDrag({ type: "zone-point", zoneId: zone.id, pointIndex });
                    }}
                    onSegmentDoubleClick={(event, insertIndex) => {
                      if (activeLayer !== "zones") return;
                      event.stopPropagation();
                      onInsertZonePoint(zone.id, insertIndex, eventPoint(event));
                    }}
                  />
                </g>
              ) : null
            ))}
          </g>
        ) : null}
        {designer.layers.strings.visible ? (
          <g opacity={designer.layers.strings.opacity} pointerEvents={activeLayer === "strings" && !designer.layers.strings.locked ? "auto" : "none"}>
            {designer.routes.map((route, index) => (
              <RouteShape
                key={`${route.id}:${index}`}
                route={route}
                addressablePixelsPerMeter={designer.addressablePixelsPerMeter}
                ledsPerMeter={designer.ledsPerMeter}
                selected={route.id === selectedRouteId}
                selectedPointIndex={route.id === selectedRouteId ? selectedRoutePointIndex : undefined}
                onPointerDown={(event) => {
	                  if (tool === "pan") {
	                    startPanDrag(event);
	                    return;
	                  }
                  if (activeLayer !== "strings") return;
	                  event.stopPropagation();
                  const point = eventPoint(event);
                  onSelect({ type: "route", id: route.id });
                  setDrag({ type: "route-move", routeId: route.id, start: point, original: route });
                }}
	                onDoubleClick={(event) => {
                  if (activeLayer !== "strings") return;
	                  event.stopPropagation();
                  onInsertRoutePoint(route.id, eventPoint(event));
                }}
                onPointPointerDown={(event, pointIndex) => {
	                  if (tool === "pan") {
	                    startPanDrag(event);
	                    return;
	                  }
                  if (activeLayer !== "strings") return;
	                  event.stopPropagation();
                  if (tool === "cut") {
                    onCutRoutePoint(route.id, pointIndex);
                    return;
                  }
                  const routePoint = route.points[pointIndex];
                  const jointGroup = routePoint?.joint ? findJointGroup(designer.routes, route.id, pointIndex, designer.snapCm) : [{ routeId: route.id, pointIndex }];
                  onSelect({ type: "route", id: route.id, pointIndex });
                  setDrag({ type: "route-point", routeId: route.id, pointIndex, jointGroup });
                }}
              />
            ))}
            {routeDraft?.points.length === 1 ? <RouteDraftStart point={routeDraft.points[0]} kind={routeDraft.kind} /> : null}
            <ControllerShape
              controller={designer.controller}
              snapCm={designer.snapCm}
              connectedPorts={controllerConnectedPorts(designer.controller, designer.routes, designer.snapCm)}
              selected={Boolean(selectedController)}
              onPointerDown={(event) => {
	                if (tool === "pan") {
	                  startPanDrag(event);
	                  return;
	                }
                if (activeLayer !== "strings") return;
	                event.stopPropagation();
                const point = eventPoint(event);
                onSelect({ type: "controller", id: designer.controller.id });
                setDrag({ type: "controller-move", start: point, original: designer.controller, originalRoutes: designer.routes });
              }}
            />
          </g>
        ) : null}
      </svg>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  icon: Icon,
  active = false,
  tone = "blue",
  disabled = false,
  onClick
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  tone?: "blue" | "amber" | "green";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const activeClass = {
    blue: "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200",
    amber: "border-amber-500 bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-200",
    green: "border-emerald-500 bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200"
  }[tone];
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? activeClass : "border-transparent bg-white text-slate-700 hover:bg-slate-100"}`}
    >
      {active ? <span className="absolute -right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-current ring-2 ring-white" /> : null}
      {(tone === "amber" || tone === "green") && !active ? <span className={`absolute bottom-1 h-1.5 w-5 rounded-full ${tone === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} /> : null}
      <Icon className="h-5 w-5" />
    </button>
  );
}

function DesignerLayersPanel({
  designer,
  activeLayer,
  selection,
  routeSummaries,
  onActivateLayer,
  onPatchLayer,
  onPatchBuildArea,
  onPatchZone,
  onSelect,
  onClose
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer;
  selection: DesignerSelection;
  routeSummaries: Array<ReturnType<typeof summarizeRoute>>;
  onActivateLayer: (layer: DesignerActiveLayer) => void;
  onPatchLayer: (layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) => void;
  onPatchBuildArea: (buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "visible" | "locked" | "opacity">>) => void;
  onPatchZone: (zoneId: string, patch: Partial<Pick<DesignerZoneForm, "visible" | "locked" | "opacity">>) => void;
  onSelect: (selection: DesignerSelection) => void;
  onClose: () => void;
}) {
  const [expandedLayers, setExpandedLayers] = useState<Record<DesignerActiveLayer, boolean>>({
    reference: activeLayer === "reference",
    zones: activeLayer === "zones",
    strings: activeLayer === "strings"
  });

  function activateLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: true }));
    onActivateLayer(layer);
  }

  function toggleLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  return (
    <aside className="flex min-h-0 flex-col border-l border-slate-300 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-3">
        <div className="flex items-center gap-2 text-body-sm font-semibold">
          <Layers className="h-4 w-4 text-blue-700" />
          Layers
        </div>
        <button type="button" title="Close layers" className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onClose}>
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        <LayerPanelSection
          label="Reference"
          active={activeLayer === "reference"}
          expanded={expandedLayers.reference}
          layer={designer.layers.reference}
          onActivate={() => activateLayer("reference")}
          onToggle={() => toggleLayer("reference")}
          onChange={(patch) => onPatchLayer("reference", patch)}
        >
          {designer.buildAreas.map((buildArea) => (
            <LayerChildRow
              key={buildArea.id}
              label={buildArea.name}
              detail={`${buildArea.shape} · ${formatDecimal(buildArea.width)}x${formatDecimal(buildArea.height)} cm`}
              selected={selection?.type === "build_area" && selection.id === buildArea.id}
              muted={!buildArea.visible}
              locked={buildArea.locked}
              visible={buildArea.visible}
              opacity={buildArea.opacity}
              onClick={() => {
                activateLayer("reference");
                onSelect({ type: "build_area", id: buildArea.id });
              }}
              onVisibleChange={(visible) => onPatchBuildArea(buildArea.id, { visible })}
              onLockedChange={(locked) => onPatchBuildArea(buildArea.id, { locked })}
              onOpacityChange={(opacity) => onPatchBuildArea(buildArea.id, { opacity })}
            />
          ))}
          <LayerChildRow
            label="Reference Art"
            detail={designer.sourceSvg ? "Loaded" : "Pending"}
            muted={!designer.sourceSvg}
            onClick={() => activateLayer("reference")}
          />
        </LayerPanelSection>

        <LayerPanelSection
          label="Zones"
          active={activeLayer === "zones"}
          expanded={expandedLayers.zones}
          layer={designer.layers.zones}
          onActivate={() => activateLayer("zones")}
          onToggle={() => toggleLayer("zones")}
          onChange={(patch) => onPatchLayer("zones", patch)}
        >
          {designer.zones.map((zone) => (
            <LayerChildRow
              key={zone.id}
              label={zone.name}
              detail={`${zone.shape} · ${formatDecimal(zone.width)}x${formatDecimal(zone.height)} cm`}
              selected={selection?.type === "zone" && selection.id === zone.id}
              muted={!zone.visible}
              locked={zone.locked}
              visible={zone.visible}
              opacity={zone.opacity}
              onClick={() => {
                activateLayer("zones");
                onSelect({ type: "zone", id: zone.id });
              }}
              onVisibleChange={(visible) => onPatchZone(zone.id, { visible })}
              onLockedChange={(locked) => onPatchZone(zone.id, { locked })}
              onOpacityChange={(opacity) => onPatchZone(zone.id, { opacity })}
            />
          ))}
        </LayerPanelSection>

        <LayerPanelSection
          label="Strings"
          active={activeLayer === "strings"}
          expanded={expandedLayers.strings}
          layer={designer.layers.strings}
          onActivate={() => activateLayer("strings")}
          onToggle={() => toggleLayer("strings")}
          onChange={(patch) => onPatchLayer("strings", patch)}
        >
          <LayerChildRow
            label={designer.controller.name}
            detail={`${designer.controller.dataOutputs} outputs`}
            selected={selection?.type === "controller"}
            onClick={() => {
              activateLayer("strings");
              onSelect({ type: "controller", id: designer.controller.id });
            }}
          />
          {designer.routes.map((route, index) => (
            <LayerChildRow
              key={route.id}
              label={route.name}
              detail={route.kind === "data_cable" ? `Out ${route.output} · data cable` : `Out ${route.output} · ${routeSummaries[index]?.pixels ?? 0} px · ${routeSummaries[index]?.leds ?? 0} LEDs`}
              selected={selection?.type === "route" && selection.id === route.id}
              color={route.kind === "data_cable" ? "green" : "amber"}
              onClick={() => {
                activateLayer("strings");
                onSelect({ type: "route", id: route.id });
              }}
            />
          ))}
        </LayerPanelSection>
      </div>
    </aside>
  );
}

function LayerPanelSection({
  label,
  active,
  expanded,
  layer,
  children,
  onActivate,
  onToggle,
  onChange
}: {
  label: string;
  active: boolean;
  expanded: boolean;
  layer: DesignerLayerSettings;
  children: React.ReactNode;
  onActivate: () => void;
  onToggle: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <section className={`overflow-hidden rounded-md border ${active ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-1.5 border-b border-slate-200 p-2">
        <button type="button" title={expanded ? `Collapse ${label}` : `Expand ${label}`} className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-body-sm font-semibold ${active ? "bg-blue-600 text-white" : "text-slate-800 hover:bg-white"}`} onClick={onActivate}>
          {label}
        </button>
        <IconToggle active={layer.visible} label={layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => onChange({ visible: !layer.visible })}>
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconToggle>
        <IconToggle active={layer.locked} label={layer.locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onChange({ locked: !layer.locked })}>
          {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </IconToggle>
      </div>
      {expanded ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] font-medium uppercase text-slate-500">Opacity</span>
            <input className="h-5 flex-1 accent-blue-600" type="range" min="10" max="100" step="5" value={Math.round(layer.opacity * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
            <span className="w-8 text-right font-mono text-[11px] text-slate-500">{Math.round(layer.opacity * 100)}%</span>
          </div>
          <div className="space-y-1 p-2 pt-0">{children}</div>
        </>
      ) : null}
    </section>
  );
}

function LayerChildRow({
  label,
  detail,
  selected,
  muted,
  locked,
  visible,
  opacity,
  color = "slate",
  onClick,
  onVisibleChange,
  onLockedChange,
  onOpacityChange
}: {
  label: string;
  detail: string;
  selected?: boolean;
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
  opacity?: number;
  color?: "slate" | "green" | "amber";
  onClick: () => void;
  onVisibleChange?: (visible: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onOpacityChange?: (opacity: number) => void;
}) {
  const colorClass = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-400" : "bg-slate-400";
  return (
    <div className={`rounded-md border ${selected ? "border-blue-500 bg-white shadow-sm" : "border-transparent bg-white/60 hover:bg-white"} ${muted ? "opacity-55" : ""}`}>
      <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left" onClick={onClick}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-slate-800">{label}</span>
          <span className="block truncate font-mono text-[10px] uppercase text-slate-500">{detail}</span>
        </span>
      </button>
      {(onVisibleChange || onLockedChange || onOpacityChange) ? (
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1">
          {onVisibleChange ? (
            <IconToggle active={visible !== false} label={visible !== false ? `Hide ${label}` : `Show ${label}`} onClick={() => onVisibleChange(!(visible !== false))}>
              {visible !== false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </IconToggle>
          ) : null}
          {onLockedChange ? (
            <IconToggle active={Boolean(locked)} label={locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onLockedChange(!locked)}>
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </IconToggle>
          ) : null}
          {onOpacityChange ? (
            <>
              <input className="h-5 min-w-0 flex-1 accent-blue-600" type="range" min="10" max="100" step="5" value={Math.round((opacity ?? 1) * 100)} onChange={(event) => onOpacityChange(Number(event.target.value) / 100)} />
              <span className="w-8 text-right font-mono text-[10px] text-slate-500">{Math.round((opacity ?? 1) * 100)}%</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconToggle({ active, label, children, onClick }: { active: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded border transition ${active ? "border-blue-300 bg-white text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400 hover:bg-white"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LayerToggle({
  label,
  active,
  layer,
  onActivate,
  onChange
}: {
  label: string;
  active: boolean;
  layer: DesignerLayerSettings;
  onActivate: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={`flex h-8 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-body-sm transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      <span className={`px-1 text-[11px] font-semibold uppercase ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
      <button
        type="button"
        title={layer.visible ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={layer.visible}
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layer.visible ? active ? "border-white/60 bg-white/20 text-white" : "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange({ visible: !layer.visible });
        }}
      >
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title={layer.locked ? `Unlock ${label}` : `Lock ${label}`}
        aria-pressed={layer.locked}
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layer.locked ? "border-amber-500 bg-amber-100 text-amber-800" : active ? "border-white/50 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange({ locked: !layer.locked });
        }}
      >
        {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        title={`${label} opacity`}
        min="10"
        max="100"
        step="5"
        value={Math.round(layer.opacity * 100)}
        className="h-6 w-14 accent-blue-600"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
      />
    </div>
  );
}

function ToolbarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ToolbarText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <ToolbarField label={label}>
      <input className="h-8 w-40 rounded-md border bg-white px-2 text-body-sm outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={(event) => onChange(event.target.value)} />
    </ToolbarField>
  );
}

function ToolbarNumber({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <ToolbarField label={label}>
      <div className="flex h-8 items-center rounded-md border bg-white">
        <input className="h-full w-16 rounded-md bg-transparent px-2 text-right font-mono text-body-sm outline-none" type="number" step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix ? <span className="pr-2 text-[11px] text-slate-500">{suffix}</span> : null}
      </div>
    </ToolbarField>
  );
}

function HorizontalRuler({ viewport, unit }: { viewport: DesignerViewport; unit: DesignerForm["rulerUnit"] }) {
  const ticks = rulerTicks(viewport.x, viewport.x + viewport.width, viewport.width, unit);
  return (
    <div className="relative h-full w-full overflow-hidden border-b border-slate-700 bg-slate-900">
      {ticks.map((tick) => (
        <div key={`${tick.cm}-${tick.major ? "major" : "minor"}`} className="absolute bottom-0" style={{ left: `${((tick.cm - viewport.x) / viewport.width) * 100}%` }}>
          <div className={tick.major ? "h-5 border-l border-slate-200" : "h-2.5 border-l border-slate-500"} />
          {tick.major ? <div className="absolute left-1 top-0 whitespace-nowrap font-mono text-[15px] leading-none text-slate-200">{tick.label}</div> : null}
        </div>
      ))}
    </div>
  );
}

function VerticalRuler({ viewport, unit }: { viewport: DesignerViewport; unit: DesignerForm["rulerUnit"] }) {
  const ticks = rulerTicks(viewport.y, viewport.y + viewport.height, viewport.height, unit);
  return (
    <div className="relative h-full w-full overflow-hidden border-r border-slate-700 bg-slate-900">
      {ticks.map((tick) => (
        <div key={`${tick.cm}-${tick.major ? "major" : "minor"}`} className="absolute right-0" style={{ top: `${((tick.cm - viewport.y) / viewport.height) * 100}%` }}>
          <div className={tick.major ? "w-6 border-t border-slate-200" : "w-3 border-t border-slate-500"} />
          {tick.major ? (
            <div className="absolute right-9 top-[-7px] origin-right -rotate-90 whitespace-nowrap font-mono text-[15px] leading-none text-slate-200">
              {tick.label}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function GridLines({ width, height, snapCm }: { width: number; height: number; snapCm: number }) {
  const step = Math.max(1, snapCm);
  const verticals = Array.from({ length: Math.floor(width / step) + 1 }, (_, index) => index * step);
  const horizontals = Array.from({ length: Math.floor(height / step) + 1 }, (_, index) => index * step);
  return (
    <g opacity="0.22">
      {verticals.map((x) => <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={height} stroke="#64748b" strokeWidth="0.08" />)}
      {horizontals.map((y) => <line key={`h-${y}`} x1={0} y1={y} x2={width} y2={y} stroke="#64748b" strokeWidth="0.08" />)}
    </g>
  );
}

function ShapeDraftPreview({ draft }: { draft: DesignerShapeDraft }) {
  const stroke = draft.target === "build_area" ? "#93c5fd" : "#38bdf8";
  return (
    <g pointerEvents="none">
      <polyline
        points={shapePointsString(draft.points)}
        fill="none"
        stroke={stroke}
        strokeDasharray="1.4 1"
        strokeWidth="0.34"
      />
      {draft.points.length > 2 ? <line x1={draft.points[draft.points.length - 1].x} y1={draft.points[draft.points.length - 1].y} x2={draft.points[0].x} y2={draft.points[0].y} stroke={stroke} strokeDasharray="0.8 1.2" strokeWidth="0.18" /> : null}
      {draft.points.map((point, index) => (
        <circle key={`${draft.target}-draft-${index}`} cx={point.x} cy={point.y} r={index === 0 ? "0.85" : "0.65"} fill={index === 0 ? "#22c55e" : "#f8fafc"} stroke={stroke} strokeWidth="0.2" />
      ))}
    </g>
  );
}

function BuildAreaShape({
  buildArea,
  selected,
  selectedPointIndex,
  onPointerDown,
  onResizePointerDown,
  onPointPointerDown,
  onSegmentDoubleClick
}: {
  buildArea: DesignerBuildAreaForm;
  selected: boolean;
  selectedPointIndex?: number;
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
  onResizePointerDown: (event: React.PointerEvent<SVGCircleElement>, handle: ResizeHandle) => void;
  onPointPointerDown: (event: React.PointerEvent<SVGCircleElement>, pointIndex: number) => void;
  onSegmentDoubleClick: (event: React.MouseEvent<SVGLineElement>, insertIndex: number) => void;
}) {
  const handles: Array<{ handle: ResizeHandle; x: number; y: number }> = [
    { handle: "nw", x: buildArea.x, y: buildArea.y },
    { handle: "ne", x: buildArea.x + buildArea.width, y: buildArea.y },
    { handle: "sw", x: buildArea.x, y: buildArea.y + buildArea.height },
    { handle: "se", x: buildArea.x + buildArea.width, y: buildArea.y + buildArea.height }
  ];
  const common = {
    fill: "rgba(59,130,246,0.06)",
    stroke: selected ? "#60a5fa" : "#93c5fd",
    strokeDasharray: "1.4 0.9",
    strokeWidth: selected ? 0.42 : 0.24,
    onPointerDown
  };
  return (
    <g>
      {buildArea.shape === "polygon" && buildArea.points ? (
        <polygon points={shapePointsString(buildArea.points)} {...common} />
      ) : buildArea.shape === "ellipse" ? (
        <ellipse cx={buildArea.x + buildArea.width / 2} cy={buildArea.y + buildArea.height / 2} rx={buildArea.width / 2} ry={buildArea.height / 2} {...common} />
      ) : (
        <rect x={buildArea.x} y={buildArea.y} width={buildArea.width} height={buildArea.height} {...common} />
      )}
      <text x={buildArea.x + 1.2} y={buildArea.y + 2.5} fill="#bfdbfe" fontSize="1.7" fontFamily="monospace" pointerEvents="none">
        {buildArea.name} {formatDecimal(buildArea.width)}x{formatDecimal(buildArea.height)} cm
      </text>
      {selected && buildArea.shape === "polygon" && buildArea.points ? polygonSegments(buildArea.points).map((segment) => (
        <line
          key={`${buildArea.id}-segment-hit-${segment.insertIndex}`}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke="transparent"
          strokeWidth="2.2"
          pointerEvents="stroke"
          onDoubleClick={(event) => onSegmentDoubleClick(event, segment.insertIndex)}
        />
      )) : null}
      {selected ? handles.map((handle) => (
        <circle
          key={handle.handle}
          cx={handle.x}
          cy={handle.y}
          r="0.85"
          className="cursor-nwse-resize"
          fill="#eff6ff"
          stroke="#2563eb"
          strokeWidth="0.25"
          onPointerDown={(event) => onResizePointerDown(event, handle.handle)}
        />
      )) : null}
      {selected && buildArea.shape === "polygon" && buildArea.points ? buildArea.points.map((point, index) => (
        <circle
          key={`${buildArea.id}-point-${index}`}
          cx={point.x}
          cy={point.y}
          r={selectedPointIndex === index ? "1" : "0.75"}
          className="cursor-move"
          fill={selectedPointIndex === index ? "#facc15" : "#f8fafc"}
          stroke={selectedPointIndex === index ? "#0f172a" : "#2563eb"}
          strokeWidth="0.25"
          onPointerDown={(event) => onPointPointerDown(event, index)}
        />
      )) : null}
    </g>
  );
}

function ZoneShape({
  zone,
  selected,
  selectedPointIndex,
  onPointerDown,
  onResizePointerDown,
  onPointPointerDown,
  onSegmentDoubleClick
}: {
  zone: DesignerZoneForm;
  selected: boolean;
  selectedPointIndex?: number;
  onPointerDown: (event: React.PointerEvent<SVGElement>) => void;
  onResizePointerDown: (event: React.PointerEvent<SVGCircleElement>, handle: ResizeHandle) => void;
  onPointPointerDown: (event: React.PointerEvent<SVGCircleElement>, pointIndex: number) => void;
  onSegmentDoubleClick: (event: React.MouseEvent<SVGLineElement>, insertIndex: number) => void;
}) {
  const common = {
    fill: selected ? "rgba(14,165,233,0.24)" : "rgba(148,163,184,0.12)",
    stroke: selected ? "#38bdf8" : "#64748b",
    strokeWidth: selected ? 0.45 : 0.25,
    onPointerDown
  };
  const handles: Array<{ handle: ResizeHandle; x: number; y: number }> = [
    { handle: "nw", x: zone.x, y: zone.y },
    { handle: "ne", x: zone.x + zone.width, y: zone.y },
    { handle: "sw", x: zone.x, y: zone.y + zone.height },
    { handle: "se", x: zone.x + zone.width, y: zone.y + zone.height }
  ];
  const shape = zone.shape === "polygon" && zone.points
    ? <polygon points={shapePointsString(zone.points)} {...common} />
    : zone.shape === "ellipse"
    ? <ellipse cx={zone.x + zone.width / 2} cy={zone.y + zone.height / 2} rx={zone.width / 2} ry={zone.height / 2} {...common} />
    : <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="0.8" {...common} />;
  return (
    <g>
      {shape}
      {selected && zone.shape === "polygon" && zone.points ? polygonSegments(zone.points).map((segment) => (
        <line
          key={`${zone.id}-segment-hit-${segment.insertIndex}`}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke="transparent"
          strokeWidth="2.2"
          pointerEvents="stroke"
          onDoubleClick={(event) => onSegmentDoubleClick(event, segment.insertIndex)}
        />
      )) : null}
      {selected ? handles.map((handle) => (
        <circle
          key={handle.handle}
          cx={handle.x}
          cy={handle.y}
          r="0.85"
          className="cursor-nwse-resize"
          fill="#f8fafc"
          stroke="#2563eb"
          strokeWidth="0.25"
          onPointerDown={(event) => onResizePointerDown(event, handle.handle)}
        />
      )) : null}
      {selected && zone.shape === "polygon" && zone.points ? zone.points.map((point, index) => (
        <circle
          key={`${zone.id}-point-${index}`}
          cx={point.x}
          cy={point.y}
          r={selectedPointIndex === index ? "1" : "0.75"}
          className="cursor-move"
          fill={selectedPointIndex === index ? "#facc15" : "#f8fafc"}
          stroke={selectedPointIndex === index ? "#0f172a" : "#2563eb"}
          strokeWidth="0.25"
          onPointerDown={(event) => onPointPointerDown(event, index)}
        />
      )) : null}
    </g>
  );
}

function ControllerShape({
  controller,
  snapCm,
  connectedPorts,
  selected,
  onPointerDown
}: {
  controller: DesignerControllerForm;
  snapCm: number;
  connectedPorts: Set<number>;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
}) {
  const ports = Array.from({ length: controller.dataOutputs }, (_, index) => index);
  return (
    <g className="cursor-move" onPointerDown={onPointerDown}>
      <rect
        x={controller.x}
        y={controller.y}
        width={controller.width}
        height={controller.height}
        rx="0.9"
        fill="#064e3b"
        stroke={selected ? "#facc15" : "#34d399"}
        strokeWidth={selected ? 0.45 : 0.25}
      />
      <rect
        x={controller.x + controller.width * 0.18}
        y={controller.y + controller.height * 0.18}
        width={controller.width * 0.46}
        height={controller.height * 0.64}
        rx="0.45"
        fill="#0f172a"
        stroke="#6ee7b7"
        strokeWidth="0.14"
      />
      <line x1={controller.x + controller.width * 0.3} y1={controller.y + controller.height * 0.32} x2={controller.x + controller.width * 0.52} y2={controller.y + controller.height * 0.32} stroke="#475569" strokeWidth="0.12" />
      <line x1={controller.x + controller.width * 0.3} y1={controller.y + controller.height * 0.5} x2={controller.x + controller.width * 0.52} y2={controller.y + controller.height * 0.5} stroke="#475569" strokeWidth="0.12" />
      <line x1={controller.x + controller.width * 0.3} y1={controller.y + controller.height * 0.68} x2={controller.x + controller.width * 0.52} y2={controller.y + controller.height * 0.68} stroke="#475569" strokeWidth="0.12" />
      <text x={controller.x + controller.width * 0.1} y={controller.y - 0.9} fill="#a7f3d0" fontSize="1.8" fontFamily="monospace">
        {controller.name}
      </text>
      {ports.map((port) => {
        const portPoint = controllerPortPoint(controller, port, snapCm);
        const y = portPoint.y;
        const connected = connectedPorts.has(port);
        return (
          <g key={port}>
            {connected ? <circle cx={portPoint.x} cy={y} r="0.78" fill="none" stroke="#22d3ee" strokeWidth="0.18" /> : null}
            <circle cx={portPoint.x} cy={y} r={connected ? "0.5" : "0.24"} fill={connected ? "#22d3ee" : "#ef4444"} stroke="#020617" strokeWidth={connected ? "0.22" : "0.1"} />
            <polygon
              points={`${portPoint.x - 2.15},${y - 0.52} ${portPoint.x - 1.2},${y} ${portPoint.x - 2.15},${y + 0.52}`}
              fill={connected ? "#22d3ee" : "#fecaca"}
              stroke="#020617"
              strokeWidth="0.08"
              pointerEvents="none"
            />
            <text x={portPoint.x - 2.6} y={y + 0.45} fill="#d1fae5" fontSize="1.25" fontFamily="monospace">
              {port + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function SvgReference({ sourceSvg, buildArea, opacity }: { sourceSvg: string; buildArea: DesignerBuildAreaForm; opacity: number }) {
  return (
    <foreignObject x={buildArea.x} y={buildArea.y} width={buildArea.width} height={buildArea.height} opacity={opacity} pointerEvents="none">
      <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: sourceSvg }} />
    </foreignObject>
  );
}

function RouteDraftStart({ point, kind }: { point: DesignerPoint; kind: DesignerRouteKind }) {
  const stroke = kind === "data_cable" ? "#86efac" : "#fde68a";
  return (
    <g pointerEvents="none">
      <circle cx={point.x} cy={point.y} r="0.78" fill="none" stroke={stroke} strokeDasharray="0.45 0.32" strokeWidth="0.18" />
      <circle cx={point.x} cy={point.y} r="0.36" fill="#22c55e" stroke="#020617" strokeWidth="0.12" />
    </g>
  );
}

function RouteShape({
  route,
  addressablePixelsPerMeter,
  ledsPerMeter,
  selected,
  selectedPointIndex,
  onPointerDown,
  onDoubleClick,
  onPointPointerDown
}: {
  route: DesignerRouteForm;
  addressablePixelsPerMeter: number;
  ledsPerMeter: number;
  selected: boolean;
  selectedPointIndex?: number;
  onPointerDown: (event: React.PointerEvent<SVGPolylineElement>) => void;
  onDoubleClick: (event: React.MouseEvent<SVGPolylineElement>) => void;
  onPointPointerDown: (event: React.PointerEvent<SVGCircleElement>, pointIndex: number) => void;
}) {
  const points = route.points.map((point) => `${point.x},${point.y}`).join(" ");
  const ledDots = route.kind === "led_string" ? sampleRouteLedDots(route, ledsPerMeter, addressablePixelsPerMeter) : [];
  const directionMarkers = routeDirectionMarkers(route);
  return (
    <g>
      <polyline
        points={points}
        fill="none"
        stroke="transparent"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      />
      <polyline
        points={points}
        fill="none"
        stroke={selected ? routeSelectedColor(route.kind) : routeColor(route)}
        strokeWidth={route.kind === "data_cable" ? (selected ? 0.42 : 0.26) : 0.18}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#designer-route-arrow)"
        pointerEvents="none"
      />
      {ledDots.map((dot, index) => (
        <circle
          key={`led-${index}`}
          cx={dot.x}
          cy={dot.y}
          r={selected ? 0.48 : 0.4}
          fill={selected ? "#facc15" : "#f59e0b"}
          opacity={dot.addressableIndex % 2 === 0 ? 1 : 0.82}
          stroke={dot.addressableIndex % 2 === 0 ? "#020617" : "#78350f"}
          strokeWidth="0.1"
          pointerEvents="none"
        />
      ))}
      {directionMarkers.map((marker, index) => (
        <g key={`direction-${index}`} transform={`translate(${marker.x} ${marker.y}) rotate(${marker.angle})`} pointerEvents="none">
          <polygon
            points="-0.85,-0.58 0.95,0 -0.85,0.58 -0.28,0 -0.85,-0.58"
            fill={route.kind === "data_cable" ? "#bbf7d0" : "#fde68a"}
            stroke="#020617"
            strokeWidth="0.08"
          />
        </g>
      ))}
      {route.points.map((point, index) => (
        <g key={index}>
          {point.joint ? (
            <circle
              cx={point.x}
              cy={point.y}
              r="0.78"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="0.18"
              pointerEvents="none"
            />
          ) : null}
          <circle
            cx={point.x}
            cy={point.y}
            r="1.05"
            className="cursor-grab active:cursor-grabbing"
            fill="transparent"
            onPointerDown={(event) => onPointPointerDown(event, index)}
          />
          <circle
            cx={point.x}
            cy={point.y}
            r={point.joint ? 0.5 : selectedPointIndex === index ? 0.42 : selected ? 0.32 : 0.24}
            pointerEvents="none"
            fill={routePointFill(route, index, point, selectedPointIndex === index)}
            stroke="#020617"
            strokeWidth={point.joint ? "0.22" : selectedPointIndex === index ? "0.18" : "0.1"}
          />
        </g>
      ))}
    </g>
  );
}

function resizedZone(zone: DesignerZoneForm, handle: ResizeHandle, deltaX: number, deltaY: number, snapCm: number): Partial<DesignerZoneForm> {
  const minSize = Math.max(1, snapCm);
  let x = zone.x;
  let y = zone.y;
  let width = zone.width;
  let height = zone.height;

  if (handle.includes("w")) {
    x = snapValue(zone.x + deltaX, snapCm);
    width = zone.width + zone.x - x;
  }
  if (handle.includes("e")) width = zone.width + deltaX;
  if (handle.includes("n")) {
    y = snapValue(zone.y + deltaY, snapCm);
    height = zone.height + zone.y - y;
  }
  if (handle.includes("s")) height = zone.height + deltaY;

  const next = {
    x,
    y,
    width: Math.max(minSize, snapValue(width, snapCm)),
    height: Math.max(minSize, snapValue(height, snapCm))
  };
  return zone.shape === "polygon" && zone.points ? { ...next, points: scaleShapePoints(zone, next) } : next;
}

function resizedBuildArea(buildArea: DesignerBuildAreaForm, handle: ResizeHandle, deltaX: number, deltaY: number, snapCm: number): DesignerBuildAreaForm {
  const next = resizedZone(buildArea, handle, deltaX, deltaY, snapCm);
  return {
    ...buildArea,
    x: next.x ?? buildArea.x,
    y: next.y ?? buildArea.y,
    width: next.width ?? buildArea.width,
    height: next.height ?? buildArea.height
  };
}

function snapValue(value: number, snapCm: number) {
  const step = Math.max(0.1, snapCm);
  return Math.round(value / step) * step;
}

function movedShape<T extends { x: number; y: number; points?: DesignerPoint[] }>(shape: T, deltaX: number, deltaY: number, snapCm: number): T {
  const x = snapValue(shape.x + deltaX, snapCm);
  const y = snapValue(shape.y + deltaY, snapCm);
  const pointDeltaX = x - shape.x;
  const pointDeltaY = y - shape.y;
  return {
    ...shape,
    x,
    y,
    points: shape.points?.map((point) => ({ x: point.x + pointDeltaX, y: point.y + pointDeltaY }))
  };
}

function updatePolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, pointIndex: number, point: DesignerPoint, snapCm: number): T {
  if (!shape.points?.[pointIndex]) return shape;
  const points = shape.points.map((entry, index) => (index === pointIndex ? { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry));
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
}

function insertPolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, insertIndex: number, point: DesignerPoint, snapCm: number): T {
  if (!shape.points || shape.points.length < 3) return shape;
  const nextPoint = { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) };
  const clampedIndex = clamp(Math.round(insertIndex), 0, shape.points.length);
  const points = [...shape.points.slice(0, clampedIndex), nextPoint, ...shape.points.slice(clampedIndex)];
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
}

function deletePolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, pointIndex: number): T {
  if (!shape.points || shape.points.length <= 3 || !shape.points[pointIndex]) return shape;
  const points = shape.points.filter((_, index) => index !== pointIndex);
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
}

function scaleShapePoints(shape: { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }, next: { x: number; y: number; width: number; height: number }) {
  if (!shape.points) return undefined;
  const scaleX = next.width / Math.max(0.001, shape.width);
  const scaleY = next.height / Math.max(0.001, shape.height);
  return shape.points.map((point) => ({
    x: next.x + (point.x - shape.x) * scaleX,
    y: next.y + (point.y - shape.y) * scaleY
  }));
}

function pointsBounds(points: DesignerPoint[]) {
  if (!points.length) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: Math.max(0.1, maxX - minX), height: Math.max(0.1, maxY - minY) };
}

function rectanglePoints(shape: { x: number; y: number; width: number; height: number }) {
  return [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
    { x: shape.x, y: shape.y + shape.height }
  ];
}

function shapePointsString(points: DesignerPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function polygonSegments(points: DesignerPoint[]) {
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
    insertIndex: index + 1
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rulerTicks(startCm: number, endCm: number, spanCm: number, unit: DesignerForm["rulerUnit"]) {
  const targetMajorTicks = 8;
  const majorStep = niceRulerStep(spanCm / targetMajorTicks, unit);
  const minorStep = majorStep / 5;
  const first = Math.floor(startCm / minorStep) * minorStep;
  const ticks: Array<{ cm: number; major: boolean; label: string }> = [];

  for (let cm = first; cm <= endCm + minorStep; cm += minorStep) {
    const majorIndex = Math.round(cm / majorStep);
    const major = Math.abs(cm - majorIndex * majorStep) < minorStep * 0.08;
    ticks.push({
      cm,
      major,
      label: major ? formatRulerLabel(majorIndex * majorStep, unit) : ""
    });
  }

  return ticks;
}

function niceRulerStep(rawStepCm: number, unit: DesignerForm["rulerUnit"]) {
  if (unit === "in") {
    const rawIn = Math.max(0.25, rawStepCm / 2.54);
    const stepIn = niceNumber(rawIn);
    return stepIn * 2.54;
  }

  if (rawStepCm >= 100) return niceNumber(rawStepCm / 100) * 100;
  return niceNumber(Math.max(1, rawStepCm));
}

function niceNumber(value: number) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

function formatRulerLabel(valueCm: number, unit: DesignerForm["rulerUnit"]) {
  if (unit === "in") {
    const inches = valueCm / 2.54;
    if (Math.abs(inches) >= 12 && Math.abs(inches % 12) < 0.01) return `${Math.round(inches / 12)} ft`;
    if (Math.abs(inches) >= 120) return `${(inches / 12).toFixed(1)} ft`;
    return `${Math.round(inches)} in`;
  }

  if (Math.abs(valueCm) >= 100) {
    const meters = valueCm / 100;
    return Number.isInteger(meters) ? `${meters} m` : `${meters.toFixed(1)} m`;
  }
  return `${Math.round(valueCm)} cm`;
}

function formatMeasure(valueCm: number, unit: DesignerForm["rulerUnit"]) {
  if (unit === "in") return `${formatDecimal(valueCm / 2.54)} in`;
  return `${formatDecimal(valueCm)} cm`;
}

function formatDecimal(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function routeColor(route: DesignerRouteForm) {
  if (route.kind === "data_cable") return "#22c55e";
  return "#f59e0b";
}

function routeSelectedColor(kind: DesignerRouteKind) {
  return kind === "data_cable" ? "#86efac" : "#facc15";
}

function createRouteFromDraft(kind: DesignerRouteKind, start: DesignerPoint, end: DesignerPoint, designer: DesignerForm): DesignerRouteForm {
  const next = nextRouteNumber(designer.routes);
  return {
    id: `route_${next}`,
    name: kind === "data_cable" ? `Data cable ${next}` : `LED string ${next}`,
    kind,
    output: 1,
    zoneId: designer.zones[0]?.id ?? "",
    points: [start, end]
  };
}

function nextRouteNumber(routes: DesignerRouteForm[]) {
  const used = new Set(routes.map((route) => route.id));
  for (let index = routes.length + 1; index < routes.length + 1000; index += 1) {
    if (!used.has(`route_${index}`)) return index;
  }
  return Date.now();
}

function routePointFill(route: DesignerRouteForm, pointIndex: number, point: DesignerPoint, selected: boolean) {
  if (point.joint) return "#22d3ee";
  if (pointIndex === 0) return "#22c55e";
  if (pointIndex === route.points.length - 1) return "#ef4444";
  return selected ? "#c084fc" : "#a78bfa";
}

function summarizeRoute(route: DesignerRouteForm, designer: DesignerForm) {
  const lengthCm = routeLengthCm(route);
  const pixels = route.kind === "led_string" ? Math.max(0, Math.round(lengthCm * designer.addressablePixelsPerMeter / 100)) : 0;
  const leds = route.kind === "led_string" ? Math.max(0, Math.round(lengthCm * designer.ledsPerMeter / 100)) : 0;
  return {
    lengthCm,
    pixels,
    leds
  };
}

function routeLengthCm(route: DesignerRouteForm) {
  return route.points.slice(1).reduce((total, point, index) => {
    const previous = route.points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function routeDirectionMarkers(route: DesignerRouteForm) {
  const markers: Array<{ x: number; y: number; angle: number }> = [];
  route.points.slice(1).forEach((point, pointIndex) => {
    const previous = route.points[pointIndex];
    const lengthCm = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (lengthCm < 4) return;
    const count = Math.max(1, Math.floor(lengthCm / 28));
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
    for (let index = 0; index < count; index += 1) {
      const ratio = (index + 1) / (count + 1);
      markers.push({
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
        angle
      });
    }
  });
  return markers;
}

function isRouteTerminal(route: DesignerRouteForm, pointIndex: number) {
  return pointIndex === 0 || pointIndex === route.points.length - 1;
}

function moveRoutePoint(routes: DesignerRouteForm[], routeId: string, pointIndex: number, point: DesignerPoint) {
  return routes.map((route) => {
    if (route.id !== routeId) return route;
    return {
      ...route,
      points: route.points.map((routePoint, index) => index === pointIndex ? { ...routePoint, ...point } : routePoint)
    };
  });
}

function moveRouteTerminals(routes: DesignerRouteForm[], terminals: DesignerRouteTerminal[], point: DesignerPoint) {
  const terminalKeys = new Set(terminals.map((terminal) => `${terminal.routeId}:${terminal.pointIndex}`));
  return routes.map((route) => ({
    ...route,
    points: route.points.map((routePoint, index) => (
      terminalKeys.has(`${route.id}:${index}`) ? { ...routePoint, ...point } : routePoint
    ))
  }));
}

function moveRouteWithSolderedTerminals(designer: DesignerForm, routeId: string, originalRoute: DesignerRouteForm, deltaX: number, deltaY: number, snapCm: number) {
  const routes = designer.routes;
  const controllerPortIndex = originalRoute.kind === "data_cable" && originalRoute.points[0]?.joint
    ? findControllerPortAtPoint(designer.controller, originalRoute.points[0], snapCm)
    : null;
  const controllerAnchor = controllerPortIndex !== null ? controllerPortPoint(designer.controller, controllerPortIndex, snapCm) : null;
  const movedPoints = originalRoute.points.map((routePoint) => ({
    ...routePoint,
    x: snapValue(routePoint.x + deltaX, snapCm),
    y: snapValue(routePoint.y + deltaY, snapCm)
  }));
  if (controllerAnchor) {
    movedPoints[0] = { ...movedPoints[0], ...controllerAnchor, joint: true };
  }
  const solderedTerminals = [0, originalRoute.points.length - 1].flatMap((pointIndex) => {
    if (!originalRoute.points[pointIndex]?.joint) return [];
    return findJointGroup(routes, routeId, pointIndex, snapCm)
      .filter((terminal) => terminal.routeId !== routeId || terminal.pointIndex !== pointIndex)
      .map((terminal) => ({ ...terminal, point: movedPoints[pointIndex] }));
  });

  return routes.map((route) => {
    if (route.id === routeId) return { ...route, points: movedPoints };
    const routeTerminals = solderedTerminals.filter((terminal) => terminal.routeId === route.id);
    if (!routeTerminals.length) return route;
    return {
      ...route,
      points: route.points.map((point, index) => {
        const matchingTerminal = routeTerminals.find((terminal) => terminal.pointIndex === index);
        return matchingTerminal ? { ...point, ...matchingTerminal.point, joint: true } : point;
      })
    };
  });
}

function canSolderRoutes(sourceRoute: DesignerRouteForm, sourcePointIndex: number, targetRoute: DesignerRouteForm, targetPointIndex: number, snapCm: number) {
  if (!isRouteTerminal(sourceRoute, sourcePointIndex) || !isRouteTerminal(targetRoute, targetPointIndex)) return false;
  if (!sameSnapPoint(sourceRoute.points[sourcePointIndex], targetRoute.points[targetPointIndex], snapCm)) return false;
  const sourceRole = routeTerminalRole(sourcePointIndex);
  const targetRole = routeTerminalRole(targetPointIndex);
  return sourceRole !== targetRole;
}

function clearFloatingTerminalJoints(routes: DesignerRouteForm[], controller: DesignerControllerForm, snapCm: number) {
  return routes.map((route) => ({
    ...route,
    points: route.points.map((point, pointIndex) => {
      if (!point.joint || !isRouteTerminal(route, pointIndex)) return point;
      if (route.kind === "data_cable" && pointIndex === 0 && findControllerPortAtPoint(controller, point, snapCm) !== null) return point;
      const connectedToRoute = routes.some((candidateRoute) => {
        if (candidateRoute.id === route.id) return false;
        return [0, candidateRoute.points.length - 1].some((candidateIndex) => {
          const candidatePoint = candidateRoute.points[candidateIndex];
          if (!candidatePoint?.joint) return false;
          return routeTerminalRole(pointIndex) !== routeTerminalRole(candidateIndex) && sameSnapPoint(point, candidatePoint, snapCm);
        });
      });
      return connectedToRoute ? point : { ...point, joint: false };
    })
  }));
}

function routeTerminalRole(pointIndex: number) {
  return pointIndex === 0 ? "input" : "output";
}

function controllerPortPoint(controller: DesignerControllerForm, portIndex: number, snapCm: number) {
  const portSpacing = controller.height / (controller.dataOutputs + 1);
  return {
    x: snapValue(controller.x + controller.width, snapCm),
    y: snapValue(controller.y + portSpacing * (portIndex + 1), snapCm)
  };
}

function controllerConnectedPorts(controller: DesignerControllerForm, routes: DesignerRouteForm[], snapCm: number) {
  const connectedPorts = new Set<number>();
  routes.filter((route) => route.kind === "data_cable").forEach((route) => {
    const terminal = route.points[0];
    if (!terminal?.joint) return;
    for (let portIndex = 0; portIndex < controller.dataOutputs; portIndex += 1) {
      if (sameSnapPoint(terminal, controllerPortPoint(controller, portIndex, snapCm), snapCm)) {
        connectedPorts.add(portIndex);
      }
    }
  });
  return connectedPorts;
}

function findMatchingControllerPort(controller: DesignerControllerForm, routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
  const route = routes.find((entry) => entry.id === routeId);
  if (!route || route.kind !== "data_cable" || pointIndex !== 0) return null;
  return findControllerPortAtPoint(controller, route.points[pointIndex], snapCm);
}

function findControllerPortAtPoint(controller: DesignerControllerForm, point: DesignerPoint, snapCm: number) {
  for (let portIndex = 0; portIndex < controller.dataOutputs; portIndex += 1) {
    if (sameSnapPoint(point, controllerPortPoint(controller, portIndex, snapCm), snapCm)) return portIndex;
  }
  return null;
}

function moveControllerWithSolderedCables(designer: DesignerForm, originalController: DesignerControllerForm, nextController: DesignerControllerForm, originalRoutes: DesignerRouteForm[], snapCm: number) {
  const portMoves = Array.from({ length: originalController.dataOutputs }, (_, portIndex) => ({
    from: controllerPortPoint(originalController, portIndex, snapCm),
    to: controllerPortPoint(nextController, portIndex, snapCm)
  }));
  const connectedCableMoves = originalRoutes.flatMap((route) => {
    if (route.kind !== "data_cable") return [];
    const terminal = route.points[0];
    if (!terminal?.joint) return [];
    const matchingPortMove = portMoves.find((portMove) => sameSnapPoint(terminal, portMove.from, snapCm));
    return matchingPortMove ? [{ routeId: route.id, point: matchingPortMove.to }] : [];
  });

  return {
    ...designer,
    controller: nextController,
    routes: designer.routes.map((route) => {
      if (route.kind !== "data_cable") return route;
      const matchingCableMove = connectedCableMoves.find((move) => move.routeId === route.id);
      if (!matchingCableMove) return route;
      return {
        ...route,
        points: route.points.map((point, index) => (
          index === 0 ? { ...point, ...matchingCableMove.point, joint: true } : point
        ))
      };
    })
  };
}

function findJointGroup(routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
  const sourceRoute = routes.find((route) => route.id === routeId);
  const sourcePoint = sourceRoute?.points[pointIndex];
  if (!sourceRoute || !sourcePoint) return [{ routeId, pointIndex }];
  const terminals: DesignerRouteTerminal[] = [];

  routes.forEach((route) => {
    [0, route.points.length - 1].forEach((candidateIndex) => {
      const candidatePoint = route.points[candidateIndex];
      if (!candidatePoint?.joint) return;
      if (sameSnapPoint(sourcePoint, candidatePoint, snapCm)) {
        terminals.push({ routeId: route.id, pointIndex: candidateIndex });
      }
    });
  });

  return terminals.some((terminal) => terminal.routeId === routeId && terminal.pointIndex === pointIndex)
    ? terminals
    : [{ routeId, pointIndex }, ...terminals];
}

function findMatchingSolderTerminal(routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
  const sourceRoute = routes.find((route) => route.id === routeId);
  if (!sourceRoute) return null;

  for (const route of routes) {
    if (route.id === routeId) continue;
    for (const candidateIndex of [0, route.points.length - 1]) {
      if (canSolderRoutes(sourceRoute, pointIndex, route, candidateIndex, snapCm)) {
        return { routeId: route.id, pointIndex: candidateIndex };
      }
    }
  }

  return null;
}

function sameSnapPoint(a: DesignerPoint, b: DesignerPoint, snapCm: number) {
  return snapValue(a.x, snapCm) === snapValue(b.x, snapCm) && snapValue(a.y, snapCm) === snapValue(b.y, snapCm);
}

function distanceBetweenPoints(a: DesignerPoint, b: DesignerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function routeBounds(routes: DesignerRouteForm[]) {
  const points = routes.flatMap((route) => route.points);
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function designerBounds(designer: DesignerForm) {
  const routeBox = routeBounds(designer.routes);
  const buildAreaBox = designer.buildAreas.length ? {
    minX: Math.min(...designer.buildAreas.map((buildArea) => buildArea.x)),
    minY: Math.min(...designer.buildAreas.map((buildArea) => buildArea.y)),
    maxX: Math.max(...designer.buildAreas.map((buildArea) => buildArea.x + buildArea.width)),
    maxY: Math.max(...designer.buildAreas.map((buildArea) => buildArea.y + buildArea.height))
  } : null;
  const padding = Math.max(20, designer.snapCm * 8);
  return {
    minX: Math.min(0, routeBox?.minX ?? 0, buildAreaBox?.minX ?? 0, designer.controller.x) - padding,
    minY: Math.min(0, routeBox?.minY ?? 0, buildAreaBox?.minY ?? 0, designer.controller.y) - padding,
    maxX: Math.max(designer.canvasWidthCm, routeBox?.maxX ?? designer.canvasWidthCm, buildAreaBox?.maxX ?? designer.canvasWidthCm, designer.controller.x + designer.controller.width) + padding,
    maxY: Math.max(designer.canvasHeightCm, routeBox?.maxY ?? designer.canvasHeightCm, buildAreaBox?.maxY ?? designer.canvasHeightCm, designer.controller.y + designer.controller.height) + padding
  };
}

function clampViewport(viewport: DesignerViewport, designer: DesignerForm) {
  const bounds = designerBounds(designer);
  const slackX = viewport.width * 0.45;
  const slackY = viewport.height * 0.45;
  const minX = bounds.minX - slackX;
  const minY = bounds.minY - slackY;
  const maxX = Math.max(bounds.maxX - viewport.width + slackX, minX);
  const maxY = Math.max(bounds.maxY - viewport.height + slackY, minY);
  return {
    ...viewport,
    x: clamp(viewport.x, minX, maxX),
    y: clamp(viewport.y, minY, maxY)
  };
}

function fitViewportToDesigner(designer: DesignerForm) {
  const bounds = designerBounds(designer);
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY)
  };
}

function nearestRouteInsertIndex(route: DesignerRouteForm, point: DesignerPoint) {
  let insertIndex = route.points.length;
  let nearestDistance = Number.POSITIVE_INFINITY;

  route.points.slice(1).forEach((end, index) => {
    const start = route.points[index];
    const distance = pointToSegmentDistance(point, start, end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      insertIndex = index + 1;
    }
  });

  return insertIndex;
}

function pointToSegmentDistance(point: DesignerPoint, start: DesignerPoint, end: DesignerPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function sampleRouteLedDots(route: DesignerRouteForm, ledsPerMeter: number, addressablePixelsPerMeter: number) {
  const pitchCm = 100 / Math.max(1, ledsPerMeter);
  const addressablePitchCm = 100 / Math.max(1, addressablePixelsPerMeter);
  const dots: Array<DesignerPoint & { addressableIndex: number }> = [];
  let addressableOffset = 0;
  route.points.slice(1).forEach((point, pointIndex) => {
    const previous = route.points[pointIndex];
    const lengthCm = Math.hypot(point.x - previous.x, point.y - previous.y);
    const ledCount = Math.max(1, Math.round(lengthCm / pitchCm));
    for (let index = 0; index < ledCount; index += 1) {
      const ratio = (index + 0.5) / ledCount;
      const distanceCm = ratio * lengthCm;
      dots.push({
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
        addressableIndex: addressableOffset + Math.floor(distanceCm / addressablePitchCm)
      });
    }
    addressableOffset += Math.max(1, Math.round(lengthCm / addressablePitchCm));
  });
  return dots;
}

function buildDocumentFromDesigner(document: PartituraDocument): PartituraDocument {
  const designer = document.designer;
  if (!designer) return document;

  const outputStarts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const segments: SegmentForm[] = [];
  const zoneSegments = new Map<string, string[]>();
  designer.zones.forEach((zone) => zoneSegments.set(zone.id, []));

  designer.routes.filter((route) => route.kind === "led_string").forEach((route) => {
    route.points.slice(1).forEach((point, pointIndex) => {
      const previous = route.points[pointIndex];
      const lengthCm = Math.hypot(point.x - previous.x, point.y - previous.y);
      const ledCount = Math.max(1, Math.round(lengthCm * designer.addressablePixelsPerMeter / 100));
      const segmentId = `${route.id}_leg_${pointIndex + 1}`;
      const stepX = (point.x - previous.x) / ledCount;
      const stepY = (point.y - previous.y) / ledCount;
      segments.push({
        id: segmentId,
        name: `${route.name} leg ${pointIndex + 1}`,
        output: route.output,
        start: outputStarts[route.output] ?? 0,
        length: ledCount,
        reverse: false,
        x: previous.x + stepX * 0.5,
        y: previous.y + stepY * 0.5,
        stepX,
        stepY
      });
      outputStarts[route.output] = (outputStarts[route.output] ?? 0) + ledCount;
      const routeZoneSegments = zoneSegments.get(route.zoneId) ?? [];
      routeZoneSegments.push(segmentId);
      zoneSegments.set(route.zoneId, routeZoneSegments);
    });
  });

  const zones: ZoneForm[] = designer.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    segments: zoneSegments.get(zone.id) ?? []
  }));
  zones.push({ id: "rotulo_completo", name: "Rotulo completo", segments: segments.map((segment) => segment.id) });

  const validTargets = new Set(zones.map((zone) => zone.id));
  return {
    ...document,
    chain1Pixels: outputStarts[1],
    chain2Pixels: outputStarts[2],
    chain3Pixels: outputStarts[3],
    segments,
    zones,
    scenes: document.scenes.map((scene) => ({
      ...scene,
      clips: scene.clips.map((clip) => validTargets.has(clip.target) ? clip : { ...clip, target: "rotulo_completo" })
    }))
  };
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
