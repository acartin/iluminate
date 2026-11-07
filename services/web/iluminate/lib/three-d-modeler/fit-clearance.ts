import type { ModelPath } from "./contracts";

export type FitClearanceDirection = "outward" | "inward";
export type FitClearanceAnalysis = {
  direction: FitClearanceDirection;
  valid: boolean;
  summary: string;
  suggestions: string[];
};

type Point = { x: number; y: number };

export type FitClearancePreview = {
  original: Array<{ xMm: number; yMm: number }>;
  effective: Array<{ xMm: number; yMm: number }>;
};

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y
  };
}

function flatten(path: ModelPath): Point[] {
  if (!path.nodes.length) return [];
  const points: Point[] = [{ x: path.nodes[0].xMm, y: path.nodes[0].yMm }];
  const edgeCount = path.closed ? path.nodes.length : path.nodes.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const node = path.nodes[index];
    const next = path.nodes[(index + 1) % path.nodes.length];
    const start = { x: node.xMm, y: node.yMm };
    const end = { x: next.xMm, y: next.yMm };
    if (node.handleOut || next.handleIn) {
      const out = node.handleOut ?? { xMm: 0, yMm: 0 };
      const incoming = next.handleIn ?? { xMm: 0, yMm: 0 };
      const controlA = { x: node.xMm + out.xMm, y: node.yMm + out.yMm };
      const controlB = { x: next.xMm + incoming.xMm, y: next.yMm + incoming.yMm };
      for (let sample = 1; sample <= 16; sample += 1) points.push(cubic(start, controlA, controlB, end, sample / 16));
    } else points.push(end);
  }
  return points;
}

function lineIntersection(a: Point, aDirection: Point, b: Point, bDirection: Point): Point | null {
  const cross = aDirection.x * bDirection.y - aDirection.y * bDirection.x;
  if (Math.abs(cross) < 1e-9) return null;
  const delta = { x: b.x - a.x, y: b.y - a.y };
  const scale = (delta.x * bDirection.y - delta.y * bDirection.x) / cross;
  return { x: a.x + aDirection.x * scale, y: a.y + aDirection.y * scale };
}

export function fitClearancePreviewPoints(path: ModelPath, clearanceMm: number, direction: FitClearanceDirection): FitClearancePreview | null {
  if (!path.closed || !Number.isFinite(clearanceMm) || clearanceMm <= 0) return null;
  const flattened = flatten(path);
  const points = flattened.length > 1 && Math.hypot(flattened[0].x - flattened.at(-1)!.x, flattened[0].y - flattened.at(-1)!.y) < 1e-7 ? flattened.slice(0, -1) : flattened;
  if (points.length < 3) return null;
  const signedArea = points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  if (Math.abs(signedArea) < 1e-9) return null;
  const outwardSign = signedArea > 0 ? -1 : 1;
  const distance = clearanceMm * outwardSign * (direction === "outward" ? 1 : -1);
  const offsetEdges = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edge = { x: next.x - point.x, y: next.y - point.y };
    const length = Math.hypot(edge.x, edge.y);
    if (length < 1e-9) return null;
    const normal = { x: -edge.y / length, y: edge.x / length };
    return { point: { x: point.x + normal.x * distance, y: point.y + normal.y * distance }, direction: edge };
  });
  if (offsetEdges.some((edge) => !edge)) return null;
  const effective = points.map((point, index) => {
    const previous = offsetEdges[(index + offsetEdges.length - 1) % offsetEdges.length]!;
    const current = offsetEdges[index]!;
    const intersection = lineIntersection(previous.point, previous.direction, current.point, current.direction);
    if (!intersection || Math.hypot(intersection.x - point.x, intersection.y - point.y) > Math.max(clearanceMm * 20, 25)) {
      return { xMm: (previous.point.x + current.point.x) / 2, yMm: (previous.point.y + current.point.y) / 2 };
    }
    return { xMm: intersection.x, yMm: intersection.y };
  });
  return { original: points.map((point) => ({ xMm: point.x, yMm: point.y })), effective };
}

export function analyzeFitClearance(selected: ModelPath, clearanceMm: number, direction: FitClearanceDirection): FitClearanceAnalysis {
  const classification = { direction };
  if (!Number.isFinite(clearanceMm) || clearanceMm < 0 || clearanceMm > 5) return { ...classification, valid: false, summary: "Fit clearance must be between 0 and 5 mm.", suggestions: ["Use a small per-side value and validate the generated solid."] };
  if (clearanceMm === 0) return { ...classification, valid: true, summary: "No fit clearance is applied; the original Path dimensions are used.", suggestions: [] };
  if (!selected.closed) return { ...classification, valid: false, summary: "Fit clearance requires a closed Path so the acrylic region has an inside and an outside.", suggestions: ["Close the Path or use 0 mm for this Sweep."] };
  const points = flatten(selected);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minimumSpan = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (classification.direction === "inward" && clearanceMm * 2 >= minimumSpan) return { ...classification, valid: false, summary: `This interior opening is only ${minimumSpan.toFixed(2)} mm across and may disappear with ${clearanceMm.toFixed(2)} mm per side.`, suggestions: ["Reduce Fit clearance or enlarge the interior opening in the source design."] };
  return {
    ...classification,
    valid: true,
    summary: classification.direction === "outward"
      ? `The selected Path will expand ${clearanceMm.toFixed(2)} mm per side.`
      : `The selected Path will contract ${clearanceMm.toFixed(2)} mm per side.`,
    suggestions: classification.direction === "inward" ? ["The CAD worker will reject the operation if the contour collapses or the offset fragments."] : ["The CAD worker will reject self-intersections or fragmented offset geometry."]
  };
}
