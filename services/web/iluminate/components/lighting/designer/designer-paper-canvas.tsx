"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignerArtworkForm, DesignerBuildAreaForm, DesignerForm, DesignerPoint, DesignerRouteForm, DesignerRouteKind, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { drawPaperAnimationMap, drawPaperDesigner, setPaperScope } from "./designer-paper-renderer";
import type { CompiledDesignerLayout } from "./designer-compiler";
import { HorizontalRuler, VerticalRuler } from "./designer-ui";
import {
  clamp,
  clampViewport,
  createRouteFromDraft,
  findNearbyControllerPort,
  findNearbySolderTerminal,
  findJointGroup,
  movedShape,
  nearestShapeInsertIndex,
  pickBezierHandle,
  pickDesignerHit,
  pickRouteSegmentHit,
  pointInsideDesignerShape,
  pointNearShapeStroke,
  pointsBounds,
  resizedBuildArea,
  resizedZone,
  sameSnapPoint,
  snapValue,
  smoothBezierPoints,
  updatePolygonPoint,
  updateBezierHandle,
  worldHitTolerance,
  moveControllerWithSolderedCables,
  moveRoutePoint,
  moveRouteTerminals,
  moveRouteWithSolderedTerminals,
  normalizeViewportAspect
} from "./designer-geometry";
import type { DesignerActiveLayer, DesignerDrag, DesignerMeasurement, DesignerRouteDraft, DesignerRouteTerminal, DesignerSelection, DesignerShapeDraft, DesignerTool, DesignerViewport, PaperApi, ResizeHandle } from "./types";

export type DesignerAnimationPixel = {
  output: number;
  serialIndex: number;
  color: { r: number; g: number; b: number };
};

export function DesignerStudioCanvas({
  designer,
  activeLayer,
  tool,
  onToolChange,
  viewport,
  artworkUrls,
  selectedBuildAreaId,
  selectedArtworkId,
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
  onSolderedTerminalsDragEnd,
  presentation = "design",
  compiledLayout,
  animationPixels,
  showRulers = designer.rulerVisible
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer;
  tool: DesignerTool;
  onToolChange: (tool: DesignerTool) => void;
  viewport: DesignerViewport;
  artworkUrls: Record<string, string>;
  selectedArtworkId?: string;
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
  presentation?: "design" | "animate";
  compiledLayout?: CompiledDesignerLayout;
  animationPixels?: DesignerAnimationPixel[];
  showRulers?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<PaperApi | null>(null);
  const [paperReady, setPaperReady] = useState(false);
  const [drag, setDrag] = useState<DesignerDrag | null>(null);
  const [routeDraft, setRouteDraft] = useState<DesignerRouteDraft | null>(null);
  const [shapeDraft, setShapeDraft] = useState<DesignerShapeDraft | null>(null);
  const [measurement, setMeasurement] = useState<DesignerMeasurement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [colorMode, setColorMode] = useState<"day" | "night">("night");
  const rulerGrid = showRulers ? "grid-cols-[48px_minmax(0,1fr)] grid-rows-[28px_minmax(0,1fr)]" : "grid-cols-[0_minmax(0,1fr)] grid-rows-[0_minmax(0,1fr)]";

  useEffect(() => {
    const syncColorMode = () => setColorMode(window.document.documentElement.classList.contains("dark") ? "night" : "day");
    syncColorMode();
    const observer = new MutationObserver(syncColorMode);
    observer.observe(window.document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    function activatePaper() {
      if (cancelled || !window.paper) return;
      paperRef.current = window.paper;
      setPaperReady(true);
    }
    if (window.paper) {
      activatePaper();
      return () => {
        cancelled = true;
      };
    }
    const existingScript = window.document.querySelector<HTMLScriptElement>('script[data-iluminate-paper="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", activatePaper, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", activatePaper);
      };
    }
    const script = window.document.createElement("script");
    script.src = "/vendor/paper-core.min.js";
    script.async = true;
    script.dataset.iluminatePaper = "true";
    script.addEventListener("load", activatePaper, { once: true });
    window.document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", activatePaper);
    };
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setCanvasSize({ width, height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canvasSize.width < 1 || canvasSize.height < 1) return;
    const normalized = normalizeViewportAspect(viewport, canvasSize.width / canvasSize.height);
    const hasChanged = Math.abs(normalized.x - viewport.x) > 0.001
      || Math.abs(normalized.y - viewport.y) > 0.001
      || Math.abs(normalized.width - viewport.width) > 0.001
      || Math.abs(normalized.height - viewport.height) > 0.001;
    if (hasChanged) onViewportChange(clampViewport(normalized, designer));
  }, [canvasSize.height, canvasSize.width, designer, onViewportChange, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const loadedPaper = paperRef.current;
    if (!canvas || canvasSize.width < 1 || canvasSize.height < 1 || !paperReady || !loadedPaper?.setup) return;
    setPaperScope(loadedPaper);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    loadedPaper.setup(canvas);
    loadedPaper.view.viewSize = new loadedPaper.Size(canvasSize.width, canvasSize.height);
    if (presentation === "animate" && compiledLayout) drawPaperAnimationMap({ designer, layout: compiledLayout, viewport, selectedZoneId, canvasSize, colorMode, animationPixels });
    else drawPaperDesigner({
      designer,
      activeLayer,
      viewport,
      selectedBuildAreaId,
      selectedBuildAreaPointIndex,
      selectedZoneId,
      selectedZonePointIndex,
      selectedRouteId,
      selectedRoutePointIndex,
      selectedController: Boolean(selectedController),
      routeDraft,
      shapeDraft,
      measurement,
      canvasSize,
      colorMode
    });
    loadedPaper.view.update();
  }, [activeLayer, animationPixels, canvasSize, colorMode, compiledLayout, designer, measurement, paperReady, presentation, routeDraft, selectedBuildAreaId, selectedBuildAreaPointIndex, selectedController, selectedRouteId, selectedRoutePointIndex, selectedZoneId, selectedZonePointIndex, shapeDraft, viewport]);

  useEffect(() => {
    if (activeLayer !== "strings" || (tool !== "led_string" && tool !== "data_cable")) setRouteDraft(null);
  }, [activeLayer, tool]);

  useEffect(() => {
    if (tool !== "measure") setMeasurement(null);
  }, [tool]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRouteDraft(null);
        setShapeDraft(null);
        setMeasurement(null);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  function eventPoint(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = viewport.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewport.width;
    const y = viewport.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewport.height;
    return { x, y };
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cursorRatioX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const cursorRatioY = (event.clientY - rect.top) / Math.max(1, rect.height);
    const anchor = {
      x: viewport.x + cursorRatioX * viewport.width,
      y: viewport.y + cursorRatioY * viewport.height
    };
    const zoomFactor = Math.exp(event.deltaY * 0.0012);
    const nextWidth = clamp(viewport.width * zoomFactor, designer.canvasWidthCm * 0.04, designer.canvasWidthCm * 8);
    const nextHeight = clamp(viewport.height * zoomFactor, designer.canvasHeightCm * 0.04, designer.canvasHeightCm * 8);
    onViewportChange(clampViewport({
      x: anchor.x - cursorRatioX * nextWidth,
      y: anchor.y - cursorRatioY * nextHeight,
      width: nextWidth,
      height: nextHeight
    }, designer));
  }

  function patchZone(zoneId: string, patch: Partial<DesignerZoneForm>) {
    onChange({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchRoute(routeId: string, patch: Partial<DesignerRouteForm>) {
    onChange({ ...designer, routes: designer.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route)) });
  }

  function patchArtwork(artworkId: string, patch: Partial<DesignerArtworkForm>) {
    onChange({ ...designer, artwork: designer.artwork.map((artwork) => (artwork.id === artworkId ? { ...artwork, ...patch } : artwork)) });
  }

  function resizeArtwork(artwork: DesignerArtworkForm, handle: ResizeHandle, deltaX: number, deltaY: number) {
    const minSize = Math.max(2, designer.snapCm);
    let x = artwork.x;
    let y = artwork.y;
    let width = artwork.width;
    let height = artwork.height;
    if (handle.includes("w")) {
      x = snapValue(artwork.x + deltaX, designer.snapCm);
      width = artwork.width + artwork.x - x;
    }
    if (handle.includes("e")) width = artwork.width + deltaX;
    if (handle.includes("n")) {
      y = snapValue(artwork.y + deltaY, designer.snapCm);
      height = artwork.height + artwork.y - y;
    }
    if (handle.includes("s")) height = artwork.height + deltaY;
    return {
      x,
      y,
      width: Math.max(minSize, snapValue(width, designer.snapCm)),
      height: Math.max(minSize, snapValue(height, designer.snapCm))
    };
  }

  function handleRouteDrawClick(event: React.PointerEvent<HTMLCanvasElement>, kind: DesignerRouteKind) {
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

  function handleShapeDrawClick(event: React.PointerEvent<HTMLCanvasElement>) {
    const target = tool === "build_area_polygon" || tool === "build_area_bezier"
      ? "build_area"
      : tool === "zone_polygon" || tool === "zone_bezier"
        ? "zone"
        : null;
    const mode = tool === "build_area_bezier" || tool === "zone_bezier" ? "bezier" : "straight";
    if (!target) return;
    if (target === "build_area" && (activeLayer !== "reference" || designer.layers.reference.locked || !designer.layers.reference.visible)) return;
    if (target === "zone" && (activeLayer !== "zones" || designer.layers.zones.locked || !designer.layers.zones.visible)) return;

    const rawPoint = eventPoint(event);
    const point = { x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) };
    const activeDraft = shapeDraft?.target === target ? shapeDraft : null;
    const points = activeDraft?.points ?? [];
    const draftMode = activeDraft?.mode ?? mode;
    const closesAtVisibleStartNode = points.length >= 3
      && Math.hypot(rawPoint.x - points[0].x, rawPoint.y - points[0].y) <= worldHitTolerance(viewport, canvasSize);

    if (closesAtVisibleStartNode) {
      const polygonPoints: DesignerPoint[] = draftMode === "bezier"
        ? smoothBezierPoints(points)
        : points.map((entry) => ({ ...entry, nodeType: entry.nodeType ?? "corner" as const }));
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
          pathMode: draftMode,
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
          pathMode: draftMode,
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

    setShapeDraft({ target, mode: draftMode, points: [...points, point] });
    onSelect(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "measure" && measurement?.start && !measurement.locked) {
      const point = eventPoint(event);
      setMeasurement({ ...measurement, end: { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) } });
      return;
    }
    if (!drag) return;
    const point = eventPoint(event);
    if (drag.type === "pan") {
      const scaleX = viewport.width / Math.max(1, canvasRef.current?.clientWidth ?? 1);
      const scaleY = viewport.height / Math.max(1, canvasRef.current?.clientHeight ?? 1);
      onViewportChange(clampViewport({
        ...drag.original,
        x: drag.original.x - (event.clientX - drag.start.x) * scaleX,
        y: drag.original.y - (event.clientY - drag.start.y) * scaleY
      }, designer));
      return;
    }
    if (drag.type === "artwork-move") {
      patchArtwork(drag.artworkId, movedShape(drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm));
      return;
    }
    if (drag.type === "artwork-resize") {
      patchArtwork(drag.artworkId, resizeArtwork(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y));
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
        buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === drag.buildAreaId ? resizedBuildArea(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm, { preserveAspect: event.ctrlKey || event.metaKey, fromCenter: event.shiftKey }) : buildArea))
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
    if (drag.type === "build-area-handle") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === drag.buildAreaId);
      if (buildArea) onChange({ ...designer, buildAreas: designer.buildAreas.map((entry) => (entry.id === drag.buildAreaId ? updateBezierHandle(buildArea, drag.pointIndex, drag.handle, point, designer.snapCm) : entry)) });
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
      patchZone(drag.zoneId, resizedZone(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm, { preserveAspect: event.ctrlKey || event.metaKey, fromCenter: event.shiftKey }));
      return;
    }
    if (drag.type === "zone-point") {
      const zone = designer.zones.find((entry) => entry.id === drag.zoneId);
      if (zone) patchZone(drag.zoneId, updatePolygonPoint(zone, drag.pointIndex, point, designer.snapCm));
      return;
    }
    if (drag.type === "zone-handle") {
      const zone = designer.zones.find((entry) => entry.id === drag.zoneId);
      if (zone) patchZone(drag.zoneId, updateBezierHandle(zone, drag.pointIndex, drag.handle, point, designer.snapCm));
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
      const rawPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) };
      const snappedPoint = drag.jointGroup.length > 1 ? rawPoint : snapTerminalPoint(drag.routeId, drag.pointIndex, rawPoint);
      const nextPoint = { ...snappedPoint, joint: drag.jointGroup.length > 1 };
      if (drag.jointGroup.length > 1) {
        onChange({ ...designer, routes: moveRouteTerminals(designer.routes, drag.jointGroup, nextPoint) });
        return;
      }
      onChange({ ...designer, routes: moveRoutePoint(designer.routes, drag.routeId, drag.pointIndex, nextPoint) });
    }
  }

  function startPanDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    setDrag({ type: "pan", start: { x: event.clientX, y: event.clientY }, original: viewport });
  }

  function snapTerminalPoint(routeId: string, pointIndex: number, point: DesignerPoint) {
    const captureRadiusCm = 10 * viewport.width / Math.max(1, canvasSize.width);
    const route = designer.routes.find((entry) => entry.id === routeId);
    const controllerPort = route ? findNearbyControllerPort(designer.controller, route, pointIndex, point, captureRadiusCm, designer.snapCm) : null;
    const solderTarget = !controllerPort ? findNearbySolderTerminal(designer.routes, routeId, pointIndex, point, captureRadiusCm) : null;
    return controllerPort?.point ?? solderTarget?.point ?? point;
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (presentation === "animate") {
      const point = eventPoint(event);
      const tolerance = worldHitTolerance(viewport, canvasSize) * 2;
      const zone = [...designer.zones].reverse().find((candidate) => candidate.visible && (pointInsideDesignerShape(candidate, point) || pointNearShapeStroke(candidate, point, tolerance)));
      if (zone) { onSelect({ type: "zone", id: zone.id }); return; }
      onSelect(null);
      startPanDrag(event);
      return;
    }
    if (tool === "measure") {
      const point = eventPoint(event);
      const measuredPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) };
      if (!measurement || measurement.locked) setMeasurement({ start: measuredPoint });
      else setMeasurement({ ...measurement, end: measuredPoint, locked: true });
      onSelect(null);
      return;
    }
    if (tool === "build_area_polygon" || tool === "build_area_bezier" || tool === "zone_polygon" || tool === "zone_bezier") {
      handleShapeDrawClick(event);
      return;
    }
    if (tool === "led_string" || tool === "data_cable") {
      handleRouteDrawClick(event, tool);
      return;
    }

    const point = eventPoint(event);
    const tolerance = worldHitTolerance(viewport, canvasSize);
    if (activeLayer === "reference" && selectedBuildAreaId && typeof selectedBuildAreaPointIndex === "number") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === selectedBuildAreaId);
      const node = buildArea?.pathMode === "bezier" ? buildArea.points?.[selectedBuildAreaPointIndex] : null;
      const handle = node ? pickBezierHandle(node, point, tolerance) : null;
      if (handle) {
        onSelect({ type: "build_area", id: selectedBuildAreaId, pointIndex: selectedBuildAreaPointIndex });
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ type: "build-area-handle", buildAreaId: selectedBuildAreaId, pointIndex: selectedBuildAreaPointIndex, handle });
        return;
      }
    }
    if (activeLayer === "zones" && selectedZoneId && typeof selectedZonePointIndex === "number") {
      const zone = designer.zones.find((entry) => entry.id === selectedZoneId);
      const node = zone?.pathMode === "bezier" ? zone.points?.[selectedZonePointIndex] : null;
      const handle = node ? pickBezierHandle(node, point, tolerance) : null;
      if (handle) {
        onSelect({ type: "zone", id: selectedZoneId, pointIndex: selectedZonePointIndex });
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ type: "zone-handle", zoneId: selectedZoneId, pointIndex: selectedZonePointIndex, handle });
        return;
      }
    }
    const hit = pickDesignerHit(designer, activeLayer, point, viewport, canvasSize);
    if (tool === "pan" || (tool === "select" && !hit)) {
      onSelect(null);
      startPanDrag(event);
      return;
    }
    if (!hit) {
      onSelect(null);
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit.type === "build_area") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === hit.id);
      if (!buildArea) return;
      onSelect({ type: "build_area", id: buildArea.id });
      setDrag({ type: "build-area-move", buildAreaId: buildArea.id, start: point, original: buildArea });
    }
    if (hit.type === "artwork") {
      const artwork = designer.artwork.find((entry) => entry.id === hit.id);
      if (!artwork) return;
      onSelect({ type: "artwork", id: artwork.id });
      setDrag({ type: "artwork-move", artworkId: artwork.id, start: point, original: artwork });
    }
    if (hit.type === "artwork_resize") {
      const artwork = designer.artwork.find((entry) => entry.id === hit.id);
      if (!artwork) return;
      onSelect({ type: "artwork", id: artwork.id });
      setDrag({ type: "artwork-resize", artworkId: artwork.id, handle: hit.handle, start: point, original: artwork });
    }
    if (hit.type === "build_area_resize") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === hit.id);
      if (!buildArea) return;
      onSelect({ type: "build_area", id: buildArea.id });
      setDrag({ type: "build-area-resize", buildAreaId: buildArea.id, handle: hit.handle, start: point, original: buildArea });
    }
    if (hit.type === "build_area_point") {
      onSelect({ type: "build_area", id: hit.id, pointIndex: hit.pointIndex });
      setDrag({ type: "build-area-point", buildAreaId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "zone") {
      const zone = designer.zones.find((entry) => entry.id === hit.id);
      if (!zone) return;
      onSelect({ type: "zone", id: zone.id });
      setDrag({ type: "zone-move", zoneId: zone.id, start: point, original: zone });
    }
    if (hit.type === "zone_resize") {
      const zone = designer.zones.find((entry) => entry.id === hit.id);
      if (!zone) return;
      onSelect({ type: "zone", id: zone.id });
      setDrag({ type: "zone-resize", zoneId: zone.id, handle: hit.handle, start: point, original: zone });
    }
    if (hit.type === "zone_point") {
      onSelect({ type: "zone", id: hit.id, pointIndex: hit.pointIndex });
      setDrag({ type: "zone-point", zoneId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "route") {
      const route = designer.routes.find((entry) => entry.id === hit.id);
      if (!route) return;
      onSelect({ type: "route", id: route.id });
      setDrag({ type: "route-move", routeId: route.id, start: point, original: route });
    }
    if (hit.type === "route_point") {
      const route = designer.routes.find((entry) => entry.id === hit.id);
      if (!route) return;
      if (tool === "cut") {
        onCutRoutePoint(route.id, hit.pointIndex);
        return;
      }
      const routePoint = route.points[hit.pointIndex];
      const jointGroup = routePoint?.joint ? findJointGroup(designer.routes, route.id, hit.pointIndex, designer.snapCm) : [{ routeId: route.id, pointIndex: hit.pointIndex }];
      onSelect({ type: "route", id: route.id, pointIndex: hit.pointIndex });
      setDrag({ type: "route-point", routeId: route.id, pointIndex: hit.pointIndex, jointGroup });
    }
    if (hit.type === "controller") {
      onSelect({ type: "controller", id: designer.controller.id });
      setDrag({ type: "controller-move", start: point, original: designer.controller, originalRoutes: designer.routes });
    }
  }

  function handleCanvasDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (presentation === "animate") return;
    const point = eventPoint(event);
    if (activeLayer === "reference" && selectedBuildAreaId) {
      const buildArea = designer.buildAreas.find((entry) => entry.id === selectedBuildAreaId);
      const insertIndex = buildArea ? nearestShapeInsertIndex(buildArea, point) : null;
      if (buildArea && insertIndex !== null) onInsertBuildAreaPoint(buildArea.id, insertIndex, point);
      return;
    }
    if (activeLayer === "zones" && selectedZoneId) {
      const zone = designer.zones.find((entry) => entry.id === selectedZoneId);
      const insertIndex = zone ? nearestShapeInsertIndex(zone, point) : null;
      if (zone && insertIndex !== null) onInsertZonePoint(zone.id, insertIndex, point);
      return;
    }
    if (activeLayer === "strings") {
      const routeHit = pickRouteSegmentHit(designer.routes, point, viewport, canvasSize);
      if (routeHit) onInsertRoutePoint(routeHit.routeId, point);
    }
  }

  return (
    <div className={`grid h-full w-full ${rulerGrid} overflow-hidden rounded-md border ${colorMode === "night" ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-slate-100"}`}>
      <div className={showRulers ? colorMode === "night" ? "border-b border-r border-slate-700 bg-slate-900" : "border-b border-r border-slate-300 bg-slate-100" : "overflow-hidden"} />
      {showRulers ? <HorizontalRuler viewport={viewport} unit={designer.rulerUnit} colorMode={colorMode} /> : <div className="overflow-hidden" />}
      {showRulers ? <VerticalRuler viewport={viewport} unit={designer.rulerUnit} colorMode={colorMode} /> : <div className="overflow-hidden" />}
      <div ref={canvasHostRef} className={`relative min-h-0 min-w-0 overflow-hidden ${colorMode === "night" ? "bg-slate-950" : "bg-slate-100"}`}>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 block h-full w-full ${colorMode === "night" ? "bg-slate-950" : "bg-slate-100"} ${drag?.type === "pan" ? "cursor-grabbing" : tool === "pan" ? "cursor-grab" : tool === "measure" || tool === "led_string" || tool === "data_cable" || tool === "build_area_polygon" || tool === "build_area_bezier" || tool === "zone_polygon" || tool === "zone_bezier" ? "cursor-crosshair" : "cursor-default"}`}
          role="img"
          aria-label="Designer studio canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onWheel={handleCanvasWheel}
          onPointerUp={(event) => {
            const endedDrag = drag;
            const point = eventPoint(event);
            const rawFinalPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) };
            const snappedFinalPoint = endedDrag?.type === "route-point" && endedDrag.jointGroup.length === 1
              ? snapTerminalPoint(endedDrag.routeId, endedDrag.pointIndex, rawFinalPoint)
              : rawFinalPoint;
            const finalPoint = { ...snappedFinalPoint, joint: false };
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setDrag(null);
            if (endedDrag?.type === "route-point" && endedDrag.jointGroup.length > 1) {
              onSolderedTerminalsDragEnd(endedDrag.jointGroup, { ...finalPoint, joint: true });
              return;
            }
            if (endedDrag?.type === "route-point") onRoutePointDragEnd(endedDrag.routeId, endedDrag.pointIndex, finalPoint);
          }}
          onDoubleClick={handleCanvasDoubleClick}
        />
        {presentation === "design" && designer.layers.artwork.visible ? (
          <div className="pointer-events-none absolute inset-0">
            {designer.artwork.map((artwork) => {
              if (!artwork.visible) return null;
              const url = artworkUrls[artwork.assetId];
              if (!url) return null;
              const left = ((artwork.x - viewport.x) / viewport.width) * 100;
              const top = ((artwork.y - viewport.y) / viewport.height) * 100;
              const width = (artwork.width / viewport.width) * 100;
              const height = (artwork.height / viewport.height) * 100;
              return (
                <div
                  key={artwork.id}
                  className={`absolute overflow-hidden ${selectedArtworkId === artwork.id ? "ring-2 ring-cyan-300" : "ring-1 ring-white/15"}`}
                  style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, opacity: designer.layers.artwork.opacity * artwork.opacity }}
                >
                  <img src={url} alt={artwork.name} className="h-full w-full object-contain" draggable={false} />
                  {selectedArtworkId === artwork.id ? (
                    <>
                      <span className="absolute left-0 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-700 bg-white" />
                      <span className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full border border-blue-700 bg-white" />
                      <span className="absolute bottom-0 left-0 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-blue-700 bg-white" />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 rounded-full border border-blue-700 bg-white" />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
