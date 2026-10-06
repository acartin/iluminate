"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignerArtworkForm, DesignerBuildAreaForm, DesignerChannelForm, DesignerFaceGraphicForm, DesignerForm, DesignerPoint, DesignerRouteForm, DesignerRouteKind, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { drawPaperAnimationMap, drawPaperDesigner, setPaperScope } from "./designer-paper-renderer";
import type { CompiledDesignerLayout } from "./designer-compiler";
import { HorizontalRuler, VerticalRuler } from "./designer-ui";
import {
  clamp,
  clampViewport,
  nextDesignerItemNumber,
  pickDesignerHit,
  pickRouteSegmentHit,
  snapValue,
  worldHitTolerance,
  normalizeViewportAspect
} from "./designer-geometry";
import {
  movedChannel,
  movedShape,
  nearestChannelInsertIndex,
  nearestShapeInsertIndex,
  pickBezierHandle,
  pointInsideDesignerShape,
  pointNearShapeStroke,
  pointsBounds,
  primitiveShapeBounds,
  resizedBuildArea,
  resizedZone,
  smoothBezierPoints,
  smoothOpenBezierPoints,
  updateBezierHandle,
  updateChannelBezierHandle,
  updateChannelPoint,
  updatePolygonPoint
} from "./geometry/designer-geometry-engine";
import {
  createRouteFromDraft,
  findJointGroup,
  findNearbyControllerPort,
  findNearbySolderTerminal,
  moveControllerWithSolderedCables,
  moveRoutePoint,
  moveRouteTerminals,
  moveRouteWithSolderedTerminals,
  sameSnapPoint
} from "./electrical/designer-electrical-engine";
import { ELECTRICAL_TOOLS, geometryToolAllowedOnLayer, geometryToolPolicy } from "./canvas/designer-tool-policy";
import type { DesignerActiveLayer, DesignerDrag, DesignerMeasurement, DesignerPrimitiveDraft, DesignerRouteDraft, DesignerRouteTerminal, DesignerSelection, DesignerShapeDraft, DesignerTool, DesignerViewport, PaperApi, ResizeHandle } from "./types";
import { DESIGNER_FONT_CATALOG, designerFontUrl } from "@/lib/lighting/designer-font-catalog";

export type DesignerAnimationPixel = {
  output: number;
  serialIndex: number;
  color: { r: number; g: number; b: number };
};

export type DesignerAnimationDiffuser = "as_built" | "led_map";

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
  selectedFaceGraphicId,
  selectedFaceGraphicPointIndex,
  selectedProjectionId,
  selectedDerivedGeometryId,
  selectedTextId,
  selectedChannelId,
  selectedChannelPointIndex,
  selectedRouteId,
  selectedRoutePointIndex,
  selectedController,
  selectedGeometryKeys,
  onViewportChange,
  onChange,
  onSelect,
  onInsertBuildAreaPoint,
  onInsertZonePoint,
  onInsertFaceGraphicPoint,
  onInsertChannelPoint,
  onPlaceImage,
  onCreateText,
  onInsertRoutePoint,
  onCutRoutePoint,
  onRoutePointDragEnd,
  onSolderedTerminalsDragEnd,
  presentation = "design",
  compiledLayout,
  animationPixels,
  animationDiffusers,
  showRulers = designer.rulerVisible
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer | null;
  tool: DesignerTool;
  onToolChange: (tool: DesignerTool) => void;
  viewport: DesignerViewport;
  artworkUrls: Record<string, string>;
  selectedArtworkId?: string;
  selectedBuildAreaId?: string;
  selectedBuildAreaPointIndex?: number;
  selectedZoneId?: string;
  selectedZonePointIndex?: number;
  selectedFaceGraphicId?: string;
  selectedFaceGraphicPointIndex?: number;
  selectedProjectionId?: string;
  selectedDerivedGeometryId?: string;
  selectedTextId?: string;
  selectedChannelId?: string;
  selectedChannelPointIndex?: number;
  selectedRouteId?: string;
  selectedRoutePointIndex?: number;
  selectedController?: boolean;
  selectedGeometryKeys?: string[];
  onViewportChange: (viewport: DesignerViewport) => void;
  onChange: (designer: DesignerForm) => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onInsertBuildAreaPoint: (buildAreaId: string, insertIndex: number, point: DesignerPoint) => void;
  onInsertZonePoint: (zoneId: string, insertIndex: number, point: DesignerPoint) => void;
  onInsertFaceGraphicPoint: (elementId: string, insertIndex: number, point: DesignerPoint) => void;
  onInsertChannelPoint: (channelId: string, insertIndex: number, point: DesignerPoint) => void;
  onPlaceImage: (point: DesignerPoint) => void;
  onCreateText: (point: DesignerPoint) => void;
  onInsertRoutePoint: (routeId: string, point: DesignerPoint) => void;
  onCutRoutePoint: (routeId: string, pointIndex: number) => void;
  onRoutePointDragEnd: (routeId: string, pointIndex: number, finalPoint: DesignerPoint) => void;
  onSolderedTerminalsDragEnd: (terminals: DesignerRouteTerminal[], finalPoint: DesignerPoint) => void;
  presentation?: "design" | "animate";
  compiledLayout?: CompiledDesignerLayout;
  animationPixels?: DesignerAnimationPixel[];
  animationDiffusers?: Record<string, DesignerAnimationDiffuser>;
  showRulers?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<PaperApi | null>(null);
  const [paperReady, setPaperReady] = useState(false);
  const [drag, setDrag] = useState<DesignerDrag | null>(null);
  const [routeDraft, setRouteDraft] = useState<DesignerRouteDraft | null>(null);
  const [shapeDraft, setShapeDraft] = useState<DesignerShapeDraft | null>(null);
  const [primitiveDraft, setPrimitiveDraft] = useState<DesignerPrimitiveDraft | null>(null);
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
    void Promise.all(DESIGNER_FONT_CATALOG.map(async (resource) => {
      const face = new FontFace(resource.family, `url(${designerFontUrl(resource.id)})`, { weight: String(resource.weight) });
      await face.load();
      if (!cancelled) window.document.fonts.add(face);
    })).then(() => {
      if (!cancelled) setCanvasSize((size) => ({ ...size }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
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
    if (presentation === "animate" && compiledLayout) drawPaperAnimationMap({ designer, layout: compiledLayout, viewport, selectedZoneId, canvasSize, colorMode, animationPixels, animationDiffusers });
    else drawPaperDesigner({
      designer,
      activeLayer,
      viewport,
      selectedBuildAreaId,
      selectedBuildAreaPointIndex,
      selectedZoneId,
      selectedZonePointIndex,
      selectedFaceGraphicId,
      selectedFaceGraphicPointIndex,
      selectedProjectionId,
      selectedDerivedGeometryId,
      selectedTextId,
      selectedChannelId,
      selectedChannelPointIndex,
      selectedRouteId,
      selectedRoutePointIndex,
      selectedController: Boolean(selectedController),
      selectedGeometryKeys,
      routeDraft,
      shapeDraft,
      primitiveDraft,
      measurement,
      canvasSize,
      colorMode
    });
    loadedPaper.view.update();
  }, [activeLayer, animationDiffusers, animationPixels, canvasSize, colorMode, compiledLayout, designer, measurement, paperReady, presentation, primitiveDraft, routeDraft, selectedBuildAreaId, selectedBuildAreaPointIndex, selectedChannelId, selectedChannelPointIndex, selectedController, selectedDerivedGeometryId, selectedFaceGraphicId, selectedFaceGraphicPointIndex, selectedGeometryKeys, selectedProjectionId, selectedRouteId, selectedRoutePointIndex, selectedTextId, selectedZoneId, selectedZonePointIndex, shapeDraft, viewport]);

  useEffect(() => {
    if (activeLayer !== "strings" || !ELECTRICAL_TOOLS.has(tool) || tool === "cut") setRouteDraft(null);
  }, [activeLayer, tool]);

  useEffect(() => {
    if (tool !== "measure") setMeasurement(null);
  }, [tool]);

  useEffect(() => {
    const isPrimitiveTool = geometryToolPolicy(tool)?.construction === "primitive";
    if (!isPrimitiveTool) setPrimitiveDraft(null);
  }, [tool]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRouteDraft(null);
        setShapeDraft(null);
        setPrimitiveDraft(null);
        setMeasurement(null);
        return;
      }
      if (event.key === "Enter" && shapeDraft?.target === "channel" && shapeDraft.points.length >= 2) {
        finishChannelDraft(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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

  function patchFaceGraphic(elementId: string, patch: Partial<DesignerFaceGraphicForm>) {
    onChange({ ...designer, faceGraphics: designer.faceGraphics.map((element) => (element.id === elementId ? { ...element, ...patch } : element)) });
  }

  function patchChannel(channelId: string, patch: Partial<DesignerChannelForm>) {
    onChange({ ...designer, channels: designer.channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel)) });
  }

  function finishChannelDraft(closed: boolean) {
    if (!shapeDraft || shapeDraft.target !== "channel" || shapeDraft.points.length < 2) return;
    const points = shapeDraft.mode === "bezier"
      ? (closed ? smoothBezierPoints(shapeDraft.points) : smoothOpenBezierPoints(shapeDraft.points))
      : shapeDraft.points;
    const next = designer.channels.length + 1;
    const channel: DesignerChannelForm = {
      id: `channel_${next}`,
      name: `Channel ${next}`,
      points,
      pathMode: shapeDraft.mode,
      widthMm: 10,
      closed,
      cap: "butt",
      visible: true,
      locked: false,
      opacity: 1
    };
    onChange({ ...designer, channels: [...designer.channels, channel] });
    onSelect({ type: "channel", id: channel.id });
    setShapeDraft(null);
    onToolChange("select");
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
    const policy = geometryToolPolicy(tool);
    if (!policy || policy.construction !== "path" || !geometryToolAllowedOnLayer(tool, activeLayer)) return;
    const { target, mode } = policy;
    if (target === "build_area" && (!designer.layers.artwork.visible || designer.layers.artwork.locked)) return;
    if ((target === "zone" || target === "channel") && (designer.layers.zones.locked || !designer.layers.zones.visible)) return;
    if (target === "face_graphic" && (designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible)) return;

    const rawPoint = eventPoint(event);
    const point = { x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) };
    const activeDraft = shapeDraft?.target === target ? shapeDraft : null;
    const points = activeDraft?.points ?? [];
    const draftMode = activeDraft?.mode ?? mode;
    if (points.length && sameSnapPoint(points[points.length - 1], point, designer.snapCm)) return;
    const closesAtVisibleStartNode = points.length >= 3
      && Math.hypot(rawPoint.x - points[0].x, rawPoint.y - points[0].y) <= worldHitTolerance(viewport, canvasSize);

    if (closesAtVisibleStartNode) {
      if (target === "channel") {
        finishChannelDraft(true);
        return;
      }
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
      } else if (target === "zone") {
        const next = nextDesignerItemNumber(designer.zones, "zone_");
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
      } else {
        const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
        const element: DesignerFaceGraphicForm = {
          id: `face_graphic_${next}`,
          name: `Face Graphic ${next}`,
          shape: "polygon",
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          points: polygonPoints,
          pathMode: draftMode,
          passMode: "translucent",
          filterColor: "#FFFFFF",
          visible: true,
          locked: false,
          opacity: 1
        };
        onChange({ ...designer, faceGraphics: [...designer.faceGraphics, element] });
        onSelect({ type: "face_graphic", id: element.id });
      }
      setShapeDraft(null);
      onToolChange("select");
      return;
    }

    setShapeDraft({ target, mode: draftMode, points: [...points, point] });
    onSelect(null);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (primitiveDraft) {
      const point = eventPoint(event);
      setPrimitiveDraft({
        ...primitiveDraft,
        bounds: primitiveShapeBounds(primitiveDraft.start, point, designer.snapCm, {
          preserveAspect: event.ctrlKey || event.metaKey,
          fromCenter: event.shiftKey
        })
      });
      return;
    }
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
    if (drag.type === "face-graphic-move") {
      patchFaceGraphic(drag.elementId, movedShape(drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm));
      return;
    }
    if (drag.type === "face-graphic-resize") {
      patchFaceGraphic(drag.elementId, resizedZone(drag.original, drag.handle, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm, { preserveAspect: event.ctrlKey || event.metaKey, fromCenter: event.shiftKey }));
      return;
    }
    if (drag.type === "face-graphic-point") {
      const element = designer.faceGraphics.find((entry) => entry.id === drag.elementId);
      if (element) patchFaceGraphic(drag.elementId, updatePolygonPoint(element, drag.pointIndex, point, designer.snapCm));
      return;
    }
    if (drag.type === "face-graphic-handle") {
      const element = designer.faceGraphics.find((entry) => entry.id === drag.elementId);
      if (element) patchFaceGraphic(drag.elementId, updateBezierHandle(element, drag.pointIndex, drag.handle, point, designer.snapCm));
      return;
    }
    if (drag.type === "text-move") {
      onChange({
        ...designer,
        texts: designer.texts.map((text) => text.id === drag.textId ? {
          ...text,
          x: snapValue(drag.original.x + point.x - drag.start.x, designer.snapCm),
          y: snapValue(drag.original.y + point.y - drag.start.y, designer.snapCm)
        } : text)
      });
      return;
    }
    if (drag.type === "channel-move") {
      patchChannel(drag.channelId, movedChannel(drag.original, point.x - drag.start.x, point.y - drag.start.y, designer.snapCm));
      return;
    }
    if (drag.type === "channel-point") {
      const channel = designer.channels.find((entry) => entry.id === drag.channelId);
      if (channel) patchChannel(drag.channelId, updateChannelPoint(channel, drag.pointIndex, point, designer.snapCm));
      return;
    }
    if (drag.type === "channel-handle") {
      const channel = designer.channels.find((entry) => entry.id === drag.channelId);
      if (channel) patchChannel(drag.channelId, updateChannelBezierHandle(channel, drag.pointIndex, drag.handle, point, designer.snapCm));
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
    const captureRadiusCm = 16 * viewport.width / Math.max(1, canvasSize.width);
    const route = designer.routes.find((entry) => entry.id === routeId);
    const controllerPort = route ? findNearbyControllerPort(designer.controller, route, pointIndex, point, captureRadiusCm, designer.snapCm) : null;
    const solderTarget = !controllerPort ? findNearbySolderTerminal(designer.routes, routeId, pointIndex, point, captureRadiusCm) : null;
    return controllerPort?.point ?? solderTarget?.point ?? point;
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (presentation === "animate") {
      const point = eventPoint(event);
      const tolerance = worldHitTolerance(viewport, canvasSize) * 2;
      const zone = designer.zones.find((candidate) => candidate.visible !== false && (pointInsideDesignerShape(candidate, point) || pointNearShapeStroke(candidate, point, tolerance)));
      if (zone) { onSelect({ type: "zone", id: zone.id }); return; }
      onSelect(null);
      startPanDrag(event);
      return;
    }
    if (tool === "reference_text" || tool === "zone_text" || tool === "face_graphic_text") {
      const targetLayer = tool === "reference_text" ? "reference" : tool === "zone_text" ? "zones" : "faceGraphic";
      const settings = designer.layers[targetLayer];
      if (settings.locked || !settings.visible) return;
      const rawPoint = eventPoint(event);
      onCreateText({ x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) });
      onToolChange("select");
      return;
    }
    const geometryPolicy = geometryToolPolicy(tool);
    if (geometryPolicy?.construction === "primitive") {
      const { target } = geometryPolicy;
      if (target === "channel") return;
      const shape = geometryPolicy.shape === "ellipse" ? "ellipse" : "rect";
      if (!geometryToolAllowedOnLayer(tool, activeLayer)) return;
      if (target === "build_area" && (designer.layers.artwork.locked || !designer.layers.artwork.visible)) return;
      if (target === "zone" && (designer.layers.zones.locked || !designer.layers.zones.visible)) return;
      if (target === "face_graphic" && (designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible)) return;
      const rawPoint = eventPoint(event);
      const start = { x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) };
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(null);
      setPrimitiveDraft({
        target,
        shape,
        start,
        bounds: { x: start.x, y: start.y, width: 0, height: 0 },
        clientStart: { x: event.clientX, y: event.clientY }
      });
      return;
    }
    if (tool === "image_place") {
      if (activeLayer !== "artwork" || designer.layers.artwork.locked || !designer.layers.artwork.visible) return;
      const rawPoint = eventPoint(event);
      onPlaceImage({ x: snapValue(rawPoint.x, designer.snapCm), y: snapValue(rawPoint.y, designer.snapCm) });
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
    if (geometryPolicy?.construction === "path") {
      handleShapeDrawClick(event);
      return;
    }
    if (tool === "led_string" || tool === "data_cable") {
      handleRouteDrawClick(event, tool);
      return;
    }

    const point = eventPoint(event);
    const tolerance = worldHitTolerance(viewport, canvasSize);
    if ((activeLayer === "reference" || activeLayer === "artwork") && selectedBuildAreaId && typeof selectedBuildAreaPointIndex === "number") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === selectedBuildAreaId);
      const node = buildArea?.pathMode === "bezier" ? buildArea.points?.[selectedBuildAreaPointIndex] : null;
      const handle = node ? pickBezierHandle(node, point, tolerance) : null;
      if (handle) {
        onSelect({ type: "build_area", id: selectedBuildAreaId, pointIndex: selectedBuildAreaPointIndex });
        if (designer.layers.artwork.locked) return;
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
        if (designer.layers.zones.locked) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ type: "zone-handle", zoneId: selectedZoneId, pointIndex: selectedZonePointIndex, handle });
        return;
      }
    }
    if (activeLayer === "zones" && selectedChannelId && typeof selectedChannelPointIndex === "number") {
      const channel = designer.channels.find((entry) => entry.id === selectedChannelId);
      const node = channel?.pathMode === "bezier" ? channel.points?.[selectedChannelPointIndex] : null;
      const handle = node ? pickBezierHandle(node, point, tolerance) : null;
      if (handle) {
        onSelect({ type: "channel", id: selectedChannelId, pointIndex: selectedChannelPointIndex });
        if (designer.layers.zones.locked) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ type: "channel-handle", channelId: selectedChannelId, pointIndex: selectedChannelPointIndex, handle });
        return;
      }
    }
    if (activeLayer === "faceGraphic" && selectedFaceGraphicId && typeof selectedFaceGraphicPointIndex === "number") {
      const element = designer.faceGraphics.find((entry) => entry.id === selectedFaceGraphicId);
      const node = element?.pathMode === "bezier" ? element.points?.[selectedFaceGraphicPointIndex] : null;
      const handle = node ? pickBezierHandle(node, point, tolerance) : null;
      if (handle) {
        onSelect({ type: "face_graphic", id: selectedFaceGraphicId, pointIndex: selectedFaceGraphicPointIndex });
        if (designer.layers.faceGraphic.locked) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ type: "face-graphic-handle", elementId: selectedFaceGraphicId, pointIndex: selectedFaceGraphicPointIndex, handle });
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

    if (tool === "select" && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      const additiveSelection: DesignerSelection = hit.type === "build_area" ? { type: "build_area", id: hit.id }
        : hit.type === "zone" ? { type: "zone", id: hit.id }
          : hit.type === "face_graphic" ? { type: "face_graphic", id: hit.id }
            : hit.type === "projection" ? { type: "projection", id: hit.id }
              : hit.type === "derived_geometry" ? { type: "derived_geometry", id: hit.id }
                : hit.type === "text" ? { type: "text", id: hit.id }
              : null;
      if (additiveSelection) {
        onSelect(additiveSelection, true);
        return;
      }
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit.type === "build_area") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === hit.id);
      if (!buildArea) return;
      onSelect({ type: "build_area", id: buildArea.id });
      if (designer.layers.artwork.locked) return;
      setDrag({ type: "build-area-move", buildAreaId: buildArea.id, start: point, original: buildArea });
    }
    if (hit.type === "artwork") {
      const artwork = designer.artwork.find((entry) => entry.id === hit.id);
      if (!artwork) return;
      onSelect({ type: "artwork", id: artwork.id });
      if (designer.layers.artwork.locked) return;
      setDrag({ type: "artwork-move", artworkId: artwork.id, start: point, original: artwork });
    }
    if (hit.type === "artwork_resize") {
      const artwork = designer.artwork.find((entry) => entry.id === hit.id);
      if (!artwork) return;
      onSelect({ type: "artwork", id: artwork.id });
      if (designer.layers.artwork.locked) return;
      setDrag({ type: "artwork-resize", artworkId: artwork.id, handle: hit.handle, start: point, original: artwork });
    }
    if (hit.type === "build_area_resize") {
      const buildArea = designer.buildAreas.find((entry) => entry.id === hit.id);
      if (!buildArea) return;
      onSelect({ type: "build_area", id: buildArea.id });
      if (designer.layers.artwork.locked) return;
      setDrag({ type: "build-area-resize", buildAreaId: buildArea.id, handle: hit.handle, start: point, original: buildArea });
    }
    if (hit.type === "build_area_point") {
      onSelect({ type: "build_area", id: hit.id, pointIndex: hit.pointIndex });
      if (designer.layers.artwork.locked) return;
      setDrag({ type: "build-area-point", buildAreaId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "zone") {
      const zone = designer.zones.find((entry) => entry.id === hit.id);
      if (!zone) return;
      onSelect({ type: "zone", id: zone.id });
      if (designer.layers.zones.locked) return;
      setDrag({ type: "zone-move", zoneId: zone.id, start: point, original: zone });
    }
    if (hit.type === "zone_resize") {
      const zone = designer.zones.find((entry) => entry.id === hit.id);
      if (!zone) return;
      onSelect({ type: "zone", id: zone.id });
      if (designer.layers.zones.locked) return;
      setDrag({ type: "zone-resize", zoneId: zone.id, handle: hit.handle, start: point, original: zone });
    }
    if (hit.type === "zone_point") {
      onSelect({ type: "zone", id: hit.id, pointIndex: hit.pointIndex });
      if (designer.layers.zones.locked) return;
      setDrag({ type: "zone-point", zoneId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "face_graphic") {
      const element = designer.faceGraphics.find((entry) => entry.id === hit.id);
      if (!element) return;
      onSelect({ type: "face_graphic", id: element.id });
      if (designer.layers.faceGraphic.locked || element.locked) return;
      setDrag({ type: "face-graphic-move", elementId: element.id, start: point, original: element });
    }
    if (hit.type === "face_graphic_resize") {
      const element = designer.faceGraphics.find((entry) => entry.id === hit.id);
      if (!element) return;
      onSelect({ type: "face_graphic", id: element.id });
      if (designer.layers.faceGraphic.locked || element.locked) return;
      setDrag({ type: "face-graphic-resize", elementId: element.id, handle: hit.handle, start: point, original: element });
    }
    if (hit.type === "face_graphic_point") {
      onSelect({ type: "face_graphic", id: hit.id, pointIndex: hit.pointIndex });
      const element = designer.faceGraphics.find((entry) => entry.id === hit.id);
      if (designer.layers.faceGraphic.locked || element?.locked) return;
      setDrag({ type: "face-graphic-point", elementId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "projection") {
      onSelect({ type: "projection", id: hit.id });
      return;
    }
    if (hit.type === "derived_geometry") {
      onSelect({ type: "derived_geometry", id: hit.id });
      return;
    }
    if (hit.type === "text") {
      const text = designer.texts.find((entry) => entry.id === hit.id);
      if (!text) return;
      onSelect({ type: "text", id: text.id });
      if (designer.layers[text.targetLayer].locked || text.locked) return;
      setDrag({ type: "text-move", textId: text.id, start: point, original: text });
      return;
    }
    if (hit.type === "channel") {
      const channel = designer.channels.find((entry) => entry.id === hit.id);
      if (!channel) return;
      onSelect({ type: "channel", id: channel.id });
      if (designer.layers.zones.locked) return;
      setDrag({ type: "channel-move", channelId: channel.id, start: point, original: channel });
    }
    if (hit.type === "channel_point") {
      onSelect({ type: "channel", id: hit.id, pointIndex: hit.pointIndex });
      if (designer.layers.zones.locked) return;
      setDrag({ type: "channel-point", channelId: hit.id, pointIndex: hit.pointIndex });
    }
    if (hit.type === "route") {
      const route = designer.routes.find((entry) => entry.id === hit.id);
      if (!route) return;
      onSelect({ type: "route", id: route.id });
      if (designer.layers.strings.locked) return;
      setDrag({ type: "route-move", routeId: route.id, start: point, original: route });
    }
    if (hit.type === "route_point") {
      const route = designer.routes.find((entry) => entry.id === hit.id);
      if (!route) return;
      onSelect({ type: "route", id: route.id, pointIndex: hit.pointIndex });
      if (designer.layers.strings.locked) return;
      if (tool === "cut") {
        onCutRoutePoint(route.id, hit.pointIndex);
        return;
      }
      const routePoint = route.points[hit.pointIndex];
      const jointGroup = routePoint?.joint ? findJointGroup(designer.routes, route.id, hit.pointIndex, designer.snapCm) : [{ routeId: route.id, pointIndex: hit.pointIndex }];
      setDrag({ type: "route-point", routeId: route.id, pointIndex: hit.pointIndex, jointGroup });
    }
    if (hit.type === "controller") {
      onSelect({ type: "controller", id: designer.controller.id });
      if (designer.layers.hardware.locked) return;
      setDrag({ type: "controller-move", start: point, original: designer.controller, originalRoutes: designer.routes });
    }
  }

  function handleCanvasDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (presentation === "animate") return;
    if (tool === "channel_bezier" && shapeDraft?.target === "channel" && shapeDraft.points.length >= 2) {
      finishChannelDraft(false);
      return;
    }
    const point = eventPoint(event);
    if ((activeLayer === "reference" || activeLayer === "artwork") && selectedBuildAreaId) {
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
    if (activeLayer === "zones" && selectedChannelId) {
      const channel = designer.channels.find((entry) => entry.id === selectedChannelId);
      const insertIndex = channel ? nearestChannelInsertIndex(channel, point) : null;
      if (channel && insertIndex !== null) onInsertChannelPoint(channel.id, insertIndex, point);
      return;
    }
    if (activeLayer === "faceGraphic" && selectedFaceGraphicId) {
      const element = designer.faceGraphics.find((entry) => entry.id === selectedFaceGraphicId);
      const insertIndex = element ? nearestShapeInsertIndex(element, point) : null;
      if (element && insertIndex !== null) onInsertFaceGraphicPoint(element.id, insertIndex, point);
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
          className={`absolute inset-0 block h-full w-full ${colorMode === "night" ? "bg-slate-950" : "bg-slate-100"} ${drag?.type === "pan" ? "cursor-grabbing" : tool === "pan" ? "cursor-grab" : tool !== "select" && tool !== "cut" ? "cursor-crosshair" : "cursor-default"}`}
          role="img"
          aria-label="Designer studio canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onWheel={handleCanvasWheel}
          onPointerUp={(event) => {
            const endedDrag = drag;
            const endedPrimitiveDraft = primitiveDraft;
            const point = eventPoint(event);
            const rawFinalPoint = { x: snapValue(point.x, designer.snapCm), y: snapValue(point.y, designer.snapCm) };
            const snappedFinalPoint = endedDrag?.type === "route-point" && endedDrag.jointGroup.length === 1
              ? snapTerminalPoint(endedDrag.routeId, endedDrag.pointIndex, rawFinalPoint)
              : rawFinalPoint;
            const finalPoint = { ...snappedFinalPoint, joint: false };
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setDrag(null);
            setPrimitiveDraft(null);
            if (endedPrimitiveDraft) {
              const bounds = primitiveShapeBounds(endedPrimitiveDraft.start, point, designer.snapCm, {
                preserveAspect: event.ctrlKey || event.metaKey,
                fromCenter: event.shiftKey
              });
              const draggedPixels = Math.hypot(event.clientX - endedPrimitiveDraft.clientStart.x, event.clientY - endedPrimitiveDraft.clientStart.y);
              if (draggedPixels >= 3 && bounds.width > 0 && bounds.height > 0) {
                if (endedPrimitiveDraft.target === "build_area") {
                  const next = designer.buildAreas.length + 1;
                  const buildArea: DesignerBuildAreaForm = {
                    id: `build_area_${next}`,
                    name: next === 1 ? "Build Area" : `Build Area ${next}`,
                    shape: endedPrimitiveDraft.shape,
                    ...bounds,
                    visible: true,
                    locked: false,
                    opacity: 1
                  };
                  onChange({ ...designer, buildAreas: [...designer.buildAreas, buildArea] });
                  onSelect({ type: "build_area", id: buildArea.id });
                } else if (endedPrimitiveDraft.target === "zone") {
                  const next = nextDesignerItemNumber(designer.zones, "zone_");
                  const zone: DesignerZoneForm = {
                    id: `zone_${next}`,
                    name: `Zone ${next}`,
                    shape: endedPrimitiveDraft.shape,
                    ...bounds,
                    visible: true,
                    locked: false,
                    opacity: 1
                  };
                  onChange({ ...designer, zones: [...designer.zones, zone] });
                  onSelect({ type: "zone", id: zone.id });
                } else {
                  const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
                  const element: DesignerFaceGraphicForm = {
                    id: `face_graphic_${next}`,
                    name: `Face Graphic ${next}`,
                    shape: endedPrimitiveDraft.shape,
                    ...bounds,
                    passMode: "translucent",
                    filterColor: "#FFFFFF",
                    visible: true,
                    locked: false,
                    opacity: 1
                  };
                  onChange({ ...designer, faceGraphics: [...designer.faceGraphics, element] });
                  onSelect({ type: "face_graphic", id: element.id });
                }
                onToolChange("select");
              }
              return;
            }
            if (endedDrag?.type === "route-point" && endedDrag.jointGroup.length > 1) {
              onSolderedTerminalsDragEnd(endedDrag.jointGroup, { ...finalPoint, joint: true });
              return;
            }
            if (endedDrag?.type === "route-point") onRoutePointDragEnd(endedDrag.routeId, endedDrag.pointIndex, finalPoint);
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setDrag(null);
            setPrimitiveDraft(null);
          }}
          onDoubleClick={handleCanvasDoubleClick}
        />
        {presentation === "design" && designer.layers.artwork.visible ? (
          <div className="pointer-events-none absolute inset-0">
            {designer.artwork.map((artwork) => {
              const url = artworkUrls[artwork.assetId];
              if (artwork.visible === false) return null;
              const left = ((artwork.x - viewport.x) / viewport.width) * 100;
              const top = ((artwork.y - viewport.y) / viewport.height) * 100;
              const width = (artwork.width / viewport.width) * 100;
              const height = (artwork.height / viewport.height) * 100;
              return (
                <div
                  key={artwork.id}
                  className={`absolute flex items-center justify-center overflow-hidden ${selectedArtworkId === artwork.id ? "ring-2 ring-cyan-300" : "ring-1 ring-white/15"} ${url ? "" : "border border-dashed border-sky-400/70 bg-sky-950/20"}`}
                  style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, opacity: designer.layers.artwork.opacity }}
                >
                  {url ? <img src={url} alt={artwork.name} className="h-full w-full object-contain" draggable={false} /> : <span className="px-1 text-center text-[11px] leading-3 text-sky-300/80">{artwork.name}</span>}
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
