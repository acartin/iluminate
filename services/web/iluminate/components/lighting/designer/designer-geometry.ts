import type { DesignerBuildAreaForm, DesignerControllerForm, DesignerForm, DesignerPoint, DesignerPointNodeType, DesignerRouteForm, DesignerRouteKind, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import type { DesignerActiveLayer, DesignerCanvasHit, DesignerRouteTerminal, DesignerViewport, ResizeHandle } from "./types";

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
  return zone.shape === "polygon" && zone.points ? { ...next, points: scaleShapePoints(zone, next) } : next;
}

export function resizedBuildArea(buildArea: DesignerBuildAreaForm, handle: ResizeHandle, deltaX: number, deltaY: number, snapCm: number, modifiers?: { preserveAspect?: boolean; fromCenter?: boolean }): DesignerBuildAreaForm {
  const next = resizedZone(buildArea, handle, deltaX, deltaY, snapCm, modifiers);
  return {
    ...buildArea,
    x: next.x ?? buildArea.x,
    y: next.y ?? buildArea.y,
    width: next.width ?? buildArea.width,
    height: next.height ?? buildArea.height
  };
}

export function snapValue(value: number, snapCm: number) {
  if (!Number.isFinite(snapCm) || snapCm <= 0) return Math.round(value * 1000) / 1000;
  const step = snapCm;
  return Math.round(value / step) * step;
}

export function movedShape<T extends { x: number; y: number; points?: DesignerPoint[] }>(shape: T, deltaX: number, deltaY: number, snapCm: number): T {
  const x = snapValue(shape.x + deltaX, snapCm);
  const y = snapValue(shape.y + deltaY, snapCm);
  const pointDeltaX = x - shape.x;
  const pointDeltaY = y - shape.y;
  return {
    ...shape,
    x,
    y,
    points: shape.points?.map((point) => ({ ...point, x: point.x + pointDeltaX, y: point.y + pointDeltaY }))
  };
}

export function updatePolygonPoint<T extends { x: number; y: number; width: number; height: number; points?: DesignerPoint[] }>(shape: T, pointIndex: number, point: DesignerPoint, snapCm: number): T {
  if (!shape.points?.[pointIndex]) return shape;
  const points = shape.points.map((entry, index) => (index === pointIndex ? { ...entry, x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry));
  const bounds = pointsBounds(points);
  if (!bounds) return { ...shape, points };
  return { ...shape, ...bounds, points };
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
    return { ...point, nodeType, handleIn: { x: -tangent.x, y: -tangent.y }, handleOut: tangent };
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

export function pickDesignerHit(designer: DesignerForm, activeLayer: DesignerActiveLayer, point: DesignerPoint, viewport: DesignerViewport, canvasSize: { width: number; height: number }): DesignerCanvasHit {
  const tolerance = worldHitTolerance(viewport, canvasSize);
  if (activeLayer === "artwork" && designer.layers.artwork.visible && !designer.layers.artwork.locked) {
    for (const artwork of [...designer.artwork].reverse()) {
      if (!artwork.visible || artwork.locked) continue;
      const resizeHit = pickResizeHandleHit(artwork, point, tolerance, "artwork_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideRect(artwork, point, tolerance)) return { type: "artwork", id: artwork.id };
    }
  }
  if (activeLayer === "strings" && designer.layers.strings.visible && !designer.layers.strings.locked) {
    const controllerHit = pickControllerHit(designer.controller, point, tolerance);
    if (controllerHit) return controllerHit;
    for (const route of [...designer.routes].reverse()) {
      const pointHit = pickRoutePointHit(route, point, tolerance);
      if (pointHit) return pointHit;
      if (distanceToPolyline(route.points, point) <= tolerance) return { type: "route", id: route.id };
    }
  }
  if (activeLayer === "zones" && designer.layers.zones.visible && !designer.layers.zones.locked) {
    for (const zone of [...designer.zones].reverse()) {
      if (!zone.visible || zone.locked) continue;
      const pointHit = zone.shape === "polygon" && zone.points ? pickPolygonPointHit(zone.id, zone.points, point, tolerance, "zone_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(zone, point, tolerance, "zone_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(zone, point) || pointNearShapeStroke(zone, point, tolerance * 2)) return { type: "zone", id: zone.id };
    }
  }
  if (activeLayer === "reference" && designer.layers.reference.visible && !designer.layers.reference.locked) {
    for (const buildArea of [...designer.buildAreas].reverse()) {
      if (!buildArea.visible || buildArea.locked) continue;
      const pointHit = buildArea.shape === "polygon" && buildArea.points ? pickPolygonPointHit(buildArea.id, buildArea.points, point, tolerance, "build_area_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(buildArea, point, tolerance, "build_area_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(buildArea, point) || pointNearShapeStroke(buildArea, point, tolerance * 2)) return { type: "build_area", id: buildArea.id };
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

export function pickPolygonPointHit(id: string, points: DesignerPoint[], point: DesignerPoint, tolerance: number, type: "build_area_point" | "zone_point"): DesignerCanvasHit {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (distanceBetweenPoints(points[index], point) <= tolerance) return { type, id, pointIndex: index };
  }
  return null;
}

export function pickResizeHandleHit(shape: { id: string; x: number; y: number; width: number; height: number }, point: DesignerPoint, tolerance: number, type: "artwork_resize" | "build_area_resize" | "zone_resize"): DesignerCanvasHit {
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

export function pointInsideDesignerShape(shape: DesignerBuildAreaForm | DesignerZoneForm, point: DesignerPoint) {
  if (shape.shape === "polygon" && shape.points) {
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

export function pointNearShapeStroke(shape: DesignerBuildAreaForm | DesignerZoneForm, point: DesignerPoint, tolerance: number) {
  if (shape.shape === "polygon" && shape.points) {
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

function cubicBezierPoint(start: DesignerPoint, end: DesignerPoint, t: number): DesignerPoint {
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
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / Math.max(0.000001, previous.y - current.y) + current.x;
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
