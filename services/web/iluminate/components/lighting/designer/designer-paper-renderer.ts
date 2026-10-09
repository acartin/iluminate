import type { DesignerBuildAreaForm, DesignerChannelForm, DesignerContour, DesignerControllerForm, DesignerFaceGraphicForm, DesignerForm, DesignerPoint, DesignerRouteForm, DesignerRouteKind, DesignerWorkLineForm, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { designerFontResource } from "@/lib/lighting/designer-font-catalog";
import { designerFilletCornerIsEligible } from "@/lib/lighting/designer-derived-geometry";
import { estimateDesignerTextBounds } from "@/lib/lighting/designer-text-geometry";
import type { DesignerActiveLayer, DesignerMeasurement, DesignerPrimitiveDraft, DesignerRouteDraft, DesignerShapeDraft, DesignerViewport, PaperApi, PaperPoint, PaperRectangle } from "./types";
import { channelCenterPolyline, channelContainsPoint, channelIsClosed, channelTightBend, channelWidthCm, controllerConnectedPorts, controllerPortPoint, formatDecimal, formatMeasure, pointInsideDesignerShape, routeColor, routeDirectionMarkers, routePointFill, routeSelectedColor, sampleRouteLedDots, smoothOpenBezierPoints, type ChannelBendMeasurement } from "./designer-geometry";
import type { CompiledDesignerLayout } from "./designer-compiler";
import type { DesignerPathTrimPreview } from "./geometry/designer-path-trim";
import { resolveChannelOutlineContours } from "./rendering/channel-swept-outline";

let paperScope: PaperApi;

export function setPaperScope(scope: PaperApi) {
  paperScope = scope;
}

export function drawPaperDesigner({
  designer,
  activeLayer,
  viewport,
  selectedBuildAreaId,
  selectedBuildAreaPointIndex,
  selectedWorkLineId,
  selectedWorkLinePointIndex,
  selectedZoneId,
  selectedZonePointIndex,
  selectedFaceGraphicId,
  selectedFaceGraphicPointIndex,
  selectedProjectionId,
  selectedDerivedGeometryId,
  selectedTextId,
  selectedChannelId,
  selectedChannelPointIndex,
  interactiveChannelId,
  selectedRouteId,
  selectedRoutePointIndex,
  selectedController,
  filletMode = false,
  selectedGeometryKeys = [],
  routeDraft,
  shapeDraft,
  primitiveDraft,
  measurement,
  pathTrimPreview,
  faceGraphicVinylPreview = false,
  canvasSize,
  colorMode
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer | null;
  viewport: DesignerViewport;
  selectedBuildAreaId?: string;
  selectedBuildAreaPointIndex?: number;
  selectedWorkLineId?: string;
  selectedWorkLinePointIndex?: number;
  selectedZoneId?: string;
  selectedZonePointIndex?: number;
  selectedFaceGraphicId?: string;
  selectedFaceGraphicPointIndex?: number;
  selectedProjectionId?: string;
  selectedDerivedGeometryId?: string;
  selectedTextId?: string;
  selectedChannelId?: string;
  selectedChannelPointIndex?: number;
  interactiveChannelId?: string;
  selectedRouteId?: string;
  selectedRoutePointIndex?: number;
  selectedController: boolean;
  filletMode?: boolean;
  selectedGeometryKeys?: string[];
  routeDraft: DesignerRouteDraft | null;
  shapeDraft: DesignerShapeDraft | null;
  primitiveDraft: DesignerPrimitiveDraft | null;
  measurement: DesignerMeasurement | null;
  pathTrimPreview?: DesignerPathTrimPreview | null;
  faceGraphicVinylPreview?: boolean;
  canvasSize: { width: number; height: number };
  colorMode: "day" | "night";
}) {
  const colors = colorMode === "night"
    ? { workspace: "#1f2937", document: "#020617", documentStroke: "#64748b", grid: "#64748b", label: "#94a3b8" }
    : { workspace: "#e2e8f0", document: "#ffffff", documentStroke: "#94a3b8", grid: "#94a3b8", label: "#475569" };
  paperScope.project.clear();
  const toScreen = (point: DesignerPoint) => new paperScope.Point(
    ((point.x - viewport.x) / viewport.width) * canvasSize.width,
    ((point.y - viewport.y) / viewport.height) * canvasSize.height
  );
  const lengthToScreen = (cm: number) => cm * canvasSize.width / Math.max(1, viewport.width);
  const filletCandidates = (geometryId: string | undefined) => {
    if (!filletMode || !geometryId) return undefined;
    const geometry = designer.geometries?.find((entry) => entry.id === geometryId);
    if (!geometry) return undefined;
    return new Set((geometry.points ?? []).map((_, index) => index).filter((index) => designerFilletCornerIsEligible(geometry, index)));
  };
  const rectToScreen = (shape: { x: number; y: number; width: number; height: number }) => {
    const topLeft = toScreen({ x: shape.x, y: shape.y });
    const bottomRight = toScreen({ x: shape.x + shape.width, y: shape.y + shape.height });
    return new paperScope.Rectangle(topLeft, bottomRight);
  };
  const vinylPreviewActive = faceGraphicVinylPreview && activeLayer === "faceGraphic" && designer.layers.faceGraphic.visible;

  new paperScope.Path.Rectangle({
    rectangle: new paperScope.Rectangle(0, 0, canvasSize.width, canvasSize.height),
    fillColor: colors.workspace
  });
  drawPaperDocumentCanvas(designer, toScreen, rectToScreen, colors);
  drawPaperGrid(designer, viewport, canvasSize, toScreen, colors.grid);
  drawPaperShapeDraft(shapeDraft?.target === "work_line" ? null : shapeDraft, toScreen, lengthToScreen);
  drawPaperPrimitiveDraft(primitiveDraft, rectToScreen);

  designer.derivedGeometries.filter((operation) => operation.visible && !(vinylPreviewActive && operation.targetLayer === "faceGraphic") && (operation.targetLayer === "reference" ? activeLayer === "artwork" || activeLayer === "reference" : operation.targetLayer === activeLayer)).forEach((operation) => {
    const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
    if (!resolved.geometry) return;
    const derived = designerGeometryAsShape(resolved.geometry);
    const selected = selectedDerivedGeometryId === operation.id || selectedGeometryKeys.includes(`derived_geometry:${operation.id}`);
    const shape = drawPaperClosedShape(derived, {
      fillColor: operation.targetLayer === "faceGraphic" ? "rgba(236,72,153,0.10)" : operation.targetLayer === "zones" ? "rgba(37,99,235,0.10)" : "rgba(168,85,247,0.07)",
      strokeColor: selected ? "#fbbf24" : "#f59e0b",
      strokeWidth: selected ? 2.2 : 1.4,
      toScreen,
      rectToScreen
    });
    shape.opacity = selected ? 1 : 0.85;
    new paperScope.PointText({ point: toScreen({ x: derived.x + 0.8, y: derived.y - 0.8 }), content: `${operation.operation.toUpperCase()} · ${operation.name}`, fillColor: selected ? "#fcd34d" : "#d97706", fontFamily: "monospace", fontSize: 10 });
  });

  designer.projections.filter((projection) => projection.visible && !(vinylPreviewActive && projection.targetLayer === "faceGraphic") && (projection.targetLayer === "reference" ? activeLayer === "artwork" || activeLayer === "reference" : projection.targetLayer === activeLayer)).forEach((projection) => {
    const resolved = resolveDesignerProjectionGeometry(designer, projection.id);
    if (!resolved.geometry) return;
    const projected = designerGeometryAsShape(resolved.geometry);
    const selected = selectedProjectionId === projection.id || selectedGeometryKeys.includes(`projection:${projection.id}`);
    const shape = drawPaperClosedShape(projected, {
      fillColor: "rgba(34,211,238,0.04)",
      strokeColor: selected ? "#67e8f9" : "#06b6d4",
      strokeWidth: selected ? 2 : 1.2,
      dashArray: [4, 4],
      toScreen,
      rectToScreen
    });
    shape.opacity = selected ? 1 : 0.72;
    new paperScope.PointText({ point: toScreen({ x: projected.x + 0.8, y: projected.y - 0.8 }), content: `PROJECTED · ${projection.name}`, fillColor: selected ? "#67e8f9" : "#0891b2", fontFamily: "monospace", fontSize: 10 });
  });

  // Reference geometry belongs to the Artwork plane: the Artwork category eye is
  // the master switch, and each build area's own eye refines it.
  if (designer.layers.artwork.visible) {
    const layerOpacity = designer.layers.reference.opacity;
    [...designer.buildAreas].filter((buildArea) => buildArea.visible !== false).reverse().forEach((buildArea) => {
      drawPaperBuildArea(buildArea, {
        selected: selectedBuildAreaId === buildArea.id || selectedGeometryKeys.includes(`build_area:${buildArea.id}`),
        selectedPointIndex: selectedBuildAreaId === buildArea.id ? selectedBuildAreaPointIndex : undefined,
        filletCandidateIndices: selectedBuildAreaId === buildArea.id ? filletCandidates(buildArea.geometryId) : undefined,
        filletMode,
        opacity: layerOpacity,
        toScreen,
        rectToScreen
      });
    });
  }

  if (designer.layers.zones.visible) {
    const layerOpacity = designer.layers.zones.opacity;
    [...designer.zones].filter((zone) => zone.visible !== false).reverse().forEach((zone) => {
      drawPaperObjectSafely("zone", zone.id, () => {
        drawPaperZone(zone, {
          selected: selectedZoneId === zone.id || selectedGeometryKeys.includes(`zone:${zone.id}`),
          selectedPointIndex: selectedZoneId === zone.id ? selectedZonePointIndex : undefined,
          filletCandidateIndices: selectedZoneId === zone.id ? filletCandidates(zone.geometryId) : undefined,
          filletMode,
          opacity: layerOpacity,
          toScreen,
          rectToScreen
        });
      });
    });
    [...designer.channels].filter((channel) => channel.visible !== false).reverse().forEach((channel) => {
      drawPaperChannel(channel, {
        selected: selectedChannelId === channel.id,
        selectedPointIndex: selectedChannelId === channel.id ? selectedChannelPointIndex : undefined,
        interactive: interactiveChannelId === channel.id,
        filletCandidateIndices: selectedChannelId === channel.id ? filletCandidates(channel.geometryId) : undefined,
        filletMode,
        opacity: layerOpacity,
        toScreen,
        lengthToScreen
      });
    });
  }

  // Lighting Setup emitters are sampled from physical LED strings. They have
  // no independent Layers plane, so Hardware / Strings is their visibility
  // master just as it is for the route itself.
  if (designer.layers.strings.visible && designer.layers.lightSources.visible) {
    designer.lightSources.filter((source) => source.visible && source.enabled).forEach((source) => {
      const target = source.targetType === "zone"
        ? designer.zones.find((zone) => zone.id === source.targetId)
        : designer.channels.find((channel) => channel.id === source.targetId);
      if (!target) return;
      const color = source.mode === "front" ? "#f59e0b" : source.mode === "halo" ? "#a78bfa" : "#38bdf8";
      designer.routes.filter((route) => route.kind === "led_string" && source.stringIds.includes(route.id)).forEach((route) => {
        sampleRouteLedDots(route, designer.addressablePixelsPerMeter, designer.addressablePixelsPerMeter)
          .filter((dot) => source.targetType === "zone"
            ? pointInsideDesignerShape(target as DesignerZoneForm, dot)
            : channelContainsPoint(target as DesignerChannelForm, dot))
          .forEach((dot) => {
            new paperScope.Path.Circle({
              center: toScreen(dot),
              radius: Math.max(2, Math.min(4.5, lengthToScreen(0.22))),
              fillColor: color,
              strokeColor: "#020617",
              strokeWidth: 0.7,
              opacity: designer.layers.lightSources.opacity
            });
          });
      });
    });
  }

  if (designer.layers.faceGraphic.visible) {
    const derivedFaceGraphics = designer.derivedGeometries.flatMap((operation): DesignerFaceGraphicForm[] => {
      if (!vinylPreviewActive || !operation.visible || operation.targetLayer !== "faceGraphic") return [];
      const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
      if (!resolved.geometry) return [];
      return [{
        id: operation.id,
        geometryId: operation.geometryId,
        name: operation.name,
        ...designerGeometryAsShape(resolved.geometry),
        passMode: operation.passMode ?? "translucent",
        filterColor: operation.filterColor ?? "#FFFFFF",
        visible: true,
        locked: true,
        opacity: 1
      }];
    });
    const visibleFaceGraphics = [...designer.faceGraphics.filter((element) => element.visible !== false), ...derivedFaceGraphics];
    if (vinylPreviewActive && visibleFaceGraphics.length > 0) {
      new paperScope.Path.Rectangle({
        rectangle: rectToScreen({ x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm }),
        fillColor: "#050505",
        strokeColor: "#64748b",
        strokeWidth: 1
      });
    }
    [...derivedFaceGraphics].reverse().forEach((element) => {
      drawPaperFaceGraphic(element, {
        selected: selectedDerivedGeometryId === element.id || selectedGeometryKeys.includes(`derived_geometry:${element.id}`),
        opacity: 1,
        vinylPreview: true,
        editable: false,
        toScreen,
        rectToScreen
      });
    });
    [...designer.faceGraphics].filter((element) => element.visible !== false).reverse().forEach((element) => {
      drawPaperFaceGraphic(element, {
        selected: selectedFaceGraphicId === element.id || selectedGeometryKeys.includes(`face_graphic:${element.id}`),
        selectedPointIndex: selectedFaceGraphicId === element.id ? selectedFaceGraphicPointIndex : undefined,
        filletCandidateIndices: selectedFaceGraphicId === element.id ? filletCandidates(element.geometryId) : undefined,
        filletMode,
        opacity: vinylPreviewActive ? 1 : designer.layers.faceGraphic.opacity * element.opacity,
        vinylPreview: vinylPreviewActive,
        toScreen,
        rectToScreen
      });
    });
  }

  designer.texts.filter((text) => {
    if (!text.visible) return false;
    if (vinylPreviewActive && text.targetLayer === "faceGraphic") return false;
    if (text.targetLayer === "reference") return designer.layers.artwork.visible && designer.layers.reference.visible && (activeLayer === "artwork" || activeLayer === "reference");
    return designer.layers[text.targetLayer].visible && activeLayer === text.targetLayer;
  }).forEach((text) => {
    const resource = designerFontResource(text.fontId);
    const selected = selectedTextId === text.id;
    const size = Math.max(4, lengthToScreen(text.fontSizeMm / 10));
    const rendered = new paperScope.PointText({
      point: toScreen({ x: text.x, y: text.y + text.fontSizeMm / 12 }),
      content: text.text || " ",
      fillColor: text.targetLayer === "faceGraphic" ? "#db2777" : text.targetLayer === "zones" ? "#2563eb" : "#7c3aed",
      fontFamily: resource?.family ?? "sans-serif",
      fontWeight: resource?.weight === 700 ? "bold" : "normal",
      fontSize: size,
      leading: size * text.lineHeight,
      justification: text.alignment,
      opacity: text.opacity
    });
    if (selected) {
      const bounds = estimateDesignerTextBounds(text);
      new paperScope.Path.Rectangle({ rectangle: rectToScreen(bounds), strokeColor: "#22d3ee", strokeWidth: 1.4, dashArray: [4, 3] });
      rendered.fillColor = new paperScope.Color("#0891b2");
    }
  });

  if (designer.layers.strings.visible && !vinylPreviewActive) {
    designer.routes.forEach((route) => {
      if (route.visible === false) return;
      drawPaperRoute(route, {
        selected: selectedRouteId === route.id,
        selectedPointIndex: selectedRouteId === route.id ? selectedRoutePointIndex : undefined,
        opacity: designer.layers.strings.opacity,
        addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
        ledsPerMeter: designer.ledsPerMeter,
        toScreen,
        lengthToScreen
      });
    });
    drawPaperRouteDraft(routeDraft, toScreen);
  }

  if (designer.layers.hardware.visible && designer.controller.visible !== false && !vinylPreviewActive) {
    drawPaperController(designer.controller, {
      selected: selectedController,
      connectedPorts: controllerConnectedPorts(designer.controller, designer.routes, designer.snapCm),
      snapCm: designer.snapCm,
      toScreen,
      rectToScreen,
      lengthToScreen
    });
  }

  // Work lines stay last in hit-test priority, but render over filled artwork
  // so an intentionally selected construction reference remains usable.
  if (designer.workLinesVisible) {
    designer.workLines.forEach((line) => drawPaperWorkLine(line, {
      selected: selectedWorkLineId === line.id,
      selectedPointIndex: selectedWorkLineId === line.id ? selectedWorkLinePointIndex : undefined,
      toScreen
    }));
  }
  if (shapeDraft?.target === "work_line") drawPaperShapeDraft(shapeDraft, toScreen, lengthToScreen);
  if (vinylPreviewActive && shapeDraft?.target === "face_graphic") drawPaperShapeDraft(shapeDraft, toScreen, lengthToScreen);
  if (vinylPreviewActive && primitiveDraft?.target === "face_graphic") drawPaperPrimitiveDraft(primitiveDraft, rectToScreen);

  drawPaperAlignmentMarks(designer, toScreen, lengthToScreen);
  drawPaperMeasurement(measurement, designer.rulerUnit, toScreen);
  drawPaperActiveLayerLabel(activeLayer, canvasSize);
  if (pathTrimPreview) drawPaperPathTrimPreview(pathTrimPreview, toScreen, rectToScreen);
}

function drawPaperAlignmentMarks(designer: DesignerForm, toScreen: (point: DesignerPoint) => PaperPoint, lengthToScreen: (cm: number) => number) {
  if (!designer.alignmentMarks.enabled) return;
  const { originXcm, originYcm, spacingMm, locked } = designer.alignmentMarks;
  const spacingCm = spacingMm / 10;
  const strokeColor = locked ? "#a855f7" : "#db2777";
  const armCm = 0.5;
  const centers = [
    { x: originXcm, y: originYcm },
    { x: originXcm + spacingCm, y: originYcm },
    { x: originXcm, y: originYcm + spacingCm }
  ];
  centers.forEach((center) => {
    new paperScope.Path.Line({ from: toScreen({ x: center.x - armCm, y: center.y }), to: toScreen({ x: center.x + armCm, y: center.y }), strokeColor, strokeWidth: 1.6 });
    new paperScope.Path.Line({ from: toScreen({ x: center.x, y: center.y - armCm }), to: toScreen({ x: center.x, y: center.y + armCm }), strokeColor, strokeWidth: 1.6 });
    new paperScope.Path.Circle({ center: toScreen(center), radius: Math.max(2.5, Math.min(4.5, lengthToScreen(0.2))), fillColor: "#ffffff", strokeColor, strokeWidth: 1.4 });
  });
  new paperScope.PointText({
    point: toScreen({ x: originXcm + 0.6, y: originYcm - 0.6 }),
    content: `ALIGN · ${formatDecimal(spacingMm)} mm${locked ? " · LOCKED" : ""}`,
    fillColor: strokeColor,
    fontFamily: "monospace",
    fontSize: 10
  });
}

function drawPaperPathTrimPreview(
  preview: DesignerPathTrimPreview,
  toScreen: (point: DesignerPoint) => PaperPoint,
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle
) {
  const kept = drawPaperClosedShape(designerGeometryAsShape(preview.geometry), {
    fillColor: "rgba(34,211,238,0.12)",
    strokeColor: "#22d3ee",
    strokeWidth: 2.4,
    toScreen,
    rectToScreen
  });
  kept.opacity = 0.95;
  const removed = new paperScope.Path({ strokeColor: "#ef4444", strokeWidth: 4, dashArray: [7, 4] });
  preview.removed.points.forEach((point) => {
    const anchor = toScreen(point);
    removed.add(new paperScope.Segment(
      anchor,
      point.handleIn ? toScreen({ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }).subtract(anchor) : undefined,
      point.handleOut ? toScreen({ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }).subtract(anchor) : undefined
    ));
  });
  removed.closed = preview.removed.closed;
  preview.intersections.forEach((point) => new paperScope.Path.Circle({
    center: toScreen(point),
    radius: 7,
    fillColor: "#f59e0b",
    strokeColor: "#111827",
    strokeWidth: 2
  }));
}

function drawPaperPrimitiveDraft(draft: DesignerPrimitiveDraft | null, rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle) {
  if (!draft || draft.bounds.width <= 0 || draft.bounds.height <= 0) return;
  const color = draft.target === "build_area" ? "#a78bfa" : draft.target === "face_graphic" ? "#f472b6" : "#38bdf8";
  const options = {
    rectangle: rectToScreen(draft.bounds),
    fillColor: draft.target === "build_area" ? "rgba(167,139,250,0.10)" : draft.target === "face_graphic" ? "rgba(244,114,182,0.12)" : "rgba(56,189,248,0.10)",
    strokeColor: color,
    strokeWidth: 1.5,
    dashArray: [8, 5]
  };
  if (draft.shape === "ellipse") new paperScope.Path.Ellipse(options);
  else new paperScope.Path.Rectangle(options);
}

/** Animation presentation: same Paper geometry and viewport as Designer, without fabrication layers. */
export function drawPaperAnimationMap({ designer, layout, viewport, selectedZoneId, canvasSize, colorMode, animationPixels = [] }: {
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  viewport: DesignerViewport;
  selectedZoneId?: string;
  canvasSize: { width: number; height: number };
  colorMode: "day" | "night";
  animationPixels?: Array<{ output: number; serialIndex: number; color: { r: number; g: number; b: number } }>;
  animationDiffusers?: Record<string, "as_built" | "led_map">;
}) {
  const colors = colorMode === "night" ? { workspace: "#020617", document: "#090d16", documentStroke: "#1e293b", grid: "#334155", label: "#94a3b8" } : { workspace: "#e2e8f0", document: "#ffffff", documentStroke: "#94a3b8", grid: "#94a3b8", label: "#475569" };
  paperScope.project.clear();
  const toScreen = (point: DesignerPoint) => new paperScope.Point(((point.x - viewport.x) / viewport.width) * canvasSize.width, ((point.y - viewport.y) / viewport.height) * canvasSize.height);
  const rectToScreen = (shape: { x: number; y: number; width: number; height: number }) => new paperScope.Rectangle(toScreen({ x: shape.x, y: shape.y }), toScreen({ x: shape.x + shape.width, y: shape.y + shape.height }));
  new paperScope.Path.Rectangle({ rectangle: new paperScope.Rectangle(0, 0, canvasSize.width, canvasSize.height), fillColor: colors.workspace });
  new paperScope.Path.Rectangle({ rectangle: rectToScreen({ x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm }), fillColor: colors.document, strokeColor: colors.documentStroke, strokeWidth: 1.2 });
  [...designer.zones].filter((zone) => zone.visible !== false).reverse().forEach((zone) => {
    const selected = zone.id === selectedZoneId;
    const path = drawPaperClosedShape(zone, { fillColor: selected ? "rgba(37,99,235,0.25)" : "rgba(100,116,139,0.11)", strokeColor: selected ? "#60a5fa" : "#475569", strokeWidth: selected ? 2.2 : 1.15, toScreen, rectToScreen });
    path.opacity = designer.layers.zones.opacity;
    new paperScope.PointText({ point: toScreen({ x: zone.x + 1.2, y: zone.y + 2.5 }), content: zone.name, fillColor: selected ? "#bfdbfe" : colors.label, fontFamily: "sans-serif", fontSize: selected ? 13 : 11, opacity: selected ? 1 : 0.8 });
  });
  const renderedColors = new Map(animationPixels.map((pixel) => [`${pixel.output}:${pixel.serialIndex}`, pixel.color]));
  layout.pixelMap.forEach((pixel) => {
    const point = toScreen(pixel);
    const selected = selectedZoneId ? designer.zones.some((zone) => zone.id === selectedZoneId && pointInsideDesignerShape(zone, pixel)) : false;
    const dotSize = Math.max(3, Math.min(9, (100 / Math.max(1, designer.addressablePixelsPerMeter)) * canvasSize.width / viewport.width * 1.35));
    const rendered = renderedColors.get(`${pixel.output}:${pixel.serialIndex}`);
    const fillColor = rendered ? `rgb(${rendered.r}, ${rendered.g}, ${rendered.b})` : selected ? "#60a5fa" : "#64748b";
    new paperScope.Path.Rectangle({ rectangle: new paperScope.Rectangle(point.x - dotSize / 2, point.y - dotSize / 2, dotSize, dotSize), radius: Math.min(2, dotSize / 4), fillColor, strokeColor: selected ? "#dbeafe" : "#1e293b", strokeWidth: 0.75 });
  });
  new paperScope.PointText({ point: new paperScope.Point(18, canvasSize.height - 16), content: `${layout.pixelMap.length} mapped pixels`, fillColor: colors.label, fontFamily: "monospace", fontSize: 11 });
}

function drawPaperMeasurement(measurement: DesignerMeasurement | null, unit: DesignerForm["rulerUnit"], toScreen: (point: DesignerPoint) => PaperPoint) {
  if (!measurement) return;
  const start = toScreen(measurement.start);
  const end = toScreen(measurement.end ?? measurement.start);
  const distanceCm = Math.hypot((measurement.end?.x ?? measurement.start.x) - measurement.start.x, (measurement.end?.y ?? measurement.start.y) - measurement.start.y);
  new paperScope.Path.Circle({ center: start, radius: 4.5, fillColor: "#38bdf8", strokeColor: "#082f49", strokeWidth: 1.2 });
  if (!measurement.end) return;
  new paperScope.Path.Line({ from: start, to: end, strokeColor: "#38bdf8", strokeWidth: 1.8, dashArray: [6, 4] });
  new paperScope.Path.Circle({ center: end, radius: 4.5, fillColor: "#38bdf8", strokeColor: "#082f49", strokeWidth: 1.2 });
  const midpoint = start.add(end).divide(2);
  const label = new paperScope.PointText({
    point: midpoint.add(new paperScope.Point(0, -9)),
    content: formatMeasure(distanceCm, unit),
    fillColor: "#e0f2fe",
    fontFamily: "monospace",
    fontSize: 12,
    justification: "center"
  });
  const bounds = label.bounds.expand(8, 5);
  const labelBackground = new paperScope.Path.Rectangle({ rectangle: bounds, fillColor: "#0c4a6e", strokeColor: "#38bdf8", strokeWidth: 0.8, radius: 3 });
  labelBackground.insertBelow(label);
}

function drawPaperDocumentCanvas(designer: DesignerForm, toScreen: (point: DesignerPoint) => PaperPoint, rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle, colors: { document: string; documentStroke: string; label: string }) {
  const documentBounds = { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };
  new paperScope.Path.Rectangle({
    rectangle: rectToScreen(documentBounds),
    fillColor: colors.document,
    strokeColor: colors.documentStroke,
    strokeWidth: 1.4
  });
  const labelPoint = toScreen({ x: 1.2, y: 2.4 });
  new paperScope.PointText({
    point: labelPoint,
    content: `DESIGN CANVAS ${formatDecimal(designer.canvasWidthCm)} x ${formatDecimal(designer.canvasHeightCm)} cm`,
    fillColor: colors.label,
    fontFamily: "monospace",
    fontSize: 11,
    opacity: 0.78
  });
}

function drawPaperGrid(designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, toScreen: (point: DesignerPoint) => PaperPoint, gridColor: string) {
  const step = Math.max(1, designer.snapCm);
  const startX = Math.max(0, Math.ceil(viewport.x / step) * step);
  const endX = Math.min(designer.canvasWidthCm, viewport.x + viewport.width);
  const startY = Math.max(0, Math.ceil(viewport.y / step) * step);
  const endY = Math.min(designer.canvasHeightCm, viewport.y + viewport.height);
  const top = toScreen({ x: 0, y: 0 }).y;
  const bottom = toScreen({ x: 0, y: designer.canvasHeightCm }).y;
  const left = toScreen({ x: 0, y: 0 }).x;
  const right = toScreen({ x: designer.canvasWidthCm, y: 0 }).x;
  for (let x = startX; x <= endX; x += step) {
    const screenX = toScreen({ x, y: viewport.y }).x;
    new paperScope.Path.Line({
      from: [screenX, top],
      to: [screenX, bottom],
      strokeColor: gridColor,
      strokeWidth: x % (step * 5) === 0 ? 0.75 : 0.35,
      opacity: x % (step * 5) === 0 ? 0.42 : 0.24
    });
  }
  for (let y = startY; y <= endY; y += step) {
    const screenY = toScreen({ x: viewport.x, y }).y;
    new paperScope.Path.Line({
      from: [left, screenY],
      to: [right, screenY],
      strokeColor: gridColor,
      strokeWidth: y % (step * 5) === 0 ? 0.75 : 0.35,
      opacity: y % (step * 5) === 0 ? 0.42 : 0.24
    });
  }
}

function drawPaperShapeDraft(draft: DesignerShapeDraft | null, toScreen: (point: DesignerPoint) => PaperPoint, lengthToScreen: (lengthCm: number) => number) {
  if (!draft) return;
  const draftChannel: DesignerChannelForm | null = draft.target === "channel" && draft.points.length >= 2 ? {
    id: "channel_draft",
    name: "Channel draft",
    points: smoothOpenBezierPoints(draft.points),
    pathMode: "bezier",
    widthMm: draft.widthMm ?? 10,
    closed: false,
    cap: "round",
    visible: true,
    locked: false,
    opacity: 1
  } : null;
  const tightDraft = draftChannel ? channelTightBend(draftChannel) : null;
  const draftTrace = draftChannel ? channelCenterPolyline(draftChannel) : draft.points;
  const draftColor = draft.target === "work_line" ? "#14b8a6" : draft.target === "build_area" ? "#a78bfa" : draft.target === "channel" ? "#f59e0b" : draft.target === "face_graphic" ? "#f472b6" : "#38bdf8";
  if (draft.target === "channel") {
    const channelBand = new paperScope.Path({
      strokeColor: draftColor,
      strokeWidth: Math.max(1, lengthToScreen((draft.widthMm ?? 10) / 10)),
      strokeCap: "round",
      opacity: 0.28
    });
    draftTrace.forEach((point) => channelBand.add(toScreen(point)));
  }
  const path = new paperScope.Path({
    strokeColor: draftColor,
    strokeWidth: 1.5,
    dashArray: [8, 5]
  });
  draftTrace.forEach((point) => path.add(toScreen(point)));
  if (draft.target !== "channel" && draft.target !== "work_line" && draft.points.length > 2) {
    const closeLine = new paperScope.Path.Line({
      from: toScreen(draft.points[draft.points.length - 1]),
      to: toScreen(draft.points[0]),
      strokeColor: draftColor,
      strokeWidth: 1,
      dashArray: [3, 5]
    });
    closeLine.opacity = 0.8;
  }
  draft.points.forEach((point, index) => {
    new paperScope.Path.Circle({
      center: toScreen(point),
      radius: index === 0 ? 6 : 4.5,
      fillColor: index === 0 ? "#22c55e" : "#f8fafc",
      strokeColor: draftColor,
      strokeWidth: 1.3
    });
  });
  if (tightDraft) drawPaperChannelBendMarker(tightDraft, toScreen);
}

function drawPaperWorkLine(line: DesignerWorkLineForm, options: { selected: boolean; selectedPointIndex?: number; toScreen: (point: DesignerPoint) => PaperPoint }) {
  const path = new paperScope.Path({
    strokeColor: options.selected ? "#2dd4bf" : "#0d9488",
    strokeWidth: options.selected ? 2 : 1.2,
    dashArray: [7, 5],
    opacity: options.selected ? 1 : 0.72
  });
  line.points.forEach((point) => path.add(options.toScreen(point)));
  if (options.selected) {
    drawPaperPolygonNodes(line.id, line.points, options.selectedPointIndex, "#0f766e", options.toScreen);
    const anchor = options.toScreen(line.points[0]);
    new paperScope.PointText({ point: new paperScope.Point(anchor.x + 8, anchor.y - 8), content: `SELECTED · ${line.name}`, fillColor: "#5eead4", fontFamily: "monospace", fontSize: 10 });
  }
}

function drawPaperBuildArea(buildArea: DesignerBuildAreaForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  filletCandidateIndices?: Set<number>;
  filletMode?: boolean;
  opacity: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  const shape = drawPaperClosedShape(buildArea, {
    fillColor: "rgba(167,139,250,0.07)",
    strokeColor: options.selected ? "#ddd6fe" : "#8b5cf6",
    strokeWidth: options.selected ? 2 : 1.2,
    dashArray: [7, 5],
    toScreen: options.toScreen,
    rectToScreen: options.rectToScreen
  });
  shape.opacity = options.opacity;
  const labelPoint = options.toScreen({ x: buildArea.x + 1.2, y: buildArea.y + 2.5 });
  new paperScope.PointText({
    point: labelPoint,
    content: `REF · ${buildArea.name} ${formatDecimal(buildArea.width)}x${formatDecimal(buildArea.height)} cm`,
    fillColor: "#ddd6fe",
    fontFamily: "monospace",
    fontSize: 12
  });
  if (options.selected) drawPaperResizeHandles(buildArea, options, options.filletMode && buildArea.shape === "rect");
  if (options.selected && buildArea.shape === "polygon" && buildArea.points) drawPaperShapeNodes(buildArea.id, buildArea, options.selectedPointIndex, "#7c3aed", "#a78bfa", options.toScreen, options.filletCandidateIndices);
}

function drawPaperObjectSafely(kind: string, id: string, draw: () => void) {
  try {
    draw();
  } catch (error) {
    // A malformed persisted/imported object must never abort the full frame
    // after project.clear(). Keep every other canvas object renderable.
    console.error(`Designer skipped invalid ${kind} ${id}.`, error);
  }
}

function drawPaperZone(zone: DesignerZoneForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  filletCandidateIndices?: Set<number>;
  filletMode?: boolean;
  opacity: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  const shape = drawPaperClosedShape(zone, {
    fillColor: options.selected ? "rgba(14,165,233,0.24)" : "rgba(37,99,235,0.16)",
    strokeColor: options.selected ? "#38bdf8" : "#2563eb",
    strokeWidth: options.selected ? 2 : 1.6,
    toScreen: options.toScreen,
    rectToScreen: options.rectToScreen
  });
  shape.opacity = options.opacity;
  const labelPoint = options.toScreen({ x: zone.x + 1.2, y: zone.y + 2.5 });
  new paperScope.PointText({
    point: labelPoint,
    content: `${zone.name} ${formatDecimal(zone.width)}x${formatDecimal(zone.height)} cm`,
    fillColor: options.selected ? "#7dd3fc" : "#2563eb",
    fontFamily: "monospace",
    fontSize: 12,
    opacity: Math.max(0.45, options.opacity)
  });
  if (options.selected) drawPaperResizeHandles(zone, options, options.filletMode && zone.shape === "rect");
  if (options.selected && zone.shape === "polygon" && zone.points) drawPaperShapeNodes(zone.id, zone, options.selectedPointIndex, "#2563eb", "#38bdf8", options.toScreen, options.filletCandidateIndices);
}

function drawPaperChannel(channel: DesignerChannelForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  interactive?: boolean;
  filletCandidateIndices?: Set<number>;
  filletMode?: boolean;
  opacity: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  lengthToScreen: (cm: number) => number;
}) {
  const center = channelCenterPolyline(channel);
  const tightBend = options.interactive ? null : channelTightBend(channel);
  if (center.length >= 2) {
    const channelStrokeWidth = Math.max(1, options.lengthToScreen(channelWidthCm(channel)));
    // Draw the band by stroking the center path with the channel width. This is
    // the swept footprint of a circular router bit along the center path.
    const band = new paperScope.Path({
      strokeColor: options.selected ? "rgba(245,158,11,0.30)" : "rgba(148,163,184,0.16)",
      strokeWidth: channelStrokeWidth,
      strokeJoin: "round",
      strokeCap: channel.cap === "round" ? "round" : "butt",
      opacity: options.opacity
    });
    center.forEach((point) => band.add(options.toScreen(point)));
    band.closed = channelIsClosed(channel);

    const borderOptions = {
      strokeColor: options.selected ? "#f59e0b" : "#94a3b8",
      strokeWidth: options.selected ? 1.6 : 1,
      opacity: options.opacity
    };
    if (!options.interactive) {
      resolveChannelOutlineContours(channel).forEach((contour) => {
        const border = new paperScope.Path(borderOptions);
        contour.points.forEach((point) => {
          const anchor = options.toScreen(point);
          border.add(new paperScope.Segment(
            anchor,
            point.handleIn ? options.toScreen({ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }).subtract(anchor) : undefined,
            point.handleOut ? options.toScreen({ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }).subtract(anchor) : undefined
          ));
        });
        border.closed = true;
      });
    }

    const centerLine = new paperScope.Path({
      strokeColor: options.selected ? "#fbbf24" : "#cbd5e1",
      strokeWidth: 1,
      dashArray: [5, 4],
      opacity: Math.max(0.5, options.opacity)
    });
    center.forEach((point) => centerLine.add(options.toScreen(point)));
    centerLine.closed = channelIsClosed(channel);
  }
  const anchor = channel.points[0];
  if (anchor) {
    new paperScope.PointText({
      point: options.toScreen({ x: anchor.x + 1, y: anchor.y - 1.2 }),
      content: `${channel.name} ${channel.widthMm} mm`,
      fillColor: options.selected ? "#fde68a" : "#94a3b8",
      fontFamily: "monospace",
      fontSize: 11,
      opacity: Math.max(0.5, options.opacity)
    });
  }
  if (tightBend) drawPaperChannelBendMarker(tightBend, options.toScreen);
  if (options.selected && channel.points.length) {
    drawPaperPolygonNodes(channel.id, channel.points, options.selectedPointIndex, "#b45309", options.toScreen, options.filletCandidateIndices);
    if (channel.pathMode === "bezier") drawPaperBezierHandles(channel.id, channel.points, options.selectedPointIndex, "#f59e0b", options.toScreen);
  }
}

function drawPaperChannelBendMarker(measurement: ChannelBendMeasurement, toScreen: (point: DesignerPoint) => PaperPoint) {
  const center = toScreen(measurement.point);
  new paperScope.Path.Circle({
    center,
    radius: 8,
    fillColor: "rgba(239,68,68,0.22)",
    strokeColor: "#ef4444",
    strokeWidth: 2
  });
  new paperScope.PointText({
    point: new paperScope.Point(center.x + 11, center.y - 10),
    content: `R ${formatDecimal(measurement.radiusMm)} / ${formatDecimal(measurement.requiredRadiusMm)} mm`,
    fillColor: "#f87171",
    fontFamily: "monospace",
    fontSize: 10
  });
}

function drawPaperFaceGraphic(element: DesignerFaceGraphicForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  filletCandidateIndices?: Set<number>;
  filletMode?: boolean;
  opacity: number;
  vinylPreview?: boolean;
  editable?: boolean;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  const fillColor = options.vinylPreview
    ? element.passMode === "opaque" ? "#050505" : "#ffffff"
    : element.passMode === "opaque"
      ? "rgba(15,23,42,0.78)"
      : element.passMode === "clear"
        ? "rgba(255,255,255,0.04)"
        : `${element.filterColor}66`;
  const shape = drawPaperClosedShape(element, {
    fillColor,
    strokeColor: options.vinylPreview ? options.selected ? "#22d3ee" : element.passMode === "opaque" ? "#475569" : "#cbd5e1" : options.selected ? "#f472b6" : "#db2777",
    strokeWidth: options.selected ? 2 : 1.2,
    dashArray: !options.vinylPreview && element.passMode === "clear" ? [5, 4] : undefined,
    toScreen: options.toScreen,
    rectToScreen: options.rectToScreen
  });
  shape.opacity = options.opacity;
  if (!options.vinylPreview || options.selected) {
    new paperScope.PointText({
      point: options.toScreen({ x: element.x + 1.2, y: element.y + 2.5 }),
      content: `FACE · ${element.name} · ${element.passMode}`,
      fillColor: options.vinylPreview ? "#22d3ee" : options.selected ? "#f9a8d4" : "#f472b6",
      fontFamily: "monospace",
      fontSize: 11,
      opacity: Math.max(0.55, options.opacity)
    });
  }
  if (options.selected && options.editable !== false) drawPaperResizeHandles(element, options, options.filletMode && element.shape === "rect");
  if (options.selected && options.editable !== false && element.shape === "polygon" && element.points) {
    drawPaperShapeNodes(element.id, element, options.selectedPointIndex, options.vinylPreview ? "#0891b2" : "#be185d", options.vinylPreview ? "#22d3ee" : "#f472b6", options.toScreen, options.filletCandidateIndices);
  }
}

function drawPaperShapeNodes(
  id: string,
  shape: Pick<DesignerBuildAreaForm, "points" | "contours" | "pathMode">,
  selectedPointIndex: number | undefined,
  nodeColor: string,
  handleColor: string,
  toScreen: (point: DesignerPoint) => PaperPoint,
  filletCandidateIndices?: Set<number>
) {
  const contours = shape.contours?.length ? shape.contours : shape.points ? [{ points: shape.points, pathMode: shape.pathMode ?? "straight", closed: true as const }] : [];
  let offset = 0;
  contours.forEach((contour, contourIndex) => {
    const localSelectedIndex = typeof selectedPointIndex === "number" && selectedPointIndex >= offset && selectedPointIndex < offset + contour.points.length
      ? selectedPointIndex - offset
      : undefined;
    drawPaperPolygonNodes(`${id}:contour:${contourIndex}`, contour.points, localSelectedIndex, nodeColor, toScreen, contourIndex === 0 ? filletCandidateIndices : undefined);
    if (contour.pathMode === "bezier") drawPaperBezierHandles(`${id}:contour:${contourIndex}`, contour.points, localSelectedIndex, handleColor, toScreen);
    offset += contour.points.length;
  });
}

function drawPaperClosedShape(shape: Pick<DesignerBuildAreaForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode" | "fillRule">, options: {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  dashArray?: number[];
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  if (shape.shape === "polygon" && shape.contours && shape.contours.length > 1) {
    const compound = new paperScope.CompoundPath({
      fillColor: options.fillColor,
      strokeColor: options.strokeColor,
      strokeWidth: options.strokeWidth,
      dashArray: options.dashArray,
      fillRule: shape.fillRule ?? "evenodd"
    });
    shape.contours.forEach((contour) => compound.addChild(drawPaperContour(contour, options.toScreen)));
    return compound;
  }
  if (shape.shape === "polygon" && shape.points) {
    const path = drawPaperContour({ points: shape.points, pathMode: shape.pathMode ?? "straight", closed: true }, options.toScreen);
    path.set({
      fillColor: options.fillColor,
      strokeColor: options.strokeColor,
      strokeWidth: options.strokeWidth,
      dashArray: options.dashArray
    });
    return path;
  }
  if (shape.shape === "ellipse") {
    return new paperScope.Path.Ellipse({
      rectangle: options.rectToScreen(shape),
      fillColor: options.fillColor,
      strokeColor: options.strokeColor,
      strokeWidth: options.strokeWidth,
      dashArray: options.dashArray
    });
  }
  return new paperScope.Path.Rectangle({
    rectangle: options.rectToScreen(shape),
    radius: 4,
    fillColor: options.fillColor,
    strokeColor: options.strokeColor,
    strokeWidth: options.strokeWidth,
    dashArray: options.dashArray
  });
}

function drawPaperContour(contour: DesignerContour, toScreen: (point: DesignerPoint) => PaperPoint) {
  const path = new paperScope.Path();
  contour.points.forEach((point) => path.add(toScreen(point)));
  if (contour.pathMode === "bezier") {
    contour.points.forEach((point, index) => {
      const anchor = toScreen(point);
      if (point.handleIn) path.segments[index].handleIn = toScreen({ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }).subtract(anchor);
      if (point.handleOut) path.segments[index].handleOut = toScreen({ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }).subtract(anchor);
    });
  }
  path.closed = true;
  return path;
}

function drawPaperResizeHandles(shape: { x: number; y: number; width: number; height: number }, options: { toScreen: (point: DesignerPoint) => PaperPoint }, filletCandidate = false) {
  [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x, y: shape.y + shape.height },
    { x: shape.x + shape.width, y: shape.y + shape.height }
  ].forEach((point) => {
    new paperScope.Path.Circle({
      center: options.toScreen(point),
      radius: 5,
      fillColor: filletCandidate ? "#22c55e" : "#f8fafc",
      strokeColor: filletCandidate ? "#dcfce7" : "#2563eb",
      strokeWidth: filletCandidate ? 2 : 1.5
    });
  });
}

function drawPaperPolygonNodes(id: string, points: DesignerPoint[], selectedPointIndex: number | undefined, strokeColor: string, toScreen: (point: DesignerPoint) => PaperPoint, filletCandidateIndices?: Set<number>) {
  points.forEach((point, index) => {
    const selected = selectedPointIndex === index;
    const filletCandidate = filletCandidateIndices?.has(index) === true;
    const center = toScreen(point);
    const options = {
      fillColor: selected ? "#facc15" : filletCandidate ? "#22c55e" : "#f8fafc",
      strokeColor: selected ? "#0f172a" : filletCandidate ? "#dcfce7" : strokeColor,
      strokeWidth: filletCandidate ? 2 : 1.4,
      name: `${id}:point:${index}`
    };
    if (point.nodeType === "corner") {
      new paperScope.Path.RegularPolygon({ center, sides: 4, radius: selected ? 7 : 5.5, ...options });
    } else if (point.nodeType === "straight") {
      const side = selected ? 11 : 8;
      new paperScope.Path.Rectangle({ rectangle: new paperScope.Rectangle(center.x - side / 2, center.y - side / 2, side, side), ...options });
    } else {
      new paperScope.Path.Circle({ center, radius: selected ? 6 : 4.8, ...options });
    }
  });
}

function drawPaperBezierHandles(id: string, points: DesignerPoint[], selectedPointIndex: number | undefined, color: string, toScreen: (point: DesignerPoint) => PaperPoint) {
  if (typeof selectedPointIndex !== "number") return;
  const point = points[selectedPointIndex];
  if (!point) return;
  (["in", "out"] as const).forEach((handle) => {
    const vector = handle === "in" ? point.handleIn : point.handleOut;
    if (!vector) return;
    const anchor = toScreen(point);
    const control = toScreen({ x: point.x + vector.x, y: point.y + vector.y });
    new paperScope.Path.Line({
      from: anchor,
      to: control,
      strokeColor: color,
      strokeWidth: 1,
      dashArray: [4, 3],
      opacity: 0.9
    });
    new paperScope.Path.Circle({
      center: control,
      radius: 4.6,
      fillColor: "#f8fafc",
      strokeColor: color,
      strokeWidth: 1.5,
      name: `${id}:handle:${selectedPointIndex}:${handle}`
    });
  });
}

function drawPaperRoute(route: DesignerRouteForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  opacity: number;
  addressablePixelsPerMeter: number;
  ledsPerMeter: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  lengthToScreen: (cm: number) => number;
}) {
  const strokeColor = options.selected ? routeSelectedColor(route.kind) : routeColor(route);
  const mainWidth = route.kind === "data_cable" ? (options.selected ? 3.2 : 2.2) : (options.selected ? 3.4 : 1.8);
  const shadowWidth = mainWidth + 2.2;
  const shadow = new paperScope.Path({
    strokeColor: "#020617",
    strokeWidth: shadowWidth,
    strokeCap: "round",
    strokeJoin: "round"
  });
  route.points.forEach((point) => shadow.add(options.toScreen(point)));
  shadow.opacity = Math.min(0.45, Math.max(0.22, options.opacity * 0.38));

  const path = new paperScope.Path({
    strokeColor,
    strokeWidth: mainWidth,
    strokeCap: "round",
    strokeJoin: "round"
  });
  route.points.forEach((point) => path.add(options.toScreen(point)));
  path.opacity = Math.max(0.88, options.opacity);
  if (route.kind === "led_string") {
    // WS2812B "5050" packages are approximately 5 x 5 mm.
    const packageSide = Math.max(1.5, options.lengthToScreen(0.5));
    sampleRouteLedDots(route, options.ledsPerMeter, options.addressablePixelsPerMeter).forEach((dot) => {
      const center = options.toScreen(dot);
      const ledPackage = new paperScope.Path.Rectangle({
        rectangle: new paperScope.Rectangle(center.x - packageSide / 2, center.y - packageSide / 2, packageSide, packageSide),
        fillColor: options.selected ? "#f0abfc" : "#fbbf24",
        strokeColor: options.selected ? "#831843" : "#92400e",
        strokeWidth: options.selected ? 1.3 : 0.8,
        opacity: 1
      });
      ledPackage.rotate(dot.angle, center);
    });
  }
  routeDirectionMarkers(route).forEach((marker) => drawPaperArrowMarker(marker, route.kind, options.selected, options.toScreen));
  route.points.forEach((point, index) => {
    if (point.joint) {
      new paperScope.Path.Circle({
        center: options.toScreen(point),
        radius: 5.2,
        strokeColor: "#22d3ee",
        strokeWidth: 1.4
      });
    }
    new paperScope.Path.Circle({
      center: options.toScreen(point),
      radius: point.joint ? 3.8 : options.selectedPointIndex === index ? 3.8 : options.selected ? 3.1 : 2.4,
      fillColor: routePointFill(route, index, point, options.selectedPointIndex === index),
      strokeColor: "#020617",
      strokeWidth: point.joint ? 1.4 : 0.8
    });
  });
}

function drawPaperRouteDraft(draft: DesignerRouteDraft | null, toScreen: (point: DesignerPoint) => PaperPoint) {
  if (!draft || draft.points.length !== 1) return;
  new paperScope.Path.Circle({
    center: toScreen(draft.points[0]),
    radius: 5,
    fillColor: draft.kind === "data_cable" ? "#22c55e" : "#f59e0b",
    strokeColor: "#020617",
    strokeWidth: 1
  });
}

function drawPaperArrowMarker(marker: { x: number; y: number; angle: number }, kind: DesignerRouteKind, selected: boolean, toScreen: (point: DesignerPoint) => PaperPoint) {
  const center = toScreen(marker);
  const arrow = new paperScope.Path({
    fillColor: selected ? kind === "data_cable" ? "#d9f99d" : "#fdf2f8" : kind === "data_cable" ? "#bbf7d0" : "#fde68a",
    strokeColor: selected && kind === "led_string" ? "#831843" : "#020617",
    strokeWidth: selected ? 1 : 0.6
  });
  // Direction is a UI annotation, so it keeps a stable screen size instead of
  // growing with the physical document as the operator zooms in.
  const size = 7;
  arrow.add(new paperScope.Point(-0.85 * size, -0.58 * size));
  arrow.add(new paperScope.Point(0.95 * size, 0));
  arrow.add(new paperScope.Point(-0.85 * size, 0.58 * size));
  arrow.add(new paperScope.Point(-0.28 * size, 0));
  arrow.closed = true;
  arrow.rotate(marker.angle);
  arrow.position = center;
}

function drawPaperController(controller: DesignerControllerForm, options: {
  selected: boolean;
  connectedPorts: Set<number>;
  snapCm: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
  lengthToScreen: (cm: number) => number;
}) {
  new paperScope.Path.Rectangle({
    rectangle: options.rectToScreen(controller),
    radius: 6,
    fillColor: "#065f46",
    strokeColor: options.selected ? "#67e8f9" : "#34d399",
    strokeWidth: options.selected ? 2.4 : 1.6
  });
  drawControllerPcbDetails(controller, options);
  const labelPoint = options.toScreen({ x: controller.x + 1.2, y: controller.y - 1 });
  new paperScope.PointText({
    point: labelPoint,
    content: controller.name,
    fillColor: "#bbf7d0",
    fontFamily: "monospace",
    fontSize: 12
  });
  const portSpacing = controller.height / (controller.dataOutputs + 1);
  for (let portIndex = 0; portIndex < controller.dataOutputs; portIndex += 1) {
    const port = controllerPortPoint(controller, portIndex, options.snapCm);
    new paperScope.Path.Circle({
      center: options.toScreen(port),
      radius: 3.3,
      fillColor: options.connectedPorts.has(portIndex) ? "#22d3ee" : "#ef4444",
      strokeColor: "#020617",
      strokeWidth: 0.8
    });
    const textPoint = options.toScreen({ x: controller.x + controller.width - 2.4, y: port.y + 0.5 });
    new paperScope.PointText({
      point: textPoint,
      content: String(portIndex + 1),
      fillColor: "#ecfeff",
      fontSize: 9
    });
    drawPaperArrowMarker({ x: controller.x + controller.width - 3, y: port.y, angle: 0 }, "data_cable", false, options.toScreen);
  }
}

function drawControllerPcbDetails(controller: DesignerControllerForm, options: {
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
  lengthToScreen: (cm: number) => number;
}) {
  const chips = [
    { x: controller.x + controller.width * 0.16, y: controller.y + controller.height * 0.26, width: controller.width * 0.28, height: controller.height * 0.24 },
    { x: controller.x + controller.width * 0.48, y: controller.y + controller.height * 0.58, width: controller.width * 0.24, height: controller.height * 0.2 }
  ];
  chips.forEach((chip) => {
    new paperScope.Path.Rectangle({
      rectangle: options.rectToScreen(chip),
      radius: 1.5,
      fillColor: "#0b1220",
      strokeColor: "#34d399",
      strokeWidth: 0.7,
      opacity: 0.92
    });
    const pinCount = 3;
    for (let pin = 0; pin < pinCount; pin += 1) {
      const y = chip.y + chip.height * ((pin + 1) / (pinCount + 1));
      new paperScope.Path.Line({
        from: options.toScreen({ x: chip.x - chip.width * 0.16, y }),
        to: options.toScreen({ x: chip.x, y }),
        strokeColor: "#34d399",
        strokeWidth: 0.6,
        opacity: 0.75
      });
      new paperScope.Path.Line({
        from: options.toScreen({ x: chip.x + chip.width, y }),
        to: options.toScreen({ x: chip.x + chip.width * 1.16, y }),
        strokeColor: "#34d399",
        strokeWidth: 0.6,
        opacity: 0.75
      });
    }
    new paperScope.Path.Circle({
      center: options.toScreen({ x: chip.x + chip.width * 0.2, y: chip.y + chip.height * 0.24 }),
      radius: Math.max(0.8, options.lengthToScreen(0.22)),
      fillColor: "#a7f3d0",
      opacity: 0.9
    });
  });
  new paperScope.Path.Circle({
    center: options.toScreen({ x: controller.x + controller.width * 0.14, y: controller.y + controller.height * 0.15 }),
    radius: Math.max(0.8, options.lengthToScreen(0.28)),
    fillColor: "#22d3ee",
    strokeColor: "#020617",
    strokeWidth: 0.5
  });
}

function drawPaperActiveLayerLabel(activeLayer: DesignerActiveLayer | null, canvasSize: { width: number; height: number }) {
  new paperScope.PointText({
    point: new paperScope.Point(canvasSize.width - 190, canvasSize.height - 14),
    content: `PAPER.JS · ${activeLayer ? activeLayer.toUpperCase() : "NO PLANE"}`,
    fillColor: "#64748b",
    fontFamily: "monospace",
    fontSize: 11
  });
}
