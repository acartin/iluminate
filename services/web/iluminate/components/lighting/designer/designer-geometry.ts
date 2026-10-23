import type { DesignerBuildAreaForm, DesignerChannelForm, DesignerContour, DesignerControllerForm, DesignerFaceGraphicForm, DesignerForm, DesignerGeometry, DesignerLedStripConfiguration, DesignerPoint, DesignerPointNodeType, DesignerRouteForm, DesignerRouteKind, DesignerRouteSurface, DesignerWorkLineForm, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { filletDesignerGeometry } from "@/lib/lighting/designer-derived-geometry";
import { estimateDesignerTextBounds } from "@/lib/lighting/designer-text-geometry";
import type { DesignerActiveLayer, DesignerCanvasHit, DesignerFilletCornerTarget, DesignerRouteTerminal, DesignerViewport, ResizeHandle } from "./types";

export function designerProjectionName(sourceName: string) {
  return sourceName;
}

export function designerDerivedGeometryName(sourceName: string, operation: "offset" | "fillet", distanceMm?: number) {
  if (operation !== "offset") return `${sourceName} fillet`;
  const formattedDistance = Number((distanceMm ?? 0).toFixed(6)).toString();
  return `${sourceName} offset ${formattedDistance} mm`;
}

export function updatedDesignerOffsetName(sourceName: string, currentName: string, currentDistanceMm: number | undefined, nextDistanceMm: number) {
  return currentName === designerDerivedGeometryName(sourceName, "offset", currentDistanceMm)
    ? designerDerivedGeometryName(sourceName, "offset", nextDistanceMm)
    : currentName;
}

export function designerBooleanResultName(sourceName: string, operation: "union" | "subtract" | "intersect" | "exclude") {
  return `${sourceName} ${operation}`;
}

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

export function moveDesignerVectorGroupMember(
  designer: DesignerForm,
  member: { type: "build_area" | "zone" | "face_graphic"; id: string },
  movedMember: DesignerBuildAreaForm | DesignerZoneForm | DesignerFaceGraphicForm
): DesignerForm {
  const collection = member.type === "build_area" ? designer.buildAreas : member.type === "zone" ? designer.zones : designer.faceGraphics;
  const currentMember = collection.find((entry) => entry.id === member.id);
  if (!currentMember) return designer;
  const group = designer.vectorGroups.find((candidate) => candidate.members.some((candidate) => candidate.type === member.type && candidate.id === member.id));
  const memberIds = new Set(group?.members.filter((candidate) => candidate.type === member.type).map((candidate) => candidate.id) ?? [member.id]);
  if (member.type === "face_graphic" && designer.faceGraphics.some((entry) => memberIds.has(entry.id) && entry.locked)) return designer;
  const deltaX = movedMember.x - currentMember.x;
  const deltaY = movedMember.y - currentMember.y;

  if (member.type === "build_area") {
    return {
      ...designer,
      buildAreas: designer.buildAreas.map((entry) => memberIds.has(entry.id)
        ? entry.id === member.id ? { ...entry, ...movedMember } as DesignerBuildAreaForm : movedShape(entry, deltaX, deltaY, 0)
        : entry)
    };
  }
  if (member.type === "zone") {
    return {
      ...designer,
      zones: designer.zones.map((entry) => memberIds.has(entry.id)
        ? entry.id === member.id ? { ...entry, ...movedMember } as DesignerZoneForm : movedShape(entry, deltaX, deltaY, 0)
        : entry)
    };
  }
  return {
    ...designer,
    faceGraphics: designer.faceGraphics.map((entry) => memberIds.has(entry.id)
      ? entry.id === member.id ? { ...entry, ...movedMember } as DesignerFaceGraphicForm : movedShape(entry, deltaX, deltaY, 0)
      : entry)
  };
}

type PolygonPointShape = { x: number; y: number; width: number; height: number; points?: DesignerPoint[]; contours?: DesignerContour[] };

export function designerShapePointLocation(shape: Pick<PolygonPointShape, "points" | "contours">, flatIndex: number) {
  const contours = shape.contours?.length ? shape.contours : shape.points ? [{ points: shape.points, pathMode: "straight" as const, closed: true as const }] : [];
  let offset = 0;
  for (let contourIndex = 0; contourIndex < contours.length; contourIndex += 1) {
    const points = contours[contourIndex].points;
    if (flatIndex >= offset && flatIndex < offset + points.length) {
      return { contourIndex, pointIndex: flatIndex - offset, flatIndex, points, point: points[flatIndex - offset] };
    }
    offset += points.length;
  }
  return null;
}

export function designerShapePointCount(shape: Pick<PolygonPointShape, "points" | "contours">) {
  return shape.contours?.length ? shape.contours.reduce((count, contour) => count + contour.points.length, 0) : (shape.points?.length ?? 0);
}

function polygonShapeBounds(shape: Pick<PolygonPointShape, "points" | "contours">) {
  return pointsBounds(shape.contours?.length ? shape.contours.flatMap((contour) => contour.points) : (shape.points ?? []));
}

function replaceContourPoints<T extends PolygonPointShape>(shape: T, contourIndex: number, points: DesignerPoint[]): T {
  if (!shape.contours?.length) return { ...shape, points };
  const contours = shape.contours.map((contour, index) => index === contourIndex ? { ...contour, points } : contour);
  return { ...shape, points: contours[0].points, contours };
}

function synchronizeShapePathModes<T extends PolygonPointShape & { pathMode?: "straight" | "bezier" }>(shape: T): T {
  if (!shape.contours?.length) {
    return { ...shape, pathMode: shape.points?.some((point) => point.handleIn || point.handleOut) ? "bezier" : "straight" };
  }
  const contours = shape.contours.map((contour) => ({
    ...contour,
    pathMode: contour.points.some((point) => point.handleIn || point.handleOut) ? "bezier" as const : "straight" as const
  }));
  return {
    ...shape,
    points: contours[0].points,
    contours,
    pathMode: contours.some((contour) => contour.pathMode === "bezier") ? "bezier" : "straight"
  };
}

export function updatePolygonPoint<T extends PolygonPointShape>(shape: T, pointIndex: number, point: DesignerPoint, snapCm: number): T {
  const location = designerShapePointLocation(shape, pointIndex);
  if (!location) return shape;
  const points = location.points.map((entry, index) => (index === location.pointIndex ? { ...entry, x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry));
  const updated = replaceContourPoints(shape, location.contourIndex, points);
  const bounds = polygonShapeBounds(updated);
  return bounds ? { ...updated, ...bounds } : updated;
}

export function insertPolygonPoint<T extends PolygonPointShape>(shape: T, insertIndex: number, point: DesignerPoint, snapCm: number): T {
  const location = designerShapePointLocation(shape, Math.min(Math.max(0, insertIndex - 1), Math.max(0, designerShapePointCount(shape) - 1)));
  if (!location || location.points.length < 3) return shape;
  const nextPoint = { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) };
  const contourOffset = location.flatIndex - location.pointIndex;
  const localInsertIndex = clamp(Math.round(insertIndex - contourOffset), 0, location.points.length);
  const points = [...location.points.slice(0, localInsertIndex), nextPoint, ...location.points.slice(localInsertIndex)];
  const updated = replaceContourPoints(shape, location.contourIndex, points);
  const bounds = polygonShapeBounds(updated);
  return bounds ? { ...updated, ...bounds } : updated;
}

export function deletePolygonPoint<T extends PolygonPointShape>(shape: T, pointIndex: number): T {
  const location = designerShapePointLocation(shape, pointIndex);
  if (!location || location.points.length <= 3) return shape;
  const points = location.points.filter((_, index) => index !== location.pointIndex);
  const updated = replaceContourPoints(shape, location.contourIndex, points);
  const bounds = polygonShapeBounds(updated);
  return bounds ? { ...updated, ...bounds } : updated;
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
    const nodeType = point.nodeType ?? "smooth";
    if (nodeType === "corner" || nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...plainPoint } = point;
      return { ...plainPoint, nodeType };
    }
    return { ...point, nodeType, handleIn: { x: -handle.x, y: -handle.y }, handleOut: handle };
  });
}

/** Smooth handles for an open path, without wrapping the first/last neighbors. */
export function smoothOpenBezierPoints(points: DesignerPoint[]): DesignerPoint[] {
  return points.map((point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const factor = index === 0 || index === points.length - 1 ? 0.18 : 0.22;
    const handle = { x: (next.x - previous.x) * factor, y: (next.y - previous.y) * factor };
    const nodeType = point.nodeType ?? "smooth";
    if (nodeType === "corner" || nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...plainPoint } = point;
      return { ...plainPoint, nodeType };
    }
    return { ...point, nodeType, handleIn: { x: -handle.x, y: -handle.y }, handleOut: handle };
  });
}

export function setPolygonNodeType<T extends PolygonPointShape & { pathMode?: "straight" | "bezier" }>(shape: T, pointIndex: number, nodeType: DesignerPointNodeType): T {
  const location = designerShapePointLocation(shape, pointIndex);
  if (!location) return shape;
  const anchor = location.point;
  const previous = location.points[(location.pointIndex - 1 + location.points.length) % location.points.length];
  const next = location.points[(location.pointIndex + 1) % location.points.length];
  const tangent = { x: (next.x - previous.x) * 0.22, y: (next.y - previous.y) * 0.22 };
  const points = location.points.map((point, index) => {
    if (index !== location.pointIndex) return point;
    if (nodeType === "corner" || nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...plainPoint } = point;
      return { ...plainPoint, nodeType };
    }
    const { radiusMm: _radiusMm, ...smoothPoint } = point;
    return { ...smoothPoint, nodeType, handleIn: { x: -tangent.x, y: -tangent.y }, handleOut: tangent };
  });
  const updated = synchronizeShapePathModes(replaceContourPoints(shape, location.contourIndex, points));
  const bounds = polygonShapeBounds(updated);
  return { ...updated, ...(bounds ?? {}) };
}

export function updateBezierHandle<T extends PolygonPointShape>(shape: T, pointIndex: number, handle: "in" | "out", absolutePoint: DesignerPoint, snapCm: number): T {
  const location = designerShapePointLocation(shape, pointIndex);
  if (!location) return shape;
  const anchor = location.point;
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
  const points: DesignerPoint[] = location.points.map((point, index) => index === location.pointIndex ? { ...point, nodeType, [primary]: vector, [opposite]: oppositeVector } : point);
  const updated = synchronizeShapePathModes(replaceContourPoints(shape, location.contourIndex, points));
  const bounds = polygonShapeBounds(updated);
  return bounds ? { ...updated, ...bounds } : updated;
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

export function createRouteFromDraft(kind: DesignerRouteKind, start: DesignerPoint, end: DesignerPoint, designer: DesignerForm, designSurface: DesignerRouteSurface = "rear"): DesignerRouteForm {
  const next = nextRouteNumber(designer.routes);
  return {
    id: `route_${next}`,
    name: kind === "data_cable" ? `Data cable ${next}` : `LED string ${next}`,
    kind,
    designSurface,
    points: [start, end]
  };
}

export function createLedStringFromChannel(channel: DesignerChannelForm, designer: DesignerForm, reverse = false, seamPointIndex = 0): DesignerRouteForm | null {
  let points = channelCenterPolyline(channel).map((point) => ({ x: point.x, y: point.y }));
  if (points.length < 2) return null;
  if (channelIsClosed(channel)) {
    const seam = channel.points[Math.max(0, Math.min(channel.points.length - 1, seamPointIndex))] ?? channel.points[0];
    let nearestIndex = 0;
    points.forEach((point, index) => {
      if (distanceBetweenPoints(point, seam) < distanceBetweenPoints(points[nearestIndex], seam)) nearestIndex = index;
    });
    points = [...points.slice(nearestIndex), ...points.slice(0, nearestIndex)];
    points.push({ ...points[0] });
  }
  if (reverse) points.reverse();
  const route = createRouteFromDraft("led_string", points[0], points[points.length - 1], designer, channel.fabricationSurface ?? "front");
  return { ...route, name: `${channel.name} string`, lightingHost: { type: "channel", id: channel.id }, points };
}

export function createLedStringsFromZonePaths(
  zone: Pick<DesignerZoneForm, "id" | "name">,
  paths: Array<Pick<DesignerChannelForm, "points" | "pathMode" | "closed">>,
  designer: DesignerForm,
  designSurface: DesignerRouteSurface
) {
  const created: DesignerRouteForm[] = [];
  paths.forEach((path, index) => {
    const channelSnapshot: DesignerChannelForm = {
      id: `__zone_string_${zone.id}_${index}`,
      name: zone.name,
      points: path.points,
      pathMode: path.pathMode,
      widthMm: designer.ledPcbWidthMm,
      closed: path.closed,
      cap: "round",
      fabricationSurface: designSurface,
      visible: true,
      locked: false,
      opacity: 1
    };
    const route = createLedStringFromChannel(channelSnapshot, { ...designer, routes: [...designer.routes, ...created] });
    if (!route) return;
    created.push({
      ...route,
      name: `${zone.name} string${index ? ` ${index + 1}` : ""}`,
      lightingHost: { type: "zone", id: zone.id }
    });
  });
  return created;
}

export type SelectedStringConnectionPlan =
  | { upstream: DesignerRouteForm; downstream: DesignerRouteForm; output: number; reason: null }
  | { upstream: null; downstream: null; output: null; reason: string };

export function selectedStringConnectionPlan(designer: DesignerForm, routeIds: string[]): SelectedStringConnectionPlan {
  const strings = routeIds.flatMap((id) => {
    const route = designer.routes.find((entry) => entry.id === id && entry.kind === "led_string");
    return route ? [route] : [];
  });
  if (strings.length !== 2) return { upstream: null, downstream: null, output: null, reason: "Select exactly two LED strings." };
  if (!sameRouteSurface(strings[0], strings[1])) return { upstream: null, downstream: null, output: null, reason: "Selected strings must be on the same construction surface." };
  const outputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const rooted = strings.filter((route) => outputs.has(route.id));
  if (rooted.length !== 1) return {
    upstream: null,
    downstream: null,
    output: null,
    reason: rooted.length ? "Both strings already reach the controller; connecting them would create an ambiguous chain." : "One selected string must already reach the controller."
  };
  const upstream = rooted[0];
  const downstream = strings.find((route) => route.id !== upstream.id)!;
  const upstreamEnd = upstream.points[upstream.points.length - 1];
  const downstreamStart = downstream.points[0];
  if (!upstreamEnd || !downstreamStart) return { upstream: null, downstream: null, output: null, reason: "Both strings need valid input and output terminals." };
  if (upstreamEnd.joint) return { upstream: null, downstream: null, output: null, reason: "The connected string output is already occupied." };
  if (downstreamStart.joint) return { upstream: null, downstream: null, output: null, reason: "The unassigned string input is already occupied." };
  if (sameTerminalPoint(upstreamEnd, downstreamStart)) return { upstream: null, downstream: null, output: null, reason: "These terminals already coincide; solder them directly instead of adding a cable." };
  return { upstream, downstream, output: outputs.get(upstream.id)!, reason: null };
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
      if (!operation.visible || !targetsActiveLayer || operation.targetLayer === "reference" && !designer.layers.artwork.visible) continue;
      const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
      if (!resolved.geometry) continue;
      const shape = designerGeometryAsShape(resolved.geometry);
      if (pointInsideDesignerShape(shape, point) || pointNearShapeStroke(shape, point, tolerance * 2)) return { type: "derived_geometry", id: operation.id };
    }
    for (const projection of [...designer.projections].reverse()) {
      const targetsActiveLayer = projection.targetLayer === "reference"
        ? activeLayer === "artwork" || activeLayer === "reference"
        : projection.targetLayer === activeLayer;
      if (!projection.visible || !targetsActiveLayer || projection.targetLayer === "reference" && !designer.layers.artwork.visible) continue;
      const sourceChannel = designer.channels.find((channel) => channel.geometryId === projection.sourceGeometryId);
      if (sourceChannel && channelContainsPoint(sourceChannel, point, tolerance)) return { type: "projection", id: projection.id };
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
  if (activeLayer === "hardware" || activeLayer === "strings") {
    if (designer.layers.strings.visible) {
      for (const route of [...designer.routes].reverse()) {
        if (route.visible === false) continue;
        const pointHit = pickRoutePointHit(route, point, tolerance);
        if (pointHit) return pointHit;
        if (distanceToPolyline(route.points, point) <= tolerance) return { type: "route", id: route.id };
      }
    }
    if (designer.layers.hardware.visible && designer.controller.visible !== false) {
      const controllerHit = pickControllerHit(designer.controller, point, tolerance);
      if (controllerHit) return controllerHit;
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
      const pointHit = zone.shape === "polygon" && zone.points ? pickShapePointHit(zone.id, zone, point, tolerance, "zone_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(zone, point, tolerance, "zone_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(zone, point) || pointNearShapeStroke(zone, point, tolerance * 2)) return { type: "zone", id: zone.id };
    }
  }
  if (activeLayer === "faceGraphic" && designer.layers.faceGraphic.visible) {
    for (const element of designer.faceGraphics) {
      if (element.visible === false) continue;
      const pointHit = element.shape === "polygon" && element.points ? pickShapePointHit(element.id, element, point, tolerance, "face_graphic_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(element, point, tolerance, "face_graphic_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(element, point) || pointNearShapeStroke(element, point, tolerance * 2)) return { type: "face_graphic", id: element.id };
    }
  }
  if (activeLayer === "fabrication" && designer.layers.fabrication.visible) {
    const visiblePartIds = new Set(designer.fabricationParts.filter((part) => part.visible !== false).map((part) => part.id));
    for (const path of [...designer.fabricationPaths].reverse()) {
      if (path.visible === false || !visiblePartIds.has(path.partId)) continue;
      if (pointInsideDesignerShape(path, point) || pointNearShapeStroke(path, point, tolerance * 2)) return { type: "fabrication_path", id: path.id };
    }
  }
  if ((activeLayer === "reference" || activeLayer === "artwork") && designer.layers.artwork.visible) {
    for (const buildArea of [...designer.buildAreas].reverse()) {
      if (buildArea.visible === false) continue;
      const pointHit = buildArea.shape === "polygon" && buildArea.points ? pickShapePointHit(buildArea.id, buildArea, point, tolerance, "build_area_point") : null;
      if (pointHit) return pointHit;
      const resizeHit = pickResizeHandleHit(buildArea, point, tolerance, "build_area_resize");
      if (resizeHit) return resizeHit;
      if (pointInsideDesignerShape(buildArea, point) || pointNearShapeStroke(buildArea, point, tolerance * 2)) return { type: "build_area", id: buildArea.id };
    }
  }
  // Construction lines are deliberately last in hit priority so they never
  // steal a click from authored geometry drawn above them.
  if (designer.layers.artwork.visible && designer.workLinesVisible) {
    for (const line of [...designer.workLines].reverse()) {
      const pointHit = pickPolygonPointHit(line.id, line.points, point, tolerance, "work_line_point");
      if (pointHit) return pointHit;
      if (distanceToPolyline(line.points, point) <= tolerance) return { type: "work_line", id: line.id };
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
  return nearestPointHit(route.id, route.points, point, tolerance, "route_point");
}

export function pickPolygonPointHit(id: string, points: DesignerPoint[], point: DesignerPoint, tolerance: number, type: "build_area_point" | "zone_point" | "channel_point" | "face_graphic_point" | "work_line_point"): DesignerCanvasHit {
  return nearestPointHit(id, points, point, tolerance, type);
}

export function pickShapePointHit(id: string, shape: Pick<PolygonPointShape, "points" | "contours">, point: DesignerPoint, tolerance: number, type: "build_area_point" | "zone_point" | "face_graphic_point"): DesignerCanvasHit {
  const contours = shape.contours?.length ? shape.contours : shape.points ? [{ points: shape.points }] : [];
  let nearest: { distance: number; pointIndex: number } | null = null;
  let offset = 0;
  for (const contour of contours) {
    for (let index = 0; index < contour.points.length; index += 1) {
      const distance = distanceBetweenPoints(contour.points[index], point);
      if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { distance, pointIndex: offset + index };
    }
    offset += contour.points.length;
  }
  return nearest ? { type, id, pointIndex: nearest.pointIndex } : null;
}

function nearestPointHit(id: string, points: DesignerPoint[], point: DesignerPoint, tolerance: number, type: "route_point" | "build_area_point" | "zone_point" | "channel_point" | "face_graphic_point" | "work_line_point"): DesignerCanvasHit {
  let nearest: { distance: number; pointIndex: number } | null = null;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const candidate = points[pointIndex];
    const distance = distanceBetweenPoints(candidate, point);
    if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { distance, pointIndex };
  }
  return nearest ? { type, id, pointIndex: nearest.pointIndex } : null;
}

export function movedWorkLine(line: DesignerWorkLineForm, deltaX: number, deltaY: number, snapCm: number): DesignerWorkLineForm {
  const anchor = line.points[0];
  if (!anchor) return line;
  const snappedDeltaX = snapValue(anchor.x + deltaX, snapCm) - anchor.x;
  const snappedDeltaY = snapValue(anchor.y + deltaY, snapCm) - anchor.y;
  return { ...line, points: line.points.map((point) => ({ ...point, x: point.x + snappedDeltaX, y: point.y + snappedDeltaY })) };
}

export function updateWorkLinePoint(line: DesignerWorkLineForm, pointIndex: number, point: DesignerPoint, snapCm: number): DesignerWorkLineForm {
  if (!line.points[pointIndex]) return line;
  return { ...line, points: line.points.map((entry, index) => index === pointIndex ? { x: snapValue(point.x, snapCm), y: snapValue(point.y, snapCm) } : entry) };
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

export function pointInsideDesignerShape(shape: Pick<DesignerBuildAreaForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode" | "fillRule"> & { closed?: boolean }, point: DesignerPoint) {
  if (shape.shape === "polygon" && shape.points) {
    if (shape.closed === false) return false;
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

export function pointNearShapeStroke(shape: Pick<DesignerBuildAreaForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode"> & { closed?: boolean }, point: DesignerPoint, tolerance: number) {
  if (shape.shape === "polygon" && shape.points) {
    if (shape.contours?.length) return shape.contours.some((contour) => polygonSegments(contourOutlinePoints(contour)).some((segment) => pointToSegmentDistance(point, segment.start, segment.end) <= tolerance));
    const outline = shapeOutlinePoints(shape);
    const bounds = pointsBounds(outline);
    if (!bounds || !pointInsideRect(bounds, point, tolerance)) return false;
    const segments = shape.closed === false
      ? outline.slice(1).map((end, index) => ({ start: outline[index], end }))
      : polygonSegments(outline);
    return segments.some((segment) => pointToSegmentDistance(point, segment.start, segment.end) <= tolerance);
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

export function nearestShapeInsertIndex(shape: Pick<DesignerZoneForm, "shape" | "pathMode" | "points" | "contours"> | Pick<DesignerBuildAreaForm, "shape" | "pathMode" | "points" | "contours">, point: DesignerPoint) {
  if (shape.shape !== "polygon" || !shape.points || shape.points.length < 3) return null;
  const contours = shape.contours?.length ? shape.contours : [{ points: shape.points, pathMode: shape.pathMode ?? "straight", closed: true as const }];
  let nearest = { distance: Number.POSITIVE_INFINITY, insertIndex: 1 };
  let offset = 0;
  contours.forEach((contour) => {
    if (contour.pathMode !== "bezier") {
      const localIndex = nearestPolygonInsertIndex(contour.points, point);
      if (localIndex === null) {
        offset += contour.points.length;
        return;
      }
      const start = contour.points[(localIndex - 1 + contour.points.length) % contour.points.length];
      const end = contour.points[localIndex % contour.points.length];
      const distance = pointToSegmentDistance(point, start, end);
      if (distance < nearest.distance) nearest = { distance, insertIndex: offset + localIndex };
      offset += contour.points.length;
      return;
    }
    contour.points.forEach((start, index) => {
      const end = contour.points[(index + 1) % contour.points.length];
      let previous = cubicBezierPoint(start, end, 0);
      for (let step = 1; step <= 16; step += 1) {
        const current = cubicBezierPoint(start, end, step / 16);
        const distance = pointToSegmentDistance(point, previous, current);
        if (distance < nearest.distance) nearest = { distance, insertIndex: offset + index + 1 };
        previous = current;
      }
    });
    offset += contour.points.length;
  });
  return nearest.insertIndex;
}

export function shapeInsertIndexAtPoint(shape: Pick<DesignerZoneForm, "shape" | "pathMode" | "points" | "contours" | "x" | "y" | "width" | "height"> | Pick<DesignerBuildAreaForm, "shape" | "pathMode" | "points" | "contours" | "x" | "y" | "width" | "height">, point: DesignerPoint, tolerance: number) {
  if (shape.shape !== "polygon" || !shape.points) return null;
  if (pickShapePointHit("candidate", shape, point, tolerance, "zone_point")) return null;
  if (!pointNearShapeStroke(shape, point, tolerance * 1.5)) return null;
  return nearestShapeInsertIndex(shape, point);
}

export function channelWidthCm(channel: DesignerChannelForm) {
  return Math.max(0.1, (Number.isFinite(channel.widthMm) ? channel.widthMm : 10) / 10);
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
  return Math.max(0.08, cmPerPixel * 9);
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

export function moveRoutePointWithRetraction(routes: DesignerRouteForm[], routeId: string, pointIndex: number, point: DesignerPoint, toleranceCm = 0.02) {
  return routes.map((route) => {
    if (route.id !== routeId || !route.points.length) return route;
    const effectiveIndex = pointIndex === 0 ? 0 : Math.min(pointIndex, route.points.length - 1);
    const terminalSide = effectiveIndex === 0 ? "input" : effectiveIndex === route.points.length - 1 ? "output" : null;
    if (route.kind !== "led_string" || !terminalSide || route.points[effectiveIndex]?.joint || route.points.length < 2) {
      return { ...route, points: route.points.map((routePoint, index) => index === effectiveIndex ? { ...routePoint, ...point } : routePoint) };
    }

    let traversedCm = 0;
    const candidates: Array<{ segmentIndex: number; projected: DesignerPoint; distanceCm: number; pathDistanceCm: number }> = [];
    for (let index = 0; index < route.points.length - 1; index += 1) {
      const start = route.points[index];
      const end = route.points[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const segmentLengthCm = Math.hypot(dx, dy);
      if (segmentLengthCm < 0.000001) continue;
      const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (segmentLengthCm * segmentLengthCm)));
      const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
      candidates.push({
        segmentIndex: index,
        projected,
        distanceCm: distanceBetweenPoints(point, projected),
        pathDistanceCm: traversedCm + segmentLengthCm * ratio
      });
      traversedCm += segmentLengthCm;
    }
    const originalLengthCm = traversedCm;
    const candidate = candidates
      .filter((entry) => entry.distanceCm <= Math.max(0.001, toleranceCm)
        && entry.pathDistanceCm > 0.001
        && entry.pathDistanceCm < originalLengthCm - 0.001)
      .sort((left, right) => left.distanceCm - right.distanceCm
        || (terminalSide === "output" ? right.pathDistanceCm - left.pathDistanceCm : left.pathDistanceCm - right.pathDistanceCm))[0];
    if (!candidate) {
      return { ...route, points: route.points.map((routePoint, index) => index === effectiveIndex ? { ...routePoint, ...point } : routePoint) };
    }

    const terminalPoint = { ...route.points[effectiveIndex], ...point, ...candidate.projected };
    const nextPoints = terminalSide === "output"
      ? [...route.points.slice(0, candidate.segmentIndex + 1), terminalPoint]
      : [terminalPoint, ...route.points.slice(candidate.segmentIndex + 1)];
    const deduplicated = nextPoints.filter((entry, index) => index === 0 || distanceBetweenPoints(entry, nextPoints[index - 1]) > 0.000001);
    return deduplicated.length >= 2 ? { ...route, points: deduplicated } : route;
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
  if (!sameRouteSurface(sourceRoute, targetRoute)) return false;
  if (!sameTerminalPoint(sourceRoute.points[sourcePointIndex], targetRoute.points[targetPointIndex])) return false;
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
        if (!sameRouteSurface(route, candidateRoute)) return false;
        return [0, candidateRoute.points.length - 1].some((candidateIndex) => {
          const candidatePoint = candidateRoute.points[candidateIndex];
          if (!candidatePoint?.joint) return false;
          return routeTerminalRole(pointIndex) !== routeTerminalRole(candidateIndex) && sameTerminalPoint(point, candidatePoint);
        });
      });
      return connectedToRoute ? point : { ...point, joint: false };
    })
  }));
}

/** Removes one authored electrical route, including every light-source assignment to it. */
export function deleteDesignerRoute(designer: DesignerForm, routeId: string): DesignerForm {
  const routes = clearFloatingTerminalJoints(
    designer.routes.filter((route) => route.id !== routeId),
    designer.controller,
    designer.snapCm
  );
  if (routes.length === designer.routes.length) return designer;
  return {
    ...designer,
    routes,
    lightSources: designer.lightSources.map((source) => ({
      ...source,
      stringIds: source.stringIds.filter((id) => id !== routeId)
    }))
  };
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
      if (sameTerminalPoint(terminal, controllerPortPoint(controller, portIndex, snapCm))) {
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
      if (!sameRouteSurface(route, candidate)) return;
      const start = candidate.points[0];
      if (start?.joint && sameTerminalPoint(end, start)) queue.push({ routeId: candidate.id, output: current.output });
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
    if (sameTerminalPoint(point, controllerPortPoint(controller, portIndex, snapCm))) return portIndex;
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
    const matchingPortMove = portMoves.find((portMove) => sameTerminalPoint(terminal, portMove.from));
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
    if (!sameRouteSurface(sourceRoute, route)) return;
    [0, route.points.length - 1].forEach((candidateIndex) => {
      const candidatePoint = route.points[candidateIndex];
      if (!candidatePoint?.joint) return;
      if (sameTerminalPoint(sourcePoint, candidatePoint)) {
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
    if (!sameRouteSurface(sourceRoute, route)) return;
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

/** Electrical coincidence is physical and must never expand with the drawing grid. */
export function sameTerminalPoint(a: DesignerPoint, b: DesignerPoint) {
  return distanceBetweenPoints(a, b) <= 0.01;
}

/** Front and rear wiring occupy independent electrical planes. */
export function sameRouteSurface(left: DesignerRouteForm, right: DesignerRouteForm) {
  const leftSurface = left.designSurface === "front" ? "front" : "rear";
  const rightSurface = right.designSurface === "front" ? "front" : "rear";
  return leftSurface === rightSurface;
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

/** Finds unique crossings between distinct straight Work Line polylines. */
export function workLineIntersectionPoints(workLines: DesignerWorkLineForm[], epsilon = 1e-6): DesignerPoint[] {
  const intersections: DesignerPoint[] = [];
  const addUnique = (point: DesignerPoint) => {
    if (!intersections.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) <= epsilon)) intersections.push(point);
  };

  for (let leftIndex = 0; leftIndex < workLines.length; leftIndex += 1) {
    const left = workLines[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < workLines.length; rightIndex += 1) {
      const right = workLines[rightIndex];
      for (let leftSegment = 1; leftSegment < left.points.length; leftSegment += 1) {
        const a = left.points[leftSegment - 1];
        const b = left.points[leftSegment];
        for (let rightSegment = 1; rightSegment < right.points.length; rightSegment += 1) {
          const c = right.points[rightSegment - 1];
          const d = right.points[rightSegment];
          const r = { x: b.x - a.x, y: b.y - a.y };
          const s = { x: d.x - c.x, y: d.y - c.y };
          const denominator = r.x * s.y - r.y * s.x;
          if (Math.abs(denominator) <= epsilon) {
            for (const leftEndpoint of [a, b]) {
              for (const rightEndpoint of [c, d]) {
                if (Math.hypot(leftEndpoint.x - rightEndpoint.x, leftEndpoint.y - rightEndpoint.y) <= epsilon) {
                  addUnique({ x: (leftEndpoint.x + rightEndpoint.x) / 2, y: (leftEndpoint.y + rightEndpoint.y) / 2 });
                }
              }
            }
            continue;
          }
          const delta = { x: c.x - a.x, y: c.y - a.y };
          const t = (delta.x * s.y - delta.y * s.x) / denominator;
          const u = (delta.x * r.y - delta.y * r.x) / denominator;
          if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) continue;
          addUnique({ x: a.x + t * r.x, y: a.y + t * r.y });
        }
      }
    }
  }
  return intersections;
}

/** Excludes intersections that already have a generated Work Line hole at the same center. */
export function missingWorkLineHolePoints(
  intersections: DesignerPoint[],
  faceGraphics: DesignerFaceGraphicForm[],
  epsilon = 1e-4
): DesignerPoint[] {
  const generatedHoleCenters = faceGraphics
    .filter((element) => element.id.startsWith("work_line_hole_") && element.shape === "ellipse")
    .map((element) => ({ x: element.x + element.width / 2, y: element.y + element.height / 2 }));

  return intersections.filter((point) => !generatedHoleCenters.some(
    (center) => Math.hypot(center.x - point.x, center.y - point.y) <= epsilon
  ));
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

/** Resolves drawing geometry without rewriting any authored strip parameter. */
export function resolvedLedStripCutSegmentLengthMm(configuration: DesignerLedStripConfiguration, physicalLedsPerMeter: number) {
  if (configuration.construction === "discrete" && configuration.physicalLedsPerCutSegment !== undefined) {
    return 1000 * configuration.physicalLedsPerCutSegment / Math.max(0.1, physicalLedsPerMeter);
  }
  return configuration.cutSegmentLengthMm ?? 100;
}

/** Samples physical cut boundaries continuously across every bend in a route. */
export function sampleRouteCutMarks(route: DesignerRouteForm, cutSegmentLengthMm: number) {
  const intervalCm = Math.max(0.01, cutSegmentLengthMm / 10);
  const segments = route.points.slice(1).map((end, index) => {
    const start = route.points[index];
    const lengthCm = Math.hypot(end.x - start.x, end.y - start.y);
    return { start, end, lengthCm, angle: lengthCm > 0.001 ? Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI : 0 };
  }).filter((segment) => segment.lengthCm > 0.001);
  const totalLengthCm = segments.reduce((total, segment) => total + segment.lengthCm, 0);
  const marks: Array<DesignerPoint & { angle: number; routeOffsetCm: number }> = [];
  for (let distanceCm = intervalCm; distanceCm < totalLengthCm - 1e-6; distanceCm += intervalCm) {
    let remainingDistance = distanceCm;
    const segment = segments.find((entry) => {
      if (remainingDistance <= entry.lengthCm) return true;
      remainingDistance -= entry.lengthCm;
      return false;
    });
    if (!segment) continue;
    const ratio = remainingDistance / segment.lengthCm;
    marks.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      angle: segment.angle,
      routeOffsetCm: distanceCm
    });
  }
  return marks;
}
