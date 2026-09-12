import type { DesignerBuildAreaForm, DesignerControllerForm, DesignerForm, DesignerPoint, DesignerRouteForm, DesignerRouteKind, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import type { DesignerActiveLayer, DesignerMeasurement, DesignerRouteDraft, DesignerShapeDraft, DesignerViewport, PaperApi, PaperPoint, PaperRectangle } from "./types";
import { controllerConnectedPorts, controllerPortPoint, formatDecimal, formatMeasure, pointInsideDesignerShape, routeColor, routeDirectionMarkers, routePointFill, routeSelectedColor, sampleRouteLedDots } from "./designer-geometry";
import type { CompiledDesignerLayout } from "./designer-compiler";

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
  selectedZoneId,
  selectedZonePointIndex,
  selectedRouteId,
  selectedRoutePointIndex,
  selectedController,
  routeDraft,
  shapeDraft,
  measurement,
  canvasSize,
  colorMode
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer;
  viewport: DesignerViewport;
  selectedBuildAreaId?: string;
  selectedBuildAreaPointIndex?: number;
  selectedZoneId?: string;
  selectedZonePointIndex?: number;
  selectedRouteId?: string;
  selectedRoutePointIndex?: number;
  selectedController: boolean;
  routeDraft: DesignerRouteDraft | null;
  shapeDraft: DesignerShapeDraft | null;
  measurement: DesignerMeasurement | null;
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
  const rectToScreen = (shape: { x: number; y: number; width: number; height: number }) => {
    const topLeft = toScreen({ x: shape.x, y: shape.y });
    const bottomRight = toScreen({ x: shape.x + shape.width, y: shape.y + shape.height });
    return new paperScope.Rectangle(topLeft, bottomRight);
  };

  new paperScope.Path.Rectangle({
    rectangle: new paperScope.Rectangle(0, 0, canvasSize.width, canvasSize.height),
    fillColor: colors.workspace
  });
  drawPaperDocumentCanvas(designer, toScreen, rectToScreen, colors);
  drawPaperGrid(designer, viewport, canvasSize, toScreen, colors.grid);
  drawPaperShapeDraft(shapeDraft, toScreen);

  if (designer.layers.reference.visible) {
    const layerOpacity = designer.layers.reference.opacity;
    designer.buildAreas.forEach((buildArea) => {
      if (!buildArea.visible) return;
      drawPaperBuildArea(buildArea, {
        selected: selectedBuildAreaId === buildArea.id,
        selectedPointIndex: selectedBuildAreaId === buildArea.id ? selectedBuildAreaPointIndex : undefined,
        opacity: layerOpacity * buildArea.opacity,
        toScreen,
        rectToScreen
      });
    });
  }

  if (designer.layers.zones.visible) {
    const layerOpacity = designer.layers.zones.opacity;
    designer.zones.forEach((zone) => {
      if (!zone.visible) return;
      drawPaperZone(zone, {
        selected: selectedZoneId === zone.id,
        selectedPointIndex: selectedZoneId === zone.id ? selectedZonePointIndex : undefined,
        opacity: layerOpacity * zone.opacity,
        toScreen,
        rectToScreen
      });
    });
  }

  if (designer.layers.strings.visible) {
    designer.routes.forEach((route) => {
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
    drawPaperController(designer.controller, {
      selected: selectedController,
      connectedPorts: controllerConnectedPorts(designer.controller, designer.routes, designer.snapCm),
      toScreen,
      rectToScreen,
      lengthToScreen
    });
  }

  drawPaperMeasurement(measurement, designer.rulerUnit, toScreen);
  drawPaperActiveLayerLabel(activeLayer, canvasSize);
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
}) {
  const colors = colorMode === "night" ? { workspace: "#020617", document: "#090d16", documentStroke: "#1e293b", grid: "#334155", label: "#94a3b8" } : { workspace: "#e2e8f0", document: "#ffffff", documentStroke: "#94a3b8", grid: "#94a3b8", label: "#475569" };
  paperScope.project.clear();
  const toScreen = (point: DesignerPoint) => new paperScope.Point(((point.x - viewport.x) / viewport.width) * canvasSize.width, ((point.y - viewport.y) / viewport.height) * canvasSize.height);
  const rectToScreen = (shape: { x: number; y: number; width: number; height: number }) => new paperScope.Rectangle(toScreen({ x: shape.x, y: shape.y }), toScreen({ x: shape.x + shape.width, y: shape.y + shape.height }));
  new paperScope.Path.Rectangle({ rectangle: new paperScope.Rectangle(0, 0, canvasSize.width, canvasSize.height), fillColor: colors.workspace });
  new paperScope.Path.Rectangle({ rectangle: rectToScreen({ x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm }), fillColor: colors.document, strokeColor: colors.documentStroke, strokeWidth: 1.2 });
  designer.zones.filter((zone) => zone.visible).forEach((zone) => {
    const selected = zone.id === selectedZoneId;
    const path = drawPaperClosedShape(zone, { fillColor: selected ? "rgba(37,99,235,0.25)" : "rgba(100,116,139,0.11)", strokeColor: selected ? "#60a5fa" : "#475569", strokeWidth: selected ? 2.2 : 1.15, toScreen, rectToScreen });
    path.opacity = zone.opacity;
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

function drawPaperShapeDraft(draft: DesignerShapeDraft | null, toScreen: (point: DesignerPoint) => PaperPoint) {
  if (!draft) return;
  const path = new paperScope.Path({
    strokeColor: draft.target === "build_area" ? "#93c5fd" : "#38bdf8",
    strokeWidth: 1.5,
    dashArray: [8, 5]
  });
  draft.points.forEach((point) => path.add(toScreen(point)));
  if (draft.points.length > 2) {
    const closeLine = new paperScope.Path.Line({
      from: toScreen(draft.points[draft.points.length - 1]),
      to: toScreen(draft.points[0]),
      strokeColor: draft.target === "build_area" ? "#93c5fd" : "#38bdf8",
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
      strokeColor: draft.target === "build_area" ? "#93c5fd" : "#38bdf8",
      strokeWidth: 1.3
    });
  });
}

function drawPaperBuildArea(buildArea: DesignerBuildAreaForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  opacity: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  const shape = drawPaperClosedShape(buildArea, {
    fillColor: "rgba(59,130,246,0.08)",
    strokeColor: options.selected ? "#60a5fa" : "#93c5fd",
    strokeWidth: options.selected ? 2 : 1.2,
    dashArray: [7, 5],
    toScreen: options.toScreen,
    rectToScreen: options.rectToScreen
  });
  shape.opacity = options.opacity;
  const labelPoint = options.toScreen({ x: buildArea.x + 1.2, y: buildArea.y + 2.5 });
  new paperScope.PointText({
    point: labelPoint,
    content: `${buildArea.name} ${formatDecimal(buildArea.width)}x${formatDecimal(buildArea.height)} cm`,
    fillColor: "#bfdbfe",
    fontFamily: "monospace",
    fontSize: 12
  });
  if (options.selected) drawPaperResizeHandles(buildArea, options);
  if (options.selected && buildArea.shape === "polygon" && buildArea.points) {
    drawPaperPolygonNodes(buildArea.id, buildArea.points, options.selectedPointIndex, "#2563eb", options.toScreen);
    if (buildArea.pathMode === "bezier") drawPaperBezierHandles(buildArea.id, buildArea.points, options.selectedPointIndex, "#60a5fa", options.toScreen);
  }
}

function drawPaperZone(zone: DesignerZoneForm, options: {
  selected: boolean;
  selectedPointIndex?: number;
  opacity: number;
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  const shape = drawPaperClosedShape(zone, {
    fillColor: options.selected ? "rgba(14,165,233,0.24)" : "rgba(148,163,184,0.12)",
    strokeColor: options.selected ? "#38bdf8" : "#64748b",
    strokeWidth: options.selected ? 2 : 1.2,
    toScreen: options.toScreen,
    rectToScreen: options.rectToScreen
  });
  shape.opacity = options.opacity;
  const labelPoint = options.toScreen({ x: zone.x + 1.2, y: zone.y + 2.5 });
  new paperScope.PointText({
    point: labelPoint,
    content: `${zone.name} ${formatDecimal(zone.width)}x${formatDecimal(zone.height)} cm`,
    fillColor: options.selected ? "#7dd3fc" : "#94a3b8",
    fontFamily: "monospace",
    fontSize: 12,
    opacity: Math.max(0.45, options.opacity)
  });
  if (options.selected) drawPaperResizeHandles(zone, options);
  if (options.selected && zone.shape === "polygon" && zone.points) {
    drawPaperPolygonNodes(zone.id, zone.points, options.selectedPointIndex, "#2563eb", options.toScreen);
    if (zone.pathMode === "bezier") drawPaperBezierHandles(zone.id, zone.points, options.selectedPointIndex, "#38bdf8", options.toScreen);
  }
}

function drawPaperClosedShape(shape: DesignerBuildAreaForm | DesignerZoneForm, options: {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  dashArray?: number[];
  toScreen: (point: DesignerPoint) => PaperPoint;
  rectToScreen: (shape: { x: number; y: number; width: number; height: number }) => PaperRectangle;
}) {
  if (shape.shape === "polygon" && shape.points) {
    const path = new paperScope.Path({
      fillColor: options.fillColor,
      strokeColor: options.strokeColor,
      strokeWidth: options.strokeWidth,
      dashArray: options.dashArray
    });
    shape.points.forEach((point) => path.add(options.toScreen(point)));
    if (shape.pathMode === "bezier") {
      shape.points.forEach((point, index) => {
        const anchor = options.toScreen(point);
        if (point.handleIn) path.segments[index].handleIn = options.toScreen({ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }).subtract(anchor);
        if (point.handleOut) path.segments[index].handleOut = options.toScreen({ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }).subtract(anchor);
      });
    }
    path.closed = true;
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

function drawPaperResizeHandles(shape: { x: number; y: number; width: number; height: number }, options: { toScreen: (point: DesignerPoint) => PaperPoint }) {
  [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x, y: shape.y + shape.height },
    { x: shape.x + shape.width, y: shape.y + shape.height }
  ].forEach((point) => {
    new paperScope.Path.Circle({
      center: options.toScreen(point),
      radius: 5,
      fillColor: "#f8fafc",
      strokeColor: "#2563eb",
      strokeWidth: 1.5
    });
  });
}

function drawPaperPolygonNodes(id: string, points: DesignerPoint[], selectedPointIndex: number | undefined, strokeColor: string, toScreen: (point: DesignerPoint) => PaperPoint) {
  points.forEach((point, index) => {
    const selected = selectedPointIndex === index;
    const center = toScreen(point);
    const options = {
      fillColor: selected ? "#facc15" : "#f8fafc",
      strokeColor: selected ? "#0f172a" : strokeColor,
      strokeWidth: 1.4,
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
  const path = new paperScope.Path({
    strokeColor: options.selected ? routeSelectedColor(route.kind) : routeColor(route),
    strokeWidth: route.kind === "data_cable" ? (options.selected ? 2.8 : 1.4) : (options.selected ? 3 : 1.1),
    strokeCap: "round",
    strokeJoin: "round"
  });
  route.points.forEach((point) => path.add(options.toScreen(point)));
  path.opacity = options.opacity;
  if (route.kind === "led_string") {
    // WS2812B "5050" packages are approximately 5 x 5 mm.
    const packageSide = Math.max(1.5, options.lengthToScreen(0.5));
    sampleRouteLedDots(route, options.ledsPerMeter, options.addressablePixelsPerMeter).forEach((dot) => {
      const center = options.toScreen(dot);
      const ledPackage = new paperScope.Path.Rectangle({
        rectangle: new paperScope.Rectangle(center.x - packageSide / 2, center.y - packageSide / 2, packageSide, packageSide),
        fillColor: options.selected ? "#f0abfc" : "#f59e0b",
        strokeColor: options.selected ? "#831843" : dot.addressableIndex % 2 === 0 ? "#020617" : "#78350f",
        strokeWidth: options.selected ? 1.3 : 0.8,
        opacity: options.selected ? 1 : dot.addressableIndex % 2 === 0 ? 1 : 0.82
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
    const port = controllerPortPoint(controller, portIndex, 0.1);
    new paperScope.Path.Circle({
      center: options.toScreen(port),
      radius: 3.3,
      fillColor: options.connectedPorts.has(portIndex) ? "#22d3ee" : "#ef4444",
      strokeColor: "#020617",
      strokeWidth: 0.8
    });
    const textPoint = options.toScreen({ x: controller.x + controller.width - 2.4, y: controller.y + portSpacing * (portIndex + 1) + 0.5 });
    new paperScope.PointText({
      point: textPoint,
      content: String(portIndex + 1),
      fillColor: "#ecfeff",
      fontSize: 9
    });
    drawPaperArrowMarker({ x: controller.x + controller.width - 3, y: controller.y + portSpacing * (portIndex + 1), angle: 0 }, "data_cable", false, options.toScreen);
  }
}

function drawPaperActiveLayerLabel(activeLayer: DesignerActiveLayer, canvasSize: { width: number; height: number }) {
  new paperScope.PointText({
    point: new paperScope.Point(canvasSize.width - 190, canvasSize.height - 14),
    content: `PAPER.JS · ${activeLayer.toUpperCase()}`,
    fillColor: "#64748b",
    fontFamily: "monospace",
    fontSize: 11
  });
}
