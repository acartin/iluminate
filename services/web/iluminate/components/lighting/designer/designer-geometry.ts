import type { DesignerBuildAreaForm, DesignerChannelForm, DesignerContour, DesignerControllerForm, DesignerForm, DesignerGeometry, DesignerPoint, DesignerPointNodeType, DesignerRouteForm, DesignerRouteKind, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { filletDesignerGeometry } from "@/lib/lighting/designer-derived-geometry";
import { estimateDesignerTextBounds } from "@/lib/lighting/designer-text-geometry";
import type { DesignerActiveLayer, DesignerCanvasHit, DesignerFilletCornerTarget, DesignerRouteTerminal, DesignerViewport, ResizeHandle } from "./types";

export function primitiveShapeBounds(
  start: DesignerPoint,
  end: DesignerPoint,
  snapCm: number,
  modifiers: { preserveAspect?: boolean; fromCenter?: boolean } = {}
) {
  const snappedStart = { x: snapValue(start.x, snapCm), y: snapValue(start.y, snapCm) };
  const snappedEnd = { x: snapValue(end.x, snapCm), y: snapValue(end.y, snapCm) };
  let deltaX = snappedEnd.x - snappedStart.x;
  let deltaY = snappedEnd.y - snappedStart.y;

  if (modifiers.preserveAspect) {
    const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    deltaX = (deltaX < 0 ? -1 : 1) * size;
    deltaY = (deltaY < 0 ? -1 : 1) * size;
  }

  if (modifiers.fromCenter) {
    return {
      x: snapValue(snappedStart.x - Math.abs(deltaX), snapCm),
      y: snapValue(snappedStart.y - Math.abs(deltaY), snapCm),
      width: snapValue(Math.abs(deltaX) * 2, snapCm),
      height: snapValue(Math.abs(deltaY) * 2, snapCm)
    };
  }

  return {
    x: Math.min(snappedStart.x, snappedStart.x + deltaX),
    y: Math.min(snappedStart.y, snappedStart.y + deltaY),
    width: snapValue(Math.abs(deltaX), snapCm),
    height: snapValue(Math.abs(deltaY), snapCm)
  };
}

export function resizedZone(
  zone: DesignerZoneForm,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  snapCm: number,
  modifiers: { preserveAspect?: boolean; fromCenter?: boolean } = {}
): Partial<DesignerZoneForm> {
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

  let next = {
    x,
    y,
    width: Math.max(minSize, snapValue(width, snapCm)),
    height: Math.max(minSize, snapValue(height, snapCm))
  };
  if (modifiers.preserveAspect) {
    const scaleX = next.width / Math.max(0.001, zone.width);
    const scaleY = next.height / Math.max(0.001, zone.height);
    const scale = Math.abs(deltaX / Math.max(0.001, zone.width)) >= Math.abs(deltaY / Math.max(0.001, zone.height)) ? scaleX : scaleY;
    const constrainedWidth = Math.max(minSize, snapValue(zone.width * scale, snapCm));
    const constrainedHeight = Math.max(minSize, snapValue(zone.height * scale, snapCm));
    const centerX = zone.x + zone.width / 2;
    const centerY = zone.y + zone.height / 2;
    next = {
      x: modifiers.fromCenter
        ? snapValue(centerX - constrainedWidth / 2, snapCm)
        : handle.includes("w") ? snapValue(zone.x + zone.width - constrainedWidth, snapCm) : zone.x,
      y: modifiers.fromCenter
        ? snapValue(centerY - constrainedHeight / 2, snapCm)
        : handle.includes("n") ? snapValue(zone.y + zone.height - constrainedHeight, snapCm) : zone.y,
      width: constrainedWidth,
      height: constrainedHeight
    };
  } else if (modifiers.fromCenter) {
    const centerX = zone.x + zone.width / 2;
    const centerY = zone.y + zone.height / 2;
    next = {
      ...next,
      x: snapValue(centerX - next.width / 2, snapCm),
      y: snapValue(centerY - next.height / 2, snapCm)
    };
  }
  return zone.shape === "polygon" && zone.points ? { ...next, points: scaleShapePoints(zone, next), ...(zone.contours ? { contours: scaleShapeContours(zone, next) } : {}) } : next;
}

export function resizedBuildArea(buildArea: DesignerBuildAreaForm, handle: ResizeHandle, deltaX: number, deltaY: number, snapCm: number, modifiers?: { preserveAspect?: boolean; fromCenter?: boolean }): DesignerBuildAreaForm {
  const next = resizedZone(buildArea, handle, deltaX, deltaY, snapCm, modifiers);
  return {
    ...buildArea,
    x: next.x ?? buildArea.x,
    y: next.y ?? buildArea.y,
    width: next.width ?? buildArea.width,
    height: next.height ?? buildArea.height,
    points: next.points ?? buildArea.points,
    contours: next.contours ?? buildArea.contours
  };
}

export function snapValue(value: number, snapCm: number) {
  if (!Number.isFinite(snapCm) || snapCm <= 0) return Math.round(value * 1000) / 1000;
  const step = snapCm;
  return Math.round(value / step) * step;
}

export function movedShape<T extends { x: number; y: number; points?: DesignerPoint[]; contours?: DesignerContour[] }>(shape: T, deltaX: number, deltaY: number, snapCm: number): T {
  const x = snapValue(shape.x + deltaX, snapCm);
  const y = snapValue(shape.y + deltaY, snapCm);
  const pointDeltaX = x - shape.x;
  const pointDeltaY = y - shape.y;
  return {
    ...shape,
    x,
    y,
    points: shape.points?.map((point) => ({ ...point, x: point.x + pointDeltaX, y: point.y + pointDeltaY })),
    contours: shape.contours?.map((contour) => ({ ...contour, points: contour.points.map((point) => ({ ...point, x: point.x + pointDeltaX, y: point.y + pointDeltaY })) }))
  };
}

export function updatePolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[]; contours?: DesignerContour[] }>(shape: T, pointIndex: number, point: DesignerPoint, snapCm: number): T {
  if (!shape.points?.[pointIndex]) return shape;
  const points = shape.points.map((entry, index) => (index === pointIndex ? { ...entry, x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry));
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points, ...(shape.contours ? { contours: shape.contours.map((contour, index) => index === 0 ? { ...contour, points } : contour) } : {}) };
}

export function insertPolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, insertIndex: number, point: DesignerPoint, snapCm: number): T {
  if (!shape.points || shape.points.length < 3) return shape;
  const nextPoint = { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) };
  const clampedIndex = clamp(Math.round(insertIndex), 0, shape.points.length);
  const points = [...shape.points.slice(0, clampedIndex), nextPoint, ...shape.points.slice(clampedIndex)];
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
}

export function deletePolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, pointIndex: number): T {
  if (!shape.points || shape.points.length <= 3 || !shape.points[pointIndex]) return shape;
  const points = shape.points.filter((_, index) => index !== pointIndex);
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
}

export function scaleShapePoints(shape: { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }, next: { x: number; y: number; width: number; height: number }) {
  if (!shape.points) return undefined;
  const scaleX = next.width / Math.max(0.001, shape.width);
  const scaleY = next.height / Math.max(0.001, shape.height);
  return shape.points.map((point) => ({
    x: next.x + (point.x - shape.x) * scaleX,
    y: next.y + (point.y - shape.y) * scaleY,
    ...(point.handleIn ? { handleIn: { x: point.handleIn.x * scaleX, y: point.handleIn.y * scaleY } } : {}),
    ...(point.handleOut ? { handleOut: { x: point.handleOut.x * scaleX, y: point.handleOut.y * scaleY } } : {})
  }));
}

function scaleShapeContours(shape: { x: number; y: number; width: number; height: number; contours?: DesignerContour[] }, next: { x: number; y: number; width: number; height: number }) {
  if (!shape.contours) return undefined;
  return shape.contours.map((contour) => ({ ...contour, points: scaleShapePoints({ ...shape, points: contour.points }, next) ?? [] }));
}

export function pointsBounds(points: DesignerPoint[]) {
  if (!points.length) return null;
  const anchorsAndHandles = points.flatMap((point) => [
    point,
    ...(point.handleIn ? [{ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }] : []),
    ...(point.handleOut ? [{ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }] : [])
  ]);
  const minX = Math.min(...anchorsAndHandles.map((point) => point.x));
  const minY = Math.min(...anchorsAndHandles.map((point) => point.y));
  const maxX = Math.max(...anchorsAndHandles.map((point) => point.x));
  const maxY = Math.max(...anchorsAndHandles.map((point) => point.y));
  return { x: minX, y: minY, width: Math.max(0.1, maxX - minX), height: Math.max(0.1, maxY - minY) };
}

export function smoothBezierPoints(points: DesignerPoint[]): DesignerPoint[] {
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const factor = 0.22;
    const handle = { x: (next.x - previous.x) * factor, y: (next.y - previous.y) * factor };
    return { ...point, nodeType: "smooth" as const, handleIn: { x: -handle.x, y: -handle.y }, handleOut: handle };
  });
}

/** Smooth handles for an open path, without wrapping the first/last neighbors. */
export function smoothOpenBezierPoints(points: DesignerPoint[]): DesignerPoint[] {
  return points.map((point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const factor = index === 0 || index === points.length - 1 ? 0.18 : 0.22;
    const handle = { x: (next.x - previous.x) * factor, y: (next.y - previous.y) * factor };
    return { ...point, nodeType: "smooth" as const, handleIn: { x: -handle.x, y: -handle.y }, handleOut: handle };
  });
}

export function setPolygonNodeType<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[]; pathMode?: "straight" | "bezier" }>(shape: T, pointIndex: number, nodeType: DesignerPointNodeType): T {
  const anchor = shape.points?.[pointIndex];
  if (!anchor || !shape.points) return shape;
  const previous = shape.points[(pointIndex - 1 + shape.points.length) % shape.points.length];
  const next = shape.points[(pointIndex + 1) % shape.points.length];
  const tangent = { x: (next.x - previous.x) * 0.22, y: (next.y - previous.y) * 0.22 };
  const points = shape.points.map((point, index) => {
    if (index !== pointIndex) return point;
    if (nodeType === "corner" || nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...plainPoint } = point;
      return { ...plainPoint, nodeType };
    }
    const { radiusMm: _radiusMm, ...smoothPoint } = point;
    return { ...smoothPoint, nodeType, handleIn: { x: -tangent.x, y: -tangent.y }, handleOut: tangent };
  });
  const bounds = pointsBounds(points);
  return { ...shape, pathMode: "bezier", ...(bounds ?? {}), points };
}

export function updateBezierHandle<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, pointIndex: number, handle: "in" | "out", absolutePoint: DesignerPoint, snapCm: number): T {
  const anchor = shape.points?.[pointIndex];
  if (!anchor || !shape.points) return shape;
  const vector = { x: snapValue(absolutePoint.x, snapCm) - anchor.x, y: snapValue(absolutePoint.y, snapCm) - anchor.y };
  const primary = handle === "in" ? "handleIn" : "handleOut";
  const opposite = handle === "in" ? "handleOut" : "handleIn";
  const currentOpposite = anchor[opposite];
  const vectorLength = Math.hypot(vector.x, vector.y);
  const oppositeLength = anchor.nodeType === "smooth" && currentOpposite
    ? Math.hypot(currentOpposite.x, currentOpposite.y)
    : vectorLength;
  const oppositeVector = vectorLength > 0.0001
    ? { x: (-vector.x / vectorLength) * oppositeLength, y: (-vector.y / vectorLength) * oppositeLength }
    : { x: 0, y: 0 };
  const nodeType: DesignerPointNodeType = anchor.nodeType === "smooth" ? "smooth" : "symmetric";
  const points: DesignerPoint[] = shape.points.map((point, index) => index === pointIndex ? { ...point, nodeType, [primary]: vector, [opposite]: oppositeVector } : point);
  const bounds = pointsBounds(points);
  return bounds ? { ...shape, ...bounds, points } : { ...shape, points };
}

export function bezierHandlePoint(point: DesignerPoint, handle: "in" | "out") {
  const vector = handle === "in" ? point.handleIn : point.handleOut;
  return vector ? { x: point.x + vector.x, y: point.y + vector.y } : null;
}

export function pickBezierHandle(point: DesignerPoint, target: DesignerPoint, tolerance: number): "in" | "out" | null {
  for (const handle of ["in", "out"] as const) {
    const control = bezierHandlePoint(point, handle);
    if (control && distanceBetweenPoints(control, target) <= tolerance) return handle;
  }
  return null;
}

export function rectanglePoints(shape: { x: number; y: number; width: number; height: number }) {
  return [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
    { x: shape.x, y: shape.y + shape.height }
  ];
}

export function shapePointsString(points: DesignerPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function polygonSegments(points: DesignerPoint[]) {
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
    insertIndex: index + 1
  }));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function rulerTicks(startCm: number, endCm: number, spanCm: number, unit: DesignerForm["rulerUnit"]) {
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

export function niceRulerStep(rawStepCm: number, unit: DesignerForm["rulerUnit"]) {
  if (unit === "in") {
    const rawIn = Math.max(0.25, rawStepCm / 2.54);
    const stepIn = niceNumber(rawIn);
    return stepIn * 2.54;
  }

  if (rawStepCm >= 100) return niceNumber(rawStepCm / 100) * 100;
  return niceNumber(Math.max(1, rawStepCm));
}

export function niceNumber(value: number) {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

export function formatRulerLabel(valueCm: number, unit: DesignerForm["rulerUnit"]) {
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

export function formatMeasure(valueCm: number, unit: DesignerForm["rulerUnit"]) {
  if (unit === "in") return `${formatDecimal(valueCm / 2.54)} in`;
  return `${formatDecimal(valueCm)} cm`;
}

export function formatDecimal(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function routeColor(route: DesignerRouteForm) {
  if (route.kind === "data_cable") return "#22c55e";
  return "#f59e0b";
}

export function routeSelectedColor(kind: DesignerRouteKind) {
  return kind === "data_cable" ? "#bef264" : "#ec4899";
}

export function createRouteFromDraft(kind: DesignerRouteKind, start: DesignerPoint, end: DesignerPoint, designer: DesignerForm): DesignerRouteForm {
  const next = nextRouteNumber(designer.routes);
  return {
    id: `route_${next}`,
    name: kind === "data_cable" ? `Data cable ${next}` : `LED string ${next}`,
    kind,
    points: [start, end]
  };
}

export function nextRouteNumber(routes: DesignerRouteForm[]) {
  const used = new Set(routes.map((route) => route.id));
  for (let index = routes.length + 1; index < routes.length + 1000; index += 1) {
    if (!used.has(`route_${index}`)) return index;
  }
  return Date.now();
}

export function routePointFill(route: DesignerRouteForm, pointIndex: number, point: DesignerPoint, selected: boolean) {
  if (point.joint) return "#22d3ee";
  if (pointIndex === 0) return "#22c55e";
  if (pointIndex === route.points.length - 1) return "#ef4444";
  return selected ? "#c084fc" : "#a78bfa";
}

export function pickDesignerHit(designer: DesignerForm, activeLayer: DesignerActiveLayer | null, point: DesignerPoint, viewport: DesignerViewport, canvasSize: { width: number; height: number }): DesignerCanvasHit {
  const tolerance = worldHitTolerance(viewport, canvasSize);
  if (activeLayer === "artwork" || activeLayer === "reference" || activeLayer === "zones" || activeLayer === "faceGraphic") {
    for (const text of [...designer.texts].reverse()) {
      const targetsActiveLayer = text.targetLayer === "reference" ? activeLayer === "artwork" || activeLayer === "reference" : text.targetLayer === activeLayer;
      const layerVisible = text.targetLayer === "reference" ? designer.layers.artwork.visible && designer.layers.reference.visible : designer.layers[text.targetLayer].visible;
      if (!text.visible || !targetsActiveLayer || !layerVisible) continue;
      if (pointInsideRect(estimateDesignerTextBounds(text), point, tolerance)) return { type: "text", id: text.id };
    }
    for (const operation of [...designer.derivedGeometries].reverse()) {
      const targetsActiveLayer = operation.targetLayer === "reference"
        ? activeLayer === "artwork" || activeLayer === "reference"
        : operation.targetLayer === activeLayer;
      if (!operation.visible || !targetsActiveLayer) continue;
      const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
      if (!resolved.geometry) continue;
      const shape = designerGeometryAsShape(resolved.geometry);
      if (pointInsideDesignerShape(shape, point) || pointNearShapeStroke(shape, point, tolerance * 2)) return { type: "derived_geometry", id: operation.id };
    }
    for (const projection of [...designer.projections].reverse()) {
      const targetsActiveLayer = projection.targetLayer === "reference"
        ? activeLayer === "artwork" || activeLayer === "reference"
        : projection.targetLayer === activeLayer;
      if (!projection.visible || !targetsActiveLayer) continue;
      const resolved = resolveDesignerProjectionGeometry(designer, projection.id);
      if (!resolved.geometry) continue;
      const shape = designerGeometryAsShape(resolved.geometry);
      if (pointInsideDesignerShape(shape, point) || pointNearShapeStroke(shape, point, tolerance * 2)) return { type: "projection", id: projection.id };
    }
  }
  if (activeLayer === "artwork" && designer.layers.artwork.visible) {
    for (const artwork of [...designer.artwork].reverse()) {
      if (artwork.visible === false) continue;
      const resizeHit = pickResizeHandleHit(artwork, point, tolerance, "artwork_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideRect(artwork, point, tolerance)) return { type: "artwork", id: artwork.id };
    }
  }
  if (activeLayer === "hardware" && designer.layers.hardware.visible) {
    if (designer.controller.visible !== false) {
      const controllerHit = pickControllerHit(designer.controller, point, tolerance);
      if (controllerHit) return controllerHit;
    }
  }
  if (activeLayer === "strings" && designer.layers.strings.visible) {
    for (const route of [...designer.routes].reverse()) {
      if (route.visible === false) continue;
      const pointHit = pickRoutePointHit(route, point, tolerance);
      if (pointHit) return pointHit;
      if (distanceToPolyline(route.points, point) <= tolerance) return { type: "route", id: route.id };
    }
  }
  if (activeLayer === "zones" && designer.layers.zones.visible) {
    for (const channel of designer.channels) {
      if (channel.visible === false) continue;
      const pointHit = pickPolygonPointHit(channel.id, channel.points, point, tolerance, "channel_point");
      if (pointHit) return pointHit;
      if (channelContainsPoint(channel, point, tolerance)) return { type: "channel", id: channel.id };
    }
    for (const zone of designer.zones) {
      if (zone.visible === false) continue;
      const pointHit = zone.shape === "polygon" && zone.points && !zone.contours ? pickPolygonPointHit(zone.id, zone.points, point, tolerance, "zone_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(zone, point, tolerance, "zone_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(zone, point) || pointNearShapeStroke(zone, point, tolerance * 2)) return { type: "zone", id: zone.id };
    }
  }
  if (activeLayer === "faceGraphic" && designer.layers.faceGraphic.visible) {
    for (const element of designer.faceGraphics) {
      if (element.visible === false) continue;
      const pointHit = element.shape === "polygon" && element.points && !element.contours ? pickPolygonPointHit(element.id, element.points, point, tolerance, "face_graphic_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(element, point, tolerance, "face_graphic_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(element, point) || pointNearShapeStroke(element, point, tolerance * 2)) return { type: "face_graphic", id: element.id };
    }
  }
  if ((activeLayer === "reference" || activeLayer === "artwork") && designer.layers.artwork.visible) {
    for (const buildArea of [...designer.buildAreas].reverse()) {
      if (buildArea.visible === false) continue;
      const pointHit = buildArea.shape === "polygon" && buildArea.points && !buildArea.contours ? pickPolygonPointHit(buildArea.id, buildArea.points, point, tolerance, "build_area_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(buildArea, point, tolerance, "build_area_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(buildArea, point) || pointNearShapeStroke(buildArea, point, tolerance * 2)) return { type: "build_area", id: buildArea.id };
    }
  }
  return null;
}

export function designerFilletCornerForHit(designer: DesignerForm, hit: DesignerCanvasHit): DesignerFilletCornerTarget | null {
  if (!hit) return null;
  if (hit.type === "build_area_point" || hit.type === "zone_point" || hit.type === "channel_point" || hit.type === "face_graphic_point") {
    return { type: hit.type.replace("_point", "") as DesignerFilletCornerTarget["type"], id: hit.id, cornerIndex: hit.pointIndex };
  }
  if (hit.type !== "build_area_resize" && hit.type !== "zone_resize" && hit.type !== "face_graphic_resize") return null;
  const type = hit.type.replace("_resize", "") as DesignerFilletCornerTarget["type"];
  const shape = type === "build_area"
    ? designer.buildAreas.find((entry) => entry.id === hit.id)
    : type === "zone"
      ? designer.zones.find((entry) => entry.id === hit.id)
      : designer.faceGraphics.find((entry) => entry.id === hit.id);
  if (shape?.shape !== "rect") return null;
  const cornerIndex: Record<ResizeHandle, number> = { nw: 0, ne: 1, se: 2, sw: 3 };
  return { type, id: hit.id, cornerIndex: cornerIndex[hit.handle] };
}

export function pickAnimationTarget(designer: DesignerForm, point: DesignerPoint, tolerance: number): { type: "zone" | "channel"; id: string } | null {
  // Channels are narrow foreground targets. Pick them before an overlapping filled
  // zone so clicking a visible strip selects the clip assigned to that channel.
  for (const channel of designer.channels) {
    if (channel.visible !== false && channelContainsPoint(channel, point, tolerance)) {
      return { type: "channel", id: channel.id };
    }
  }
  for (const zone of designer.zones) {
    if (zone.visible !== false && (pointInsideDesignerShape(zone, point) || pointNearShapeStroke(zone, point, tolerance))) {
      return { type: "zone", id: zone.id };
    }
  }
  return null;
}

export function pickRouteSegmentHit(routes: DesignerRouteForm[], point: DesignerPoint, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  const tolerance = worldHitTolerance(viewport, canvasSize);
  for (const route of [...routes].reverse()) {
    if (distanceToPolyline(route.points, point) <= tolerance) return { routeId: route.id };
  }
  return null;
}

export function pickControllerHit(controller: DesignerControllerForm, point: DesignerPoint, tolerance: number): DesignerCanvasHit {
  const portHit = Array.from({ length: controller.dataOutputs }, (_, portIndex) => controllerPortPoint(controller, portIndex, 0.1))
    .some((port) => distanceBetweenPoints(port, point) <= tolerance);
  if (portHit) return { type: "controller", id: controller.id };
  return point.x >= controller.x - tolerance
    && point.x <= controller.x + controller.width + tolerance
    && point.y >= controller.y - tolerance
    && point.y <= controller.y + controller.height + tolerance
    ? { type: "controller", id: controller.id }
    : null;
}

export function pickRoutePointHit(route: DesignerRouteForm, point: DesignerPoint, tolerance: number): DesignerCanvasHit {
  for (let index = route.points.length - 1; index >= 0; index -= 1) {
    if (distanceBetweenPoints(route.points[index], point) <= tolerance) return { type: "route_point", id: route.id, pointIndex: index };
  }
  return null;
}

export function pickPolygonPointHit(id: string, points: DesignerPoint[], point: DesignerPoint, tolerance: number, type: "build_area_point" | "zone_point" | "channel_point" | "face_graphic_point"): DesignerCanvasHit {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (distanceBetweenPoints(points[index], point) <= tolerance) return { type, id, pointIndex: index };
  }
  return null;
}

export function pickResizeHandleHit(shape: { id: string; x: number; y: number; width: number; height: number }, point: DesignerPoint, tolerance: number, type: "artwork_resize" | "build_area_resize" | "zone_resize" | "face_graphic_resize"): DesignerCanvasHit {
  const handles: Array<{ handle: ResizeHandle; point: DesignerPoint }> = [
    { handle: "nw", point: { x: shape.x, y: shape.y } },
    { handle: "ne", point: { x: shape.x + shape.width, y: shape.y } },
    { handle: "sw", point: { x: shape.x, y: shape.y + shape.height } },
    { handle: "se", point: { x: shape.x + shape.width, y: shape.y + shape.height } }
  ];
  const hit = handles.find((handle) => distanceBetweenPoints(handle.point, point) <= tolerance);
  return hit ? { type, id: shape.id, handle: hit.handle } : null;
}

export function pointInsideRect(shape: { x: number; y: number; width: number; height: number }, point: DesignerPoint, tolerance = 0) {
  return point.x >= shape.x - tolerance
    && point.x <= shape.x + shape.width + tolerance
    && point.y >= shape.y - tolerance
    && point.y <= shape.y + shape.height + tolerance;
}

export function pointInsideDesignerShape(shape: Pick<DesignerBuildAreaForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode" | "fillRule">, point: DesignerPoint) {
  if (shape.shape === "polygon" && shape.points) {
    if (shape.contours?.length) {
      const contained = shape.contours.reduce((count, contour) => count + (pointInPolygon(point, contourOutlinePoints(contour)) ? 1 : 0), 0);
      return shape.fillRule === "nonzero" ? contained > 0 : contained % 2 === 1;
    }
    const outline = shapeOutlinePoints(shape);
    const bounds = pointsBounds(outline);
    if (!bounds || !pointInsideRect(bounds, point)) return false;
    return pointInPolygon(point, outline);
  }
  if (shape.shape === "ellipse") {
    const radiusX = Math.max(0.001, shape.width / 2);
    const radiusY = Math.max(0.001, shape.height / 2);
    const centerX = shape.x + radiusX;
    const centerY = shape.y + radiusY;
    const normalized = ((point.x - centerX) ** 2) / (radiusX ** 2) + ((point.y - centerY) ** 2) / (radiusY ** 2);
    return normalized <= 1;
  }
  return point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height;
}

export function pointNearShapeStroke(shape: Pick<DesignerBuildAreaForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode">, point: DesignerPoint, tolerance: number) {
  if (shape.shape === "polygon" && shape.points) {
    if (shape.contours?.length) return shape.contours.some((contour) => polygonSegments(contourOutlinePoints(contour)).some((segment) => pointToSegmentDistance(point, segment.start, segment.end) <= tolerance));
    const outline = shapeOutlinePoints(shape);
    const bounds = pointsBounds(outline);
    if (!bounds || !pointInsideRect(bounds, point, tolerance)) return false;
    return polygonSegments(outline).some((segment) => pointToSegmentDistance(point, segment.start, segment.end) <= tolerance);
  }
  if (shape.shape === "ellipse") {
    const radiusX = Math.max(0.001, shape.width / 2);
    const radiusY = Math.max(0.001, shape.height / 2);
    const centerX = shape.x + radiusX;
    const centerY = shape.y + radiusY;
    const angle = Math.atan2((point.y - centerY) / radiusY, (point.x - centerX) / radiusX);
    const edge = { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
    return distanceBetweenPoints(point, edge) <= tolerance;
  }
  return polygonSegments(rectanglePoints(shape)).some((segment) => pointToSegmentDistance(point, segment.start, segment.end) <= tolerance);
}

function contourOutlinePoints(contour: DesignerContour) {
  return shapeOutlinePoints({ shape: "polygon", points: contour.points, pathMode: contour.pathMode });
}

export function shapeOutlinePoints(shape: Pick<DesignerZoneForm, "shape" | "pathMode" | "points"> | Pick<DesignerBuildAreaForm, "shape" | "pathMode" | "points">) {
  if (shape.shape !== "polygon" || !shape.points) return [];
  if (shape.pathMode !== "bezier") return shape.points;
  const outline: DesignerPoint[] = [];
  shape.points.forEach((start, index) => {
    const end = shape.points![(index + 1) % shape.points!.length];
    for (let step = index === 0 ? 0 : 1; step <= 16; step += 1) {
      outline.push(cubicBezierPoint(start, end, step / 16));
    }
  });
  return outline;
}

export function cubicBezierPoint(start: DesignerPoint, end: DesignerPoint, t: number): DesignerPoint {
  const startControl = start.handleOut ? { x: start.x + start.handleOut.x, y: start.y + start.handleOut.y } : start;
  const endControl = end.handleIn ? { x: end.x + end.handleIn.x, y: end.y + end.handleIn.y } : end;
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * startControl.x + 3 * inverse * t ** 2 * endControl.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * startControl.y + 3 * inverse * t ** 2 * endControl.y + t ** 3 * end.y
  };
}

export function pointInPolygon(point: DesignerPoint, polygon: DesignerPoint[]) {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = current.y > point.y !== previous.y > point.y
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToPolyline(points: DesignerPoint[], point: DesignerPoint) {
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  return points.slice(1).reduce((nearest, end, index) => Math.min(nearest, pointToSegmentDistance(point, points[index], end)), Number.POSITIVE_INFINITY);
}

export function nearestPolygonInsertIndex(points: DesignerPoint[], point: DesignerPoint) {
  if (points.length < 3) return null;
  let nearest = { distance: Number.POSITIVE_INFINITY, insertIndex: 1 };
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const distance = pointToSegmentDistance(point, start, end);
    if (distance < nearest.distance) nearest = { distance, insertIndex: index + 1 };
  });
  return nearest.insertIndex;
}

export function nearestShapeInsertIndex(shape: Pick<DesignerZoneForm, "shape" | "pathMode" | "points"> | Pick<DesignerBuildAreaForm, "shape" | "pathMode" | "points">, point: DesignerPoint) {
  if (shape.shape !== "polygon" || !shape.points || shape.points.length < 3) return null;
  if (shape.pathMode !== "bezier") return nearestPolygonInsertIndex(shape.points, point);
  let nearest = { distance: Number.POSITIVE_INFINITY, insertIndex: 1 };
  shape.points.forEach((start, index) => {
    const end = shape.points![(index + 1) % shape.points!.length];
    let previous = cubicBezierPoint(start, end, 0);
    for (let step = 1; step <= 16; step += 1) {
      const current = cubicBezierPoint(start, end, step / 16);
      const distance = pointToSegmentDistance(point, previous, current);
      if (distance < nearest.distance) nearest = { distance, insertIndex: index + 1 };
      previous = current;
    }
  });
  return nearest.insertIndex;
}

export function channelWidthCm(channel: DesignerChannelForm) {
  return Math.max(0.1, (Number.isFinite(channel.widthMm) ? channel.widthMm : 10) / 10);
}

export function channelAllowedBendRadiusMm(channel: Pick<DesignerChannelForm, "widthMm">) {
  return Math.max(3, channel.widthMm) / 2;
}

function circumradiusCm(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint) {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const twiceArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  if (ab < 1e-6 || bc < 1e-6 || ca < 1e-6 || twiceArea < 1e-7) return Number.POSITIVE_INFINITY;
  return (ab * bc * ca) / (2 * twiceArea);
}

export type ChannelBendMeasurement = {
  radiusMm: number;
  requiredRadiusMm: number;
  point: DesignerPoint;
  segmentIndex: number;
};

/** Smallest resolved center-line bend radius and its visible location. */
export function channelMinimumBendMeasurement(channel: DesignerChannelForm): ChannelBendMeasurement | null {
  const closed = channelIsClosed(channel);
  let minimum: ChannelBendMeasurement | null = null;
  const start = closed ? 0 : 1;
  const end = closed ? channel.points.length : channel.points.length - 1;
  channel.points.slice(start, end).forEach((point, offset) => {
    if (!Number.isFinite(point.radiusMm) || point.radiusMm! <= 0) return;
    const radiusMm = point.radiusMm!;
    if (!minimum || radiusMm < minimum.radiusMm) {
      minimum = { radiusMm, requiredRadiusMm: channelAllowedBendRadiusMm(channel), point: { x: point.x, y: point.y }, segmentIndex: start + offset };
    }
  });
  if (channel.pathMode !== "bezier") return minimum;
  const segmentCount = closed ? channel.points.length : channel.points.length - 1;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const segmentStart = channel.points[segmentIndex];
    const segmentEnd = channel.points[(segmentIndex + 1) % channel.points.length];
    if (!segmentStart.handleOut && !segmentEnd.handleIn) continue;
    const samples = Array.from({ length: 49 }, (_, index) => cubicBezierPoint(segmentStart, segmentEnd, index / 48));
    for (let index = 1; index < samples.length - 1; index += 1) {
      const radiusMm = circumradiusCm(samples[index - 1], samples[index], samples[index + 1]) * 10;
      if (Number.isFinite(radiusMm) && (!minimum || radiusMm < minimum.radiusMm)) {
        minimum = {
          radiusMm,
          requiredRadiusMm: channelAllowedBendRadiusMm(channel),
          point: { x: samples[index].x, y: samples[index].y },
          segmentIndex
        };
      }
    }
  }
  return minimum;
}

/** Smallest resolved center-line bend radius, in millimeters. */
export function channelMinimumBendRadiusMm(channel: DesignerChannelForm) {
  return channelMinimumBendMeasurement(channel)?.radiusMm ?? Number.POSITIVE_INFINITY;
}

export function channelTightBend(channel: DesignerChannelForm) {
  const measurement = channelMinimumBendMeasurement(channel);
  return measurement && measurement.radiusMm + 0.05 < measurement.requiredRadiusMm ? measurement : null;
}

export function channelHasTightBends(channel: DesignerChannelForm) {
  return channelTightBend(channel) !== null;
}

export function channelIsClosed(channel: DesignerChannelForm) {
  return channel.closed && (channel.points?.length ?? 0) >= 3;
}

/** Samples the editable center line of a channel into a polyline (cm). */
export function channelCenterPolyline(channel: DesignerChannelForm, stepsPerSegment = 18): DesignerPoint[] {
  let points = channel.points ?? [];
  if (points.length < 2) return points.slice();
  const closed = channelIsClosed(channel);
  const hasBezierSegments = channel.pathMode === "bezier" && points.some((point) => point.handleIn || point.handleOut);
  if (hasBezierSegments) {
    const fillets = points
      .map((point, index) => ({ index, radiusMm: point.radiusMm ?? 0 }))
      .filter(({ index, radiusMm }) => radiusMm > 0 && (closed || index > 0 && index < points.length - 1))
      .sort((a, b) => b.index - a.index);
    if (fillets.length) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      let geometry: DesignerGeometry = {
        id: `${channel.id}_center_preview`,
        kind: "path" as const,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(0.001, Math.max(...xs) - Math.min(...xs)),
        height: Math.max(0.001, Math.max(...ys) - Math.min(...ys)),
        points: points.map((point) => ({ ...point })),
        pathMode: "bezier" as const,
        closed
      };
      fillets.forEach(({ index, radiusMm }) => {
        const result = filletDesignerGeometry(geometry, radiusMm, [index], geometry.id);
        if (result.geometry?.points) geometry = { ...result.geometry, pathMode: "bezier" as const };
      });
      points = geometry.points ?? points;
    }
    // Keep one canonical representation: the first point occurs once and a
    // closed path relies on its topology flag for the final edge. Previously
    // the Bezier branch duplicated the first point while the polygon branch did
    // not, which made the outline change topology when the last handle vanished.
    const center: DesignerPoint[] = [{ x: points[0].x, y: points[0].y }];
    const segmentCount = closed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const curved = Boolean(start.handleOut || end.handleIn);
      const sampleCount = curved ? Math.max(2, stepsPerSegment) : 1;
      for (let step = 1; step <= sampleCount; step += 1) {
        const closesAtFirstPoint = closed && index === segmentCount - 1 && step === sampleCount;
        if (!closesAtFirstPoint) center.push(cubicBezierPoint(start, end, step / sampleCount));
      }
    }
    return center;
  }
  return filletPolyline(points, closed);
}

/** Builds a polygonal center line, replacing filleted corner nodes with tangent arcs (cm). */
function filletPolyline(points: DesignerPoint[], closed: boolean): DesignerPoint[] {
  const count = points.length;
  const result: DesignerPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const point = points[index];
    const isEndpoint = !closed && (index === 0 || index === count - 1);
    const radiusCm = (typeof point.radiusMm === "number" ? point.radiusMm : 0) / 10;
    if (isEndpoint || !(radiusCm > 0)) {
      result.push({ x: point.x, y: point.y });
      continue;
    }
    const previous = points[(index - 1 + count) % count];
    const next = points[(index + 1) % count];
    const inLength = Math.hypot(point.x - previous.x, point.y - previous.y);
    const outLength = Math.hypot(next.x - point.x, next.y - point.y);
    if (inLength < 1e-6 || outLength < 1e-6) {
      result.push({ x: point.x, y: point.y });
      continue;
    }
    const inDir = { x: (point.x - previous.x) / inLength, y: (point.y - previous.y) / inLength };
    const outDir = { x: (next.x - point.x) / outLength, y: (next.y - point.y) / outLength };
    const turn = Math.acos(clamp(inDir.x * outDir.x + inDir.y * outDir.y, -1, 1));
    if (!(turn > 1e-4)) {
      result.push({ x: point.x, y: point.y });
      continue;
    }
    const tanHalf = Math.tan(turn / 2);
    const tangent = Math.min(radiusCm * tanHalf, Math.min(inLength, outLength) / 2);
    if (!(tangent > 1e-4)) {
      result.push({ x: point.x, y: point.y });
      continue;
    }
    const radius = tangent / tanHalf;
    const start = { x: point.x - inDir.x * tangent, y: point.y - inDir.y * tangent };
    const end = { x: point.x + outDir.x * tangent, y: point.y + outDir.y * tangent };
    const bisectorX = -inDir.x + outDir.x;
    const bisectorY = -inDir.y + outDir.y;
    const bisectorLength = Math.hypot(bisectorX, bisectorY) || 1;
    const center = {
      x: point.x + (bisectorX / bisectorLength) * (radius / Math.sin((Math.PI - turn) / 2)),
      y: point.y + (bisectorY / bisectorLength) * (radius / Math.sin((Math.PI - turn) / 2))
    };
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let sweep = Math.atan2(end.y - center.y, end.x - center.x) - startAngle;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const steps = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    for (let step = 0; step <= steps; step += 1) {
      const angle = startAngle + sweep * (step / steps);
      result.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
  }
  return result;
}

export function distanceToChannelCenter(channel: DesignerChannelForm, point: DesignerPoint) {
  const center = channelCenterPolyline(channel);
  if (center.length < 2) return Number.POSITIVE_INFINITY;
  const polyline = channelIsClosed(channel) ? [...center, center[0]] : center;
  return distanceToPolyline(polyline, point);
}

export function channelContainsPoint(channel: DesignerChannelForm, point: DesignerPoint, toleranceCm = 0) {
  return distanceToChannelCenter(channel, point) <= channelWidthCm(channel) / 2 + toleranceCm;
}

export function pointNearChannelStroke(channel: DesignerChannelForm, point: DesignerPoint, tolerance: number) {
  return distanceToChannelCenter(channel, point) <= channelWidthCm(channel) / 2 + tolerance;
}

/** Derives the independent left/right borders of the channel band (cm). */
export function channelBorderPolylines(channel: DesignerChannelForm, stepsPerSegment = 18) {
  const center = channelCenterPolyline(channel, stepsPerSegment);
  if (center.length < 2) return { left: center.slice(), right: center.slice() };
  const half = channelWidthCm(channel) / 2;
  const closed = channelIsClosed(channel);
  const left: DesignerPoint[] = [];
  const right: DesignerPoint[] = [];
  const appendOffsetJoin = (result: DesignerPoint[], point: DesignerPoint, inDirection: DesignerPoint | null, outDirection: DesignerPoint | null, side: 1 | -1) => {
    const direction = inDirection ?? outDirection;
    if (!direction) return;
    const inNormal = inDirection ? normalOf(inDirection) : normalOf(direction);
    const outNormal = outDirection ? normalOf(outDirection) : normalOf(direction);
    const start = { x: point.x + inNormal.x * half * side, y: point.y + inNormal.y * half * side };
    const end = { x: point.x + outNormal.x * half * side, y: point.y + outNormal.y * half * side };
    if (!inDirection || !outDirection) {
      result.push(inDirection ? start : end);
      return;
    }
    const turn = inDirection.x * outDirection.y - inDirection.y * outDirection.x;
    if (Math.abs(turn) < 1e-7) {
      result.push({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
      return;
    }
    if (turn * side < 0) {
      const startAngle = Math.atan2(start.y - point.y, start.x - point.x);
      const endAngle = Math.atan2(end.y - point.y, end.x - point.x);
      let sweep = endAngle - startAngle;
      if (turn > 0) while (sweep < 0) sweep += Math.PI * 2;
      else while (sweep > 0) sweep -= Math.PI * 2;
      const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
      for (let step = 0; step <= steps; step += 1) {
        const angle = startAngle + sweep * step / steps;
        result.push({ x: point.x + Math.cos(angle) * half, y: point.y + Math.sin(angle) * half });
      }
      return;
    }
    const denominator = inDirection.x * outDirection.y - inDirection.y * outDirection.x;
    const delta = { x: end.x - start.x, y: end.y - start.y };
    const distance = (delta.x * outDirection.y - delta.y * outDirection.x) / denominator;
    result.push({ x: start.x + inDirection.x * distance, y: start.y + inDirection.y * distance });
  };
  for (let index = 0; index < center.length; index += 1) {
    const point = center[index];
    const hasPrevious = closed || index > 0;
    const hasNext = closed || index < center.length - 1;
    const previous = center[(index - 1 + center.length) % center.length];
    const next = center[(index + 1) % center.length];
    const inDirection = hasPrevious ? normalizedDirection(previous, point) : null;
    const outDirection = hasNext ? normalizedDirection(point, next) : null;
    appendOffsetJoin(left, point, inDirection, outDirection, 1);
    appendOffsetJoin(right, point, inDirection, outDirection, -1);
  }
  return { left, right };
}

/** Builds the single closed band polygon used only by open channels. */
export function openChannelOutline(channel: DesignerChannelForm, stepsPerSegment = 18): DesignerPoint[] {
  const center = channelCenterPolyline(channel, stepsPerSegment);
  if (center.length < 2) return center;
  const half = channelWidthCm(channel) / 2;
  const { left, right } = channelBorderPolylines(channel, stepsPerSegment);
  const outline: DesignerPoint[] = [];
  outline.push(...left);
  const end = center[center.length - 1];
  outline.push(...capArcPoints(end, normalizedDirection(center[center.length - 2] ?? center[0], end), half, channel.cap === "round"));
  for (let index = right.length - 1; index >= 0; index -= 1) outline.push(right[index]);
  const start = center[0];
  outline.push(...capArcPoints(start, normalizedDirection(center[1] ?? end, start), half, channel.cap === "round"));
  return outline;
}

export function nearestChannelInsertIndex(channel: DesignerChannelForm, point: DesignerPoint) {
  const points = channel.points ?? [];
  if (points.length < 2) return null;
  const closed = channelIsClosed(channel);
  const segmentCount = closed ? points.length : points.length - 1;
  let nearest = { distance: Number.POSITIVE_INFINITY, insertIndex: 1 };
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (channel.pathMode !== "bezier") {
      const distance = pointToSegmentDistance(point, start, end);
      if (distance < nearest.distance) nearest = { distance, insertIndex: index + 1 };
      continue;
    }
    let previous = cubicBezierPoint(start, end, 0);
    for (let step = 1; step <= 16; step += 1) {
      const current = cubicBezierPoint(start, end, step / 16);
      const distance = pointToSegmentDistance(point, previous, current);
      if (distance < nearest.distance) nearest = { distance, insertIndex: index + 1 };
      previous = current;
    }
  }
  return nearest.insertIndex;
}

export function movedChannel(channel: DesignerChannelForm, deltaX: number, deltaY: number, snapCm: number): DesignerChannelForm {
  const anchor = channel.points[0];
  if (!anchor) return channel;
  const x = snapValue(anchor.x + deltaX, snapCm);
  const y = snapValue(anchor.y + deltaY, snapCm);
  const pointDeltaX = x - anchor.x;
  const pointDeltaY = y - anchor.y;
  return { ...channel, points: channel.points.map((point) => ({ ...point, x: point.x + pointDeltaX, y: point.y + pointDeltaY })) };
}

export function updateChannelPoint(channel: DesignerChannelForm, pointIndex: number, point: DesignerPoint, snapCm: number): DesignerChannelForm {
  if (!channel.points[pointIndex]) return channel;
  const points = channel.points.map((entry, index) => (index === pointIndex ? { ...entry, x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry));
  return { ...channel, points };
}

export function updateChannelBezierHandle(channel: DesignerChannelForm, pointIndex: number, handle: "in" | "out", absolutePoint: DesignerPoint, snapCm: number): DesignerChannelForm {
  const anchor = channel.points[pointIndex];
  if (!anchor) return channel;
  const vector = { x: snapValue(absolutePoint.x, snapCm) - anchor.x, y: snapValue(absolutePoint.y, snapCm) - anchor.y };
  const primary = handle === "in" ? "handleIn" : "handleOut";
  const opposite = handle === "in" ? "handleOut" : "handleIn";
  const currentOpposite = anchor[opposite];
  const vectorLength = Math.hypot(vector.x, vector.y);
  const oppositeLength = anchor.nodeType === "smooth" && currentOpposite ? Math.hypot(currentOpposite.x, currentOpposite.y) : vectorLength;
  const oppositeVector = vectorLength > 0.0001 ? { x: (-vector.x / vectorLength) * oppositeLength, y: (-vector.y / vectorLength) * oppositeLength } : { x: 0, y: 0 };
  const nodeType: DesignerPointNodeType = anchor.nodeType === "smooth" ? "smooth" : "symmetric";
  const points: DesignerPoint[] = channel.points.map((point, index) => index === pointIndex ? { ...point, nodeType, [primary]: vector, [opposite]: oppositeVector } : point);
  return { ...channel, points };
}

export function insertChannelPoint(channel: DesignerChannelForm, insertIndex: number, point: DesignerPoint, snapCm: number): DesignerChannelForm {
  const nextPoint = { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) };
  const clamped = clamp(Math.round(insertIndex), 0, channel.points.length);
  const points = [...channel.points.slice(0, clamped), nextPoint, ...channel.points.slice(clamped)];
  return { ...channel, points };
}

export function deleteChannelPoint(channel: DesignerChannelForm, pointIndex: number): DesignerChannelForm {
  if (channel.points.length <= 2 || !channel.points[pointIndex]) return channel;
  return { ...channel, points: channel.points.filter((_, index) => index !== pointIndex) };
}

export function setChannelNodeType(channel: DesignerChannelForm, pointIndex: number, nodeType: DesignerPointNodeType): DesignerChannelForm {
  const anchor = channel.points[pointIndex];
  if (!anchor) return channel;
  const previous = channel.points[(pointIndex - 1 + channel.points.length) % channel.points.length];
  const next = channel.points[(pointIndex + 1) % channel.points.length];
  const tangent = { x: (next.x - previous.x) * 0.22, y: (next.y - previous.y) * 0.22 };
  const points = channel.points.map((point, index) => {
    if (index !== pointIndex) return point;
    if (nodeType === "corner" || nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...plainPoint } = point;
      return { ...plainPoint, nodeType };
    }
    return { ...point, nodeType, handleIn: { x: -tangent.x, y: -tangent.y }, handleOut: tangent };
  });
  return { ...channel, pathMode: "bezier", points };
}

function normalizedDirection(from: DesignerPoint, to: DesignerPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function normalOf(direction: DesignerPoint) {
  return { x: -direction.y, y: direction.x };
}

function capArcPoints(center: DesignerPoint, tangent: DesignerPoint, radius: number, round: boolean, steps = 10): DesignerPoint[] {
  if (!round || steps <= 0) return [];
  const normal = { x: -tangent.y, y: tangent.x };
  const startAngle = Math.atan2(normal.y, normal.x);
  const ccw = { x: -normal.y, y: normal.x };
  const sweep = ccw.x * tangent.x + ccw.y * tangent.y >= 0 ? Math.PI : -Math.PI;
  const points: DesignerPoint[] = [];
  for (let step = 1; step < steps; step += 1) {
    const angle = startAngle + sweep * (step / steps);
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

export function worldHitTolerance(viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  const cmPerPixel = Math.max(viewport.width / Math.max(1, canvasSize.width), viewport.height / Math.max(1, canvasSize.height));
  return Math.max(0.6, cmPerPixel * 9);
}

export function summarizeRoute(route: DesignerRouteForm, designer: DesignerForm) {
  const lengthCm = routeLengthCm(route);
  const pixels = route.kind === "led_string" ? Math.max(0, Math.round(lengthCm * designer.addressablePixelsPerMeter / 100)) : 0;
  const leds = route.kind === "led_string" ? Math.max(0, Math.round(lengthCm * designer.ledsPerMeter / 100)) : 0;
  return {
    lengthCm,
    pixels,
    leds
  };
}

export function routeLengthCm(route: DesignerRouteForm) {
  return route.points.slice(1).reduce((total, point, index) => {
    const previous = route.points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

export function routeDirectionMarkers(route: DesignerRouteForm) {
  const markers: Array<{ x: number; y: number; angle: number }> = [];
  route.points.slice(1).forEach((point, pointIndex) => {
    const previous = route.points[pointIndex];
    const lengthCm = Math.hypot(point.x - previous.x, point.y - previous.y);
    // Every physical segment communicates its data direction. Only ignore a
    // degenerate pair of nodes that occupies the exact same position.
    if (lengthCm < 0.001) return;
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

export function isRouteTerminal(route: DesignerRouteForm, pointIndex: number) {
  return pointIndex === 0 || pointIndex === route.points.length - 1;
}

export function moveRoutePoint(routes: DesignerRouteForm[], routeId: string, pointIndex: number, point: DesignerPoint) {
  return routes.map((route) => {
    if (route.id !== routeId) return route;
    return {
      ...route,
      points: route.points.map((routePoint, index) => index === pointIndex ? { ...routePoint, ...point } : routePoint)
    };
  });
}

export function moveRouteTerminals(routes: DesignerRouteForm[], terminals: DesignerRouteTerminal[], point: DesignerPoint) {
  const terminalKeys = new Set(terminals.map((terminal) => `${terminal.routeId}:${terminal.pointIndex}`));
  return routes.map((route) => ({
    ...route,
    points: route.points.map((routePoint, index) => (
      terminalKeys.has(`${route.id}:${index}`) ? { ...routePoint, ...point } : routePoint
    ))
  }));
}

export function moveRouteWithSolderedTerminals(designer: DesignerForm, routeId: string, originalRoute: DesignerRouteForm, deltaX: number, deltaY: number, snapCm: number) {
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

export function canSolderRoutes(sourceRoute: DesignerRouteForm, sourcePointIndex: number, targetRoute: DesignerRouteForm, targetPointIndex: number, snapCm: number) {
  if (!isRouteTerminal(sourceRoute, sourcePointIndex) || !isRouteTerminal(targetRoute, targetPointIndex)) return false;
  if (!sameSnapPoint(sourceRoute.points[sourcePointIndex], targetRoute.points[targetPointIndex], snapCm)) return false;
  const sourceRole = routeTerminalRole(sourcePointIndex);
  const targetRole = routeTerminalRole(targetPointIndex);
  return sourceRole !== targetRole;
}

export function clearFloatingTerminalJoints(routes: DesignerRouteForm[], controller: DesignerControllerForm, snapCm: number) {
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

/**
 * Releases one selected solder point without deleting either physical route.
 * Same-kind routes are stored as one merged route after soldering, so an
 * internal solder point must be split back into two independent routes.
 */
export function detachSolderedRoutePoint(
  routes: DesignerRouteForm[],
  controller: DesignerControllerForm,
  routeId: string,
  pointIndex: number,
  snapCm: number
) {
  const route = routes.find((entry) => entry.id === routeId);
  const point = route?.points[pointIndex];
  if (!route || !point?.joint) return { routes, routeId, pointIndex, changed: false };

  if (!isRouteTerminal(route, pointIndex)) {
    let suffix = 1;
    let detachedRouteId = `${route.id}_detached_${suffix}`;
    while (routes.some((entry) => entry.id === detachedRouteId)) {
      suffix += 1;
      detachedRouteId = `${route.id}_detached_${suffix}`;
    }
    const detachedPoint = { ...point, joint: false };
    const firstRoute = {
      ...route,
      points: [...route.points.slice(0, pointIndex), detachedPoint]
    };
    const secondRoute = {
      ...route,
      id: detachedRouteId,
      name: `${route.name} detached`,
      points: [detachedPoint, ...route.points.slice(pointIndex + 1)]
    };
    const splitRoutes = routes.flatMap((entry) => entry.id === route.id ? [firstRoute, secondRoute] : [entry]);
    return {
      routes: clearFloatingTerminalJoints(splitRoutes, controller, snapCm),
      routeId: firstRoute.id,
      pointIndex: firstRoute.points.length - 1,
      changed: true
    };
  }

  const detachedRoutes = routes.map((entry) => entry.id !== route.id
    ? entry
    : {
      ...entry,
      points: entry.points.map((entryPoint, index) => index === pointIndex ? { ...entryPoint, joint: false } : entryPoint)
    });
  return {
    routes: clearFloatingTerminalJoints(detachedRoutes, controller, snapCm),
    routeId,
    pointIndex,
    changed: true
  };
}

export function routeTerminalRole(pointIndex: number) {
  return pointIndex === 0 ? "input" : "output";
}

export function controllerPortPoint(controller: DesignerControllerForm, portIndex: number, snapCm: number) {
  const portSpacing = controller.height / (controller.dataOutputs + 1);
  return {
    x: snapValue(controller.x + controller.width, snapCm),
    y: snapValue(controller.y + portSpacing * (portIndex + 1), snapCm)
  };
}

export function controllerConnectedPorts(controller: DesignerControllerForm, routes: DesignerRouteForm[], snapCm: number) {
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

export function resolveRouteOutputs(controller: DesignerControllerForm, routes: DesignerRouteForm[], snapCm: number) {
  const resolved = new Map<string, number>();
  const queue: Array<{ routeId: string; output: number }> = [];

  routes.filter((route) => route.kind === "data_cable" && route.points[0]?.joint).forEach((route) => {
    const portIndex = findControllerPortAtPoint(controller, route.points[0], snapCm);
    if (portIndex !== null) queue.push({ routeId: route.id, output: portIndex + 1 });
  });

  while (queue.length) {
    const current = queue.shift()!;
    if (resolved.has(current.routeId)) continue;
    const route = routes.find((entry) => entry.id === current.routeId);
    if (!route) continue;
    resolved.set(route.id, current.output);
    const end = route.points[route.points.length - 1];
    if (!end?.joint) continue;
    routes.forEach((candidate) => {
      if (candidate.id === route.id || resolved.has(candidate.id)) return;
      const start = candidate.points[0];
      if (start?.joint && sameSnapPoint(end, start, snapCm)) queue.push({ routeId: candidate.id, output: current.output });
    });
  }

  return resolved;
}

export function findMatchingControllerPort(controller: DesignerControllerForm, routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
  const route = routes.find((entry) => entry.id === routeId);
  if (!route || route.kind !== "data_cable" || pointIndex !== 0) return null;
  return findControllerPortAtPoint(controller, route.points[pointIndex], snapCm);
}

export function findControllerPortAtPoint(controller: DesignerControllerForm, point: DesignerPoint, snapCm: number) {
  for (let portIndex = 0; portIndex < controller.dataOutputs; portIndex += 1) {
    if (sameSnapPoint(point, controllerPortPoint(controller, portIndex, snapCm), snapCm)) return portIndex;
  }
  return null;
}

export function moveControllerWithSolderedCables(designer: DesignerForm, originalController: DesignerControllerForm, nextController: DesignerControllerForm, originalRoutes: DesignerRouteForm[], snapCm: number) {
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

export function findJointGroup(routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
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

export function findMatchingSolderTerminal(routes: DesignerRouteForm[], routeId: string, pointIndex: number, snapCm: number) {
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

export function findNearbySolderTerminal(routes: DesignerRouteForm[], routeId: string, pointIndex: number, point: DesignerPoint, captureRadiusCm: number): { routeId: string; pointIndex: number; point: DesignerPoint; distance: number } | null {
  const sourceRoute = routes.find((route) => route.id === routeId);
  if (!sourceRoute || !isRouteTerminal(sourceRoute, pointIndex)) return null;
  const sourceRole = routeTerminalRole(pointIndex);
  let nearest: { routeId: string; pointIndex: number; point: DesignerPoint; distance: number } | null = null;

  routes.forEach((route) => {
    if (route.id === routeId) return;
    [0, route.points.length - 1].forEach((candidateIndex) => {
      if (sourceRole === routeTerminalRole(candidateIndex)) return;
      const candidatePoint = route.points[candidateIndex];
      const distance = distanceBetweenPoints(point, candidatePoint);
      if (distance > captureRadiusCm || (nearest && distance >= nearest.distance)) return;
      nearest = { routeId: route.id, pointIndex: candidateIndex, point: candidatePoint, distance };
    });
  });

  return nearest;
}

export function findNearbyControllerPort(controller: DesignerControllerForm, route: DesignerRouteForm, pointIndex: number, point: DesignerPoint, captureRadiusCm: number, snapCm: number): { portIndex: number; point: DesignerPoint; distance: number } | null {
  if (route.kind !== "data_cable" || pointIndex !== 0) return null;
  let nearest: { portIndex: number; point: DesignerPoint; distance: number } | null = null;
  for (let portIndex = 0; portIndex < controller.dataOutputs; portIndex += 1) {
    const port = controllerPortPoint(controller, portIndex, snapCm);
    const distance = distanceBetweenPoints(point, port);
    if (distance > captureRadiusCm || (nearest && distance >= nearest.distance)) continue;
    nearest = { portIndex, point: port, distance };
  }
  return nearest;
}

export function sameSnapPoint(a: DesignerPoint, b: DesignerPoint, snapCm: number) {
  if (!Number.isFinite(snapCm) || snapCm <= 0) {
    return distanceBetweenPoints(a, b) <= 0.01;
  }
  return snapValue(a.x, snapCm) === snapValue(b.x, snapCm) && snapValue(a.y, snapCm) === snapValue(b.y, snapCm);
}

export function distanceBetweenPoints(a: DesignerPoint, b: DesignerPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function routeBounds(routes: DesignerRouteForm[]) {
  const points = routes.flatMap((route) => route.points);
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

export function designerBounds(designer: DesignerForm) {
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

export function clampViewport(viewport: DesignerViewport, designer: DesignerForm) {
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

export function fitViewportToDesigner(designer: DesignerForm) {
  const bounds = designerBounds(designer);
  return {
    x: bounds.minX,
    y: bounds.minY,
    width: Math.max(1, bounds.maxX - bounds.minX),
    height: Math.max(1, bounds.maxY - bounds.minY)
  };
}

/**
 * Keeps one world unit equally sized on both canvas axes. The viewport may
 * expose extra workspace on one side, but it must never stretch the drawing.
 */
export function normalizeViewportAspect(viewport: DesignerViewport, canvasAspect: number): DesignerViewport {
  const aspect = Math.max(0.1, canvasAspect);
  const scale = Math.max(viewport.width / aspect, viewport.height);
  const width = scale * aspect;
  const height = scale;
  return {
    x: viewport.x - (width - viewport.width) / 2,
    y: viewport.y - (height - viewport.height) / 2,
    width,
    height
  };
}

export function nearestRouteInsertIndex(route: DesignerRouteForm, point: DesignerPoint) {
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

export function pointToSegmentDistance(point: DesignerPoint, start: DesignerPoint, end: DesignerPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

/** Returns a monotonically increasing suffix without relying on array length. */
export function nextDesignerItemNumber(items: Array<{ id: string }>, prefix: string) {
  return items.reduce((highest, item) => {
    if (!item.id.startsWith(prefix)) return highest;
    const suffix = item.id.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return highest;
    return Math.max(highest, Number(suffix));
  }, 0) + 1;
}

export function sampleRouteLedDots(route: DesignerRouteForm, ledsPerMeter: number, addressablePixelsPerMeter: number) {
  const pitchCm = 100 / Math.max(1, ledsPerMeter);
  const addressablePitchCm = 100 / Math.max(1, addressablePixelsPerMeter);
  const dots: Array<DesignerPoint & { angle: number; addressableIndex: number }> = [];
  const segments = route.points.slice(1).map((end, index) => {
    const start = route.points[index];
    const lengthCm = Math.hypot(end.x - start.x, end.y - start.y);
    return {
      start,
      end,
      lengthCm,
      angle: lengthCm > 0.001 ? Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI : 0
    };
  }).filter((segment) => segment.lengthCm > 0.001);
  const totalLengthCm = segments.reduce((total, segment) => total + segment.lengthCm, 0);

  // A physical strip does not re-space LEDs at bends or solder points. Sample
  // one continuous center-to-center pitch across the entire polyline.
  for (let distanceCm = pitchCm / 2; distanceCm < totalLengthCm; distanceCm += pitchCm) {
    let remainingDistance = distanceCm;
    const segment = segments.find((entry) => {
      if (remainingDistance <= entry.lengthCm) return true;
      remainingDistance -= entry.lengthCm;
      return false;
    });
    if (!segment) continue;
    const ratio = remainingDistance / segment.lengthCm;
    dots.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      angle: segment.angle,
      addressableIndex: Math.floor(distanceCm / addressablePitchCm)
    });
  }
  return dots;
}
