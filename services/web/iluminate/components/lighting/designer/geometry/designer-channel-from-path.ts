import type { DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";

export type ChannelPathAlignment = "left" | "center" | "right";
export type ChannelPathDraft = {
  points: DesignerPoint[];
  pathMode: "straight" | "bezier";
  closed: boolean;
};

export type ChannelPathResult =
  | { paths: ChannelPathDraft[]; issue: null }
  | { paths: []; issue: "empty" | "branch" };

/** Builds one editable Channel trajectory per non-branching connected chain. */
export function channelPathsFromGeometries(
  geometries: DesignerGeometry[],
  alignment: ChannelPathAlignment,
  widthMm: number,
  endpointToleranceCm = 0.02
): ChannelPathResult {
  const inputs = geometries.flatMap(geometryPaths).filter((path) => path.points.length >= 2);
  if (!inputs.length) return { paths: [], issue: "empty" };
  const closed = inputs.filter((path) => path.closed);
  const open = inputs.filter((path) => !path.closed);
  const chained = chainOpenPaths(open, endpointToleranceCm);
  if (chained.issue) return chained;
  const distanceCm = alignment === "center" ? 0 : widthMm / 20 * (alignment === "left" ? 1 : -1);
  return {
    paths: [...closed, ...chained.paths].map((path) => offsetEditablePath(path, distanceCm)),
    issue: null
  };
}

function geometryPaths(geometry: DesignerGeometry): ChannelPathDraft[] {
  if (geometry.kind === "rect") return [{
    points: [
      { x: geometry.x, y: geometry.y, nodeType: "corner" },
      { x: geometry.x + geometry.width, y: geometry.y, nodeType: "corner" },
      { x: geometry.x + geometry.width, y: geometry.y + geometry.height, nodeType: "corner" },
      { x: geometry.x, y: geometry.y + geometry.height, nodeType: "corner" }
    ],
    pathMode: "straight",
    closed: true
  }];
  if (geometry.kind === "ellipse") {
    const cx = geometry.x + geometry.width / 2;
    const cy = geometry.y + geometry.height / 2;
    const rx = geometry.width / 2;
    const ry = geometry.height / 2;
    const k = 0.5522847498307936;
    return [{
      points: [
        { x: cx + rx, y: cy, handleIn: { x: 0, y: -ry * k }, handleOut: { x: 0, y: ry * k }, nodeType: "smooth" },
        { x: cx, y: cy + ry, handleIn: { x: rx * k, y: 0 }, handleOut: { x: -rx * k, y: 0 }, nodeType: "smooth" },
        { x: cx - rx, y: cy, handleIn: { x: 0, y: ry * k }, handleOut: { x: 0, y: -ry * k }, nodeType: "smooth" },
        { x: cx, y: cy - ry, handleIn: { x: -rx * k, y: 0 }, handleOut: { x: rx * k, y: 0 }, nodeType: "smooth" }
      ],
      pathMode: "bezier",
      closed: true
    }];
  }
  const contours = geometry.contours?.length
    ? geometry.contours.map((contour) => ({ points: contour.points, pathMode: contour.pathMode, closed: true }))
    : geometry.points?.length
      ? [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: geometry.closed !== false }]
      : [];
  return contours.map((path) => ({ ...path, points: path.points.map(clonePoint) }));
}

function chainOpenPaths(paths: ChannelPathDraft[], tolerance: number): ChannelPathResult {
  if (!paths.length) return { paths: [], issue: null };
  const endpointGroups: Array<{ point: DesignerPoint; ends: Array<{ pathIndex: number; atStart: boolean }> }> = [];
  paths.forEach((path, pathIndex) => {
    [[path.points[0], true], [path.points[path.points.length - 1], false]].forEach(([point, atStart]) => {
      const typedPoint = point as DesignerPoint;
      let group = endpointGroups.find((candidate) => distance(candidate.point, typedPoint) <= tolerance);
      if (!group) {
        group = { point: typedPoint, ends: [] };
        endpointGroups.push(group);
      }
      group.ends.push({ pathIndex, atStart: Boolean(atStart) });
    });
  });
  if (endpointGroups.some((group) => group.ends.length > 2)) return { paths: [], issue: "branch" };

  const unused = new Set(paths.map((_, index) => index));
  const results: ChannelPathDraft[] = [];
  while (unused.size) {
    const component = connectedPathIndices(unused.values().next().value!, endpointGroups);
    const startGroup = endpointGroups.find((group) => group.ends.length === 1 && component.has(group.ends[0].pathIndex));
    const first = startGroup?.ends[0] ?? endpointGroups.find((group) => group.ends.some((end) => component.has(end.pathIndex)))!.ends[0];
    let currentIndex = first.pathIndex;
    let currentAtStart = first.atStart;
    let resultPoints: DesignerPoint[] = [];
    let closed = false;
    while (unused.has(currentIndex)) {
      unused.delete(currentIndex);
      const oriented = currentAtStart ? paths[currentIndex] : reversePath(paths[currentIndex]);
      resultPoints = appendPath(resultPoints, oriented.points);
      const end = oriented.points[oriented.points.length - 1];
      const nextGroup = endpointGroups.find((group) => distance(group.point, end) <= tolerance);
      const next = nextGroup?.ends.find((candidate) => unused.has(candidate.pathIndex));
      if (!next) {
        closed = Boolean(nextGroup && nextGroup.ends.length === 2 && distance(resultPoints[0], end) <= tolerance);
        break;
      }
      currentIndex = next.pathIndex;
      currentAtStart = next.atStart;
    }
    if (closed && distance(resultPoints[0], resultPoints[resultPoints.length - 1]) <= tolerance) resultPoints.pop();
    results.push({ points: resultPoints, pathMode: hasBezier(resultPoints) ? "bezier" : "straight", closed });
  }
  return { paths: results, issue: null };
}

function connectedPathIndices(start: number, groups: Array<{ ends: Array<{ pathIndex: number }> }>) {
  const found = new Set([start]);
  let changed = true;
  while (changed) {
    changed = false;
    groups.forEach((group) => {
      if (!group.ends.some((end) => found.has(end.pathIndex))) return;
      group.ends.forEach((end) => {
        if (!found.has(end.pathIndex)) { found.add(end.pathIndex); changed = true; }
      });
    });
  }
  return found;
}

function appendPath(current: DesignerPoint[], next: DesignerPoint[]) {
  if (!current.length) return next.map(clonePoint);
  const merged = current.map(clonePoint);
  const join = merged[merged.length - 1];
  const incoming = next[0];
  merged[merged.length - 1] = {
    ...join,
    ...(incoming.handleOut ? { handleOut: { ...incoming.handleOut } } : {}),
    nodeType: join.nodeType === "smooth" && incoming.nodeType === "smooth" ? "smooth" : "corner"
  };
  merged.push(...next.slice(1).map(clonePoint));
  return merged;
}

function reversePath(path: ChannelPathDraft): ChannelPathDraft {
  return {
    ...path,
    points: [...path.points].reverse().map((point) => ({
      ...point,
      handleIn: point.handleOut ? { ...point.handleOut } : undefined,
      handleOut: point.handleIn ? { ...point.handleIn } : undefined
    }))
  };
}

function offsetEditablePath(path: ChannelPathDraft, distanceCm: number): ChannelPathDraft {
  if (Math.abs(distanceCm) < 1e-8) return { ...path, points: path.points.map(clonePoint) };
  const count = path.points.length;
  const points = path.points.map((point, index) => {
    const previous = path.points[index > 0 ? index - 1 : path.closed ? count - 1 : 0];
    const next = path.points[index < count - 1 ? index + 1 : path.closed ? 0 : count - 1];
    const incoming = normalize(point.handleIn ? scale(point.handleIn, -1) : subtract(point, previous));
    const outgoing = normalize(point.handleOut ?? subtract(next, point));
    const normalA = { x: -incoming.y, y: incoming.x };
    const normalB = { x: -outgoing.y, y: outgoing.x };
    const bisector = normalize({ x: normalA.x + normalB.x, y: normalA.y + normalB.y });
    const denominator = Math.max(0.25, Math.abs(bisector.x * normalB.x + bisector.y * normalB.y));
    const shift = scale(bisector.x || bisector.y ? bisector : normalB, distanceCm / denominator);
    return { ...clonePoint(point), x: point.x + shift.x, y: point.y + shift.y };
  });
  return { ...path, points, pathMode: hasBezier(points) ? "bezier" : path.pathMode };
}

function clonePoint(point: DesignerPoint): DesignerPoint {
  return { ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined };
}
function hasBezier(points: DesignerPoint[]) { return points.some((point) => point.handleIn || point.handleOut); }
function distance(a: DesignerPoint, b: DesignerPoint) { return Math.hypot(a.x - b.x, a.y - b.y); }
function subtract(a: DesignerPoint, b: DesignerPoint) { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(a: { x: number; y: number }, value: number) { return { x: a.x * value, y: a.y * value }; }
function normalize(a: { x: number; y: number }) {
  const length = Math.hypot(a.x, a.y);
  return length > 1e-9 ? { x: a.x / length, y: a.y / length } : { x: 0, y: 0 };
}
