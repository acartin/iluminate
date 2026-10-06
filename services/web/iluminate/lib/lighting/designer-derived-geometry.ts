import type { DesignerContour, DesignerDerivedGeometry, DesignerGeometry, DesignerPoint } from "./partitura-model";

export type DesignerDerivedOperationResult = {
  geometry: DesignerGeometry | null;
  issue: "collapsed" | "invalid-topology" | null;
  warnings: string[];
};

export function applyDesignerDerivedOperation(source: DesignerGeometry, operation: DesignerDerivedGeometry, resultId = operation.geometryId): DesignerDerivedOperationResult {
  return operation.operation === "offset"
    ? offsetDesignerGeometry(source, operation.distanceMm ?? 0, operation.join ?? "round", operation.miterLimit ?? 4, resultId)
    : filletDesignerGeometry(source, operation.radiusMm ?? 0, operation.cornerIndices, resultId);
}

export function offsetDesignerGeometry(
  source: DesignerGeometry,
  distanceMm: number,
  join: "round" | "miter" | "bevel",
  miterLimit: number,
  resultId = `${source.id}_offset`
): DesignerDerivedOperationResult {
  const distanceCm = distanceMm / 10;
  const sourceContours = geometryContours(source);
  if (!sourceContours.length || Math.abs(distanceCm) < 1e-7) return { geometry: cloneGeometry(source, resultId), issue: null, warnings: [] };
  if (source.closed !== false && distanceCm < 0 && Math.abs(distanceCm) * 2 >= Math.min(source.width, source.height) - 1e-7) return { geometry: null, issue: "collapsed", warnings: [] };
  const warnings = new Set<string>();
  const contours = sourceContours.flatMap((contour, contourIndex) => {
    const points = flattenContour(contour, source.closed !== false);
    if (points.length < (source.closed === false ? 2 : 3)) return [];
    const nestingDepth = source.closed === false ? 0 : sourceContours.filter((candidate, candidateIndex) => candidateIndex !== contourIndex && pointInPolygon(points[0], flattenContour(candidate, true))).length;
    const contourDistance = distanceCm * (nestingDepth % 2 === 0 ? 1 : -1);
    const offset = offsetPolyline(points, source.closed !== false, contourDistance, join, Math.max(1, miterLimit), warnings);
    return offset.length >= (source.closed === false ? 2 : 3) ? [{ points: offset, pathMode: "straight" as const, closed: true as const }] : [];
  });
  if (!contours.length) return { geometry: null, issue: "collapsed", warnings: Array.from(warnings) };
  if (source.closed !== false) {
    const sourceArea = sourceContours.reduce((sum, contour) => sum + Math.abs(signedArea(flattenContour(contour, true))), 0);
    const resultArea = contours.reduce((sum, contour) => sum + Math.abs(signedArea(contour.points)), 0);
    if (resultArea < 1e-5 || distanceCm < 0 && resultArea >= sourceArea * 1.02) return { geometry: null, issue: "collapsed", warnings: Array.from(warnings) };
    if (contours.some((contour) => polylineSelfIntersects(contour.points, true))) return { geometry: null, issue: "invalid-topology", warnings: [...Array.from(warnings), "Offset produced a self-intersection."] };
  }
  return { geometry: geometryFromContours(resultId, contours, source.closed !== false), issue: null, warnings: Array.from(warnings) };
}

export function filletDesignerGeometry(
  source: DesignerGeometry,
  radiusMm: number,
  cornerIndices: number[] | undefined,
  resultId = `${source.id}_fillet`
): DesignerDerivedOperationResult {
  const radiusCm = Math.max(0, radiusMm) / 10;
  const contours = geometryContours(source);
  if (!contours.length || radiusCm < 1e-7) return { geometry: cloneGeometry(source, resultId), issue: null, warnings: [] };
  const warnings = new Set<string>();
  let flatCornerIndex = 0;
  const selected = cornerIndices?.length ? new Set(cornerIndices.map((index) => Math.max(0, Math.round(index)))) : null;
  const resultContours = contours.map((contour) => {
    const points = flattenContour(contour, source.closed !== false);
    const filleted = filletPolyline(points, source.closed !== false, radiusCm, selected, () => flatCornerIndex++, warnings);
    return { points: filleted, pathMode: "straight" as const, closed: true as const };
  });
  if (resultContours.some((contour) => contour.points.length < 3 || polylineSelfIntersects(contour.points, source.closed !== false))) {
    return { geometry: null, issue: "invalid-topology", warnings: [...Array.from(warnings), "Fillet produced invalid topology."] };
  }
  return { geometry: geometryFromContours(resultId, resultContours, source.closed !== false), issue: null, warnings: Array.from(warnings) };
}

function geometryContours(geometry: DesignerGeometry): DesignerContour[] {
  if (geometry.kind === "rect") return [{ points: [{ x: geometry.x, y: geometry.y }, { x: geometry.x + geometry.width, y: geometry.y }, { x: geometry.x + geometry.width, y: geometry.y + geometry.height }, { x: geometry.x, y: geometry.y + geometry.height }], pathMode: "straight", closed: true }];
  if (geometry.kind === "ellipse") {
    const center = { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
    return [{ points: Array.from({ length: 64 }, (_, index) => { const angle = index / 64 * Math.PI * 2; return { x: center.x + Math.cos(angle) * geometry.width / 2, y: center.y + Math.sin(angle) * geometry.height / 2 }; }), pathMode: "straight", closed: true }];
  }
  if (geometry.contours?.length) return geometry.contours;
  return geometry.points?.length ? [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: true }] : [];
}

function flattenContour(contour: DesignerContour, closed = true) {
  if (contour.pathMode !== "bezier") return contour.points.map((point) => ({ x: point.x, y: point.y }));
  const result: DesignerPoint[] = [];
  const segmentCount = closed ? contour.points.length : contour.points.length - 1;
  contour.points.slice(0, segmentCount).forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    for (let step = index === 0 ? 0 : 1; step <= 16; step += 1) {
      if (closed && index === segmentCount - 1 && step === 16) continue;
      result.push(cubicPoint(start, end, step / 16));
    }
  });
  return result;
}

function offsetPolyline(points: DesignerPoint[], closed: boolean, distance: number, join: "round" | "miter" | "bevel", miterLimit: number, warnings: Set<string>) {
  if (points.length < 2) return [];
  const orientation = closed && signedArea(points) < 0 ? -1 : 1;
  const segmentCount = closed ? points.length : points.length - 1;
  const normals = Array.from({ length: segmentCount }, (_, index) => {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    return { x: orientation * (end.y - start.y) / length, y: orientation * -(end.x - start.x) / length };
  });
  const result: DesignerPoint[] = [];
  points.forEach((point, index) => {
    if (!closed && index === 0) { result.push(add(point, scale(normals[0], distance))); return; }
    if (!closed && index === points.length - 1) { result.push(add(point, scale(normals[normals.length - 1], distance))); return; }
    const previousNormal = normals[(index - 1 + normals.length) % normals.length];
    const nextNormal = normals[index % normals.length];
    const previousPoint = add(point, scale(previousNormal, distance));
    const nextPoint = add(point, scale(nextNormal, distance));
    const previousStart = add(points[(index - 1 + points.length) % points.length], scale(previousNormal, distance));
    const nextEnd = add(points[(index + 1) % points.length], scale(nextNormal, distance));
    const intersection = lineIntersection(previousStart, previousPoint, nextPoint, nextEnd);
    if (join === "miter" && intersection && distance !== 0 && distanceBetween(point, intersection) <= Math.abs(distance) * miterLimit) {
      result.push(intersection);
    } else if (join === "round") {
      appendRoundJoin(result, point, previousPoint, nextPoint, orientation * Math.sign(distance || 1));
    } else {
      if (join === "miter") warnings.add("Miter limit reached; bevel join used.");
      result.push(previousPoint, nextPoint);
    }
  });
  return dedupeSequentialPoints(result);
}

function appendRoundJoin(result: DesignerPoint[], center: DesignerPoint, start: DesignerPoint, end: DesignerPoint, direction: number) {
  const radius = distanceBetween(center, start);
  if (radius < 1e-7) { result.push(start); return; }
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  let sweep = Math.atan2(end.y - center.y, end.x - center.x) - startAngle;
  if (direction >= 0) while (sweep < 0) sweep += Math.PI * 2;
  else while (sweep > 0) sweep -= Math.PI * 2;
  if (Math.abs(sweep) > Math.PI) sweep -= Math.sign(sweep) * Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + sweep * step / steps;
    result.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
}

function filletPolyline(points: DesignerPoint[], closed: boolean, radius: number, selected: Set<number> | null, nextIndex: () => number, warnings: Set<string>) {
  const result: DesignerPoint[] = [];
  points.forEach((point, index) => {
    const cornerIndex = nextIndex();
    const endpoint = !closed && (index === 0 || index === points.length - 1);
    if (endpoint || selected && !selected.has(cornerIndex)) { result.push(point); return; }
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incomingLength = distanceBetween(previous, point);
    const outgoingLength = distanceBetween(point, next);
    if (incomingLength < 1e-6 || outgoingLength < 1e-6) { result.push(point); return; }
    const incoming = { x: (point.x - previous.x) / incomingLength, y: (point.y - previous.y) / incomingLength };
    const outgoing = { x: (next.x - point.x) / outgoingLength, y: (next.y - point.y) / outgoingLength };
    const turn = Math.acos(clamp(incoming.x * outgoing.x + incoming.y * outgoing.y, -1, 1));
    if (turn < 1e-4 || Math.PI - turn < 1e-4) { result.push(point); return; }
    const requestedTangent = radius * Math.tan(turn / 2);
    const tangent = Math.min(requestedTangent, incomingLength * 0.499, outgoingLength * 0.499);
    if (tangent < requestedTangent - 1e-6) warnings.add(`Fillet ${cornerIndex + 1} was clamped to fit its neighboring legs.`);
    const effectiveRadius = tangent / Math.tan(turn / 2);
    const start = { x: point.x - incoming.x * tangent, y: point.y - incoming.y * tangent };
    const end = { x: point.x + outgoing.x * tangent, y: point.y + outgoing.y * tangent };
    const bisector = normalize({ x: -incoming.x + outgoing.x, y: -incoming.y + outgoing.y });
    const center = add(point, scale(bisector, effectiveRadius / Math.sin((Math.PI - turn) / 2)));
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    appendArc(result, center, start, end, cross >= 0 ? 1 : -1);
  });
  return dedupeSequentialPoints(result);
}

function appendArc(result: DesignerPoint[], center: DesignerPoint, start: DesignerPoint, end: DesignerPoint, direction: number) {
  const radius = distanceBetween(center, start);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  let sweep = Math.atan2(end.y - center.y, end.x - center.x) - startAngle;
  if (direction >= 0) while (sweep < 0) sweep += Math.PI * 2;
  else while (sweep > 0) sweep -= Math.PI * 2;
  if (Math.abs(sweep) > Math.PI) sweep -= Math.sign(sweep) * Math.PI * 2;
  const steps = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + sweep * step / steps;
    result.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
}

function geometryFromContours(id: string, contours: DesignerContour[], closed: boolean): DesignerGeometry {
  const points = contours.flatMap((contour) => contour.points);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { id, kind: "path", x, y, width: Math.max(0.001, Math.max(...xs) - x), height: Math.max(0.001, Math.max(...ys) - y), points: contours[0].points, ...(contours.length > 1 ? { contours } : {}), pathMode: "straight", closed, fillRule: "evenodd" };
}

function cloneGeometry(source: DesignerGeometry, id: string): DesignerGeometry {
  return { ...source, id, points: source.points?.map(clonePoint), contours: source.contours?.map((contour) => ({ ...contour, points: contour.points.map(clonePoint) })) };
}

function clonePoint(point: DesignerPoint) { return { ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined }; }
function add(a: DesignerPoint, b: DesignerPoint) { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(point: DesignerPoint, value: number) { return { x: point.x * value, y: point.y * value }; }
function normalize(point: DesignerPoint) { const length = Math.hypot(point.x, point.y) || 1; return { x: point.x / length, y: point.y / length }; }
function distanceBetween(a: DesignerPoint, b: DesignerPoint) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function signedArea(points: DesignerPoint[]) { return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2; }
function lineIntersection(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint) { const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x); if (Math.abs(denominator) < 1e-9) return null; const determinantA = a.x * b.y - a.y * b.x; const determinantB = c.x * d.y - c.y * d.x; return { x: (determinantA * (c.x - d.x) - (a.x - b.x) * determinantB) / denominator, y: (determinantA * (c.y - d.y) - (a.y - b.y) * determinantB) / denominator }; }
function dedupeSequentialPoints(points: DesignerPoint[]) { return points.filter((point, index) => index === 0 || distanceBetween(points[index - 1], point) > 1e-7); }
function pointInPolygon(point: DesignerPoint, polygon: DesignerPoint[]) { let inside = false; for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) { const current = polygon[index]; const prior = polygon[previous]; if (current.y > point.y !== prior.y > point.y && point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x) inside = !inside; } return inside; }
function polylineSelfIntersects(points: DesignerPoint[], closed: boolean) { const count = closed ? points.length : points.length - 1; for (let first = 0; first < count; first += 1) for (let second = first + 1; second < count; second += 1) { const firstNext = (first + 1) % points.length; const secondNext = (second + 1) % points.length; if (first === second || firstNext === second || secondNext === first || closed && first === 0 && secondNext === 0) continue; if (segmentsCross(points[first], points[firstNext], points[second], points[secondNext])) return true; } return false; }
function segmentsCross(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint) { const orientation = (p: DesignerPoint, q: DesignerPoint, r: DesignerPoint) => Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)); return orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b); }
function cubicPoint(start: DesignerPoint, end: DesignerPoint, t: number) { const a = start.handleOut ? { x: start.x + start.handleOut.x, y: start.y + start.handleOut.y } : start; const b = end.handleIn ? { x: end.x + end.handleIn.x, y: end.y + end.handleIn.y } : end; const inverse = 1 - t; return { x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * a.x + 3 * inverse * t ** 2 * b.x + t ** 3 * end.x, y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * a.y + 3 * inverse * t ** 2 * b.y + t ** 3 * end.y }; }
