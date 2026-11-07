import type { ProfileNode } from "./contracts";

export type VectorPoint = { xMm: number; yMm: number };

export type RemovedProfileNode = {
  nodes: ProfileNode[];
  connectionNodeIndex: number;
};

export type ProfileHandle = "handleIn" | "handleOut";

type SegmentHit = { segmentIndex: number; t: number; point: VectorPoint; distance: number; curved: boolean };

export type StraightSegment = { segmentIndex: number; lengthMm: number };

export const PROFILE_ANGULAR_SNAP_DEGREES = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330] as const;

export type AngularSnapAnchor = VectorPoint & { nodeIndex: number };
export type AngularSnapResult = {
  point: VectorPoint;
  anchor: AngularSnapAnchor;
  angleDeg: number;
  deviationDeg: number;
  snapped: boolean;
};

const distance = (a: VectorPoint, b: VectorPoint) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
const lerp = (a: VectorPoint, b: VectorPoint, t: number): VectorPoint => ({ xMm: a.xMm + (b.xMm - a.xMm) * t, yMm: a.yMm + (b.yMm - a.yMm) * t });
const vector = (from: VectorPoint, to: VectorPoint): VectorPoint => ({ xMm: to.xMm - from.xMm, yMm: to.yMm - from.yMm });
const nonZero = (value: VectorPoint) => Math.abs(value.xMm) > 1e-9 || Math.abs(value.yMm) > 1e-9;

function circularAngleDistance(a: number, b: number) {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

export function findProfileAngularSnap(point: VectorPoint, anchors: AngularSnapAnchor[], toleranceDeg = 4): AngularSnapResult | null {
  let best: AngularSnapResult | null = null;
  for (const anchor of anchors) {
    const dx = point.xMm - anchor.xMm;
    const dy = point.yMm - anchor.yMm;
    const lengthMm = Math.hypot(dx, dy);
    if (lengthMm <= 1e-9) continue;
    const rawAngleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    for (const angleDeg of PROFILE_ANGULAR_SNAP_DEGREES) {
      const deviationDeg = circularAngleDistance(rawAngleDeg, angleDeg);
      if (best && deviationDeg >= best.deviationDeg) continue;
      const snapped = deviationDeg <= toleranceDeg;
      const radians = angleDeg * Math.PI / 180;
      best = {
        point: snapped
          ? { xMm: anchor.xMm + Math.cos(radians) * lengthMm, yMm: anchor.yMm + Math.sin(radians) * lengthMm }
          : point,
        anchor,
        angleDeg,
        deviationDeg,
        snapped
      };
    }
  }
  return best;
}

export function profileSegmentSnapAngle(start: VectorPoint, end: VectorPoint, toleranceDeg = .1): number | null {
  const result = findProfileAngularSnap(end, [{ ...start, nodeIndex: 0 }], toleranceDeg);
  return result?.snapped ? result.angleDeg : null;
}

function controls(start: ProfileNode, end: ProfileNode) {
  return {
    p0: start,
    p1: start.handleOut ? { xMm: start.xMm + start.handleOut.xMm, yMm: start.yMm + start.handleOut.yMm } : start,
    p2: end.handleIn ? { xMm: end.xMm + end.handleIn.xMm, yMm: end.yMm + end.handleIn.yMm } : end,
    p3: end,
    curved: Boolean(start.handleOut || end.handleIn)
  };
}

function cubicPoint(start: ProfileNode, end: ProfileNode, t: number) {
  const { p0, p1, p2, p3 } = controls(start, end);
  const a = lerp(p0, p1, t); const b = lerp(p1, p2, t); const c = lerp(p2, p3, t);
  return lerp(lerp(a, b, t), lerp(b, c, t), t);
}

function nearestOnLine(start: VectorPoint, end: VectorPoint, point: VectorPoint) {
  const dx = end.xMm - start.xMm; const dy = end.yMm - start.yMm;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.xMm - start.xMm) * dx + (point.yMm - start.yMm) * dy) / lengthSquared)) : 0;
  const nearest = lerp(start, end, t);
  return { t, point: nearest, distance: distance(nearest, point) };
}

function nearestOnSegment(start: ProfileNode, end: ProfileNode, point: VectorPoint): Omit<SegmentHit, "segmentIndex"> {
  const curved = Boolean(start.handleOut || end.handleIn);
  if (!curved) return { ...nearestOnLine(start, end, point), curved: false };
  let best = { t: 0, point: cubicPoint(start, end, 0), distance: Number.POSITIVE_INFINITY };
  const samples = 48;
  let previous = cubicPoint(start, end, 0);
  for (let index = 1; index <= samples; index += 1) {
    const current = cubicPoint(start, end, index / samples);
    const chord = nearestOnLine(previous, current, point);
    const t = (index - 1 + chord.t) / samples;
    const candidate = cubicPoint(start, end, t);
    const candidateDistance = distance(candidate, point);
    if (candidateDistance < best.distance) best = { t, point: candidate, distance: candidateDistance };
    previous = current;
  }
  return { ...best, curved: true };
}

export function findNearestStraightSegment(nodes: ProfileNode[], closed: boolean, point: VectorPoint, toleranceMm: number): StraightSegment | null {
  if (nodes.length < 2 || toleranceMm <= 0) return null;
  const segmentCount = closed ? nodes.length : nodes.length - 1;
  let best: SegmentHit | null = null;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = nodes[segmentIndex];
    const end = nodes[(segmentIndex + 1) % nodes.length];
    if (start.handleOut || end.handleIn) continue;
    const candidate = nearestOnSegment(start, end, point);
    if (!best || candidate.distance < best.distance) best = { segmentIndex, ...candidate };
  }
  if (!best || best.distance > toleranceMm) return null;
  const start = nodes[best.segmentIndex];
  const end = nodes[(best.segmentIndex + 1) % nodes.length];
  const lengthMm = distance(start, end);
  return lengthMm > 1e-9 ? { segmentIndex: best.segmentIndex, lengthMm } : null;
}

export function resizeStraightSegment(nodes: ProfileNode[], closed: boolean, segmentIndex: number, lengthMm: number, fixedEnd: "start" | "end" = "start"): ProfileNode[] | null {
  const segmentCount = closed ? nodes.length : nodes.length - 1;
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segmentCount || !Number.isFinite(lengthMm) || lengthMm <= 0) return null;
  const start = nodes[segmentIndex];
  const endIndex = (segmentIndex + 1) % nodes.length;
  const end = nodes[endIndex];
  if (start.handleOut || end.handleIn) return null;
  const currentLength = distance(start, end);
  if (currentLength <= 1e-9) return null;
  const scale = lengthMm / currentLength;
  const nextNodes = structuredClone(nodes);
  if (fixedEnd === "start") {
    nextNodes[endIndex].xMm = start.xMm + (end.xMm - start.xMm) * scale;
    nextNodes[endIndex].yMm = start.yMm + (end.yMm - start.yMm) * scale;
  } else {
    nextNodes[segmentIndex].xMm = end.xMm - (end.xMm - start.xMm) * scale;
    nextNodes[segmentIndex].yMm = end.yMm - (end.yMm - start.yMm) * scale;
  }
  return nextNodes;
}

export function insertNodeOnNearestSegment(nodes: ProfileNode[], closed: boolean, point: VectorPoint, toleranceMm: number) {
  if (nodes.length < 2 || toleranceMm <= 0 || nodes.some((node) => distance(node, point) <= toleranceMm)) return null;
  const segmentCount = closed ? nodes.length : nodes.length - 1;
  let best: SegmentHit | null = null;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const candidate = nearestOnSegment(nodes[segmentIndex], nodes[(segmentIndex + 1) % nodes.length], point);
    if (!best || candidate.distance < best.distance) best = { segmentIndex, ...candidate };
  }
  if (!best || best.distance > toleranceMm || best.t <= 1e-4 || best.t >= 1 - 1e-4) return null;

  const nextNodes = structuredClone(nodes);
  const startIndex = best.segmentIndex;
  const endIndex = (startIndex + 1) % nextNodes.length;
  const insertIndex = startIndex + 1;
  const start = nextNodes[startIndex]; const end = nextNodes[endIndex];
  let inserted: ProfileNode;
  if (!best.curved) inserted = { ...best.point, nodeType: "corner" };
  else {
    const { p0, p1, p2, p3 } = controls(start, end);
    const a = lerp(p0, p1, best.t); const b = lerp(p1, p2, best.t); const c = lerp(p2, p3, best.t);
    const d = lerp(a, b, best.t); const e = lerp(b, c, best.t); const split = lerp(d, e, best.t);
    const startOut = vector(p0, a); const endIn = vector(p3, c);
    if (nonZero(startOut)) { start.handleOut = startOut; start.nodeType = "smooth"; } else delete start.handleOut;
    if (nonZero(endIn)) { end.handleIn = endIn; end.nodeType = "smooth"; } else delete end.handleIn;
    inserted = { ...split, nodeType: "smooth", handleIn: vector(split, d), handleOut: vector(split, e) };
  }
  nextNodes.splice(insertIndex, 0, inserted);
  return { nodes: nextNodes, index: insertIndex };
}

export function removeProfileNode(nodes: ProfileNode[], nodeIndex: number, connectionNodeIndex: number): RemovedProfileNode | null {
  if (nodes.length <= 3 || !Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) return null;
  const nextNodes = structuredClone(nodes);
  nextNodes.splice(nodeIndex, 1);
  return {
    nodes: nextNodes,
    connectionNodeIndex: connectionNodeIndex === nodeIndex
      ? Math.max(0, nodeIndex - 1)
      : connectionNodeIndex > nodeIndex
        ? connectionNodeIndex - 1
        : connectionNodeIndex
  };
}

function tangentForNode(nodes: ProfileNode[], nodeIndex: number) {
  const previous = nodes[(nodeIndex - 1 + nodes.length) % nodes.length];
  const next = nodes[(nodeIndex + 1) % nodes.length];
  return { xMm: (next.xMm - previous.xMm) * 0.22, yMm: (next.yMm - previous.yMm) * 0.22 };
}

export function prepareClosedProfileNodes(nodes: ProfileNode[]) {
  return nodes.map((node, nodeIndex) => {
    if (node.nodeType === "corner" || node.nodeType === "straight") {
      const { handleIn: _handleIn, handleOut: _handleOut, ...corner } = node;
      return corner;
    }
    const tangent = tangentForNode(nodes, nodeIndex);
    return { ...node, handleIn: { xMm: -tangent.xMm, yMm: -tangent.yMm }, handleOut: tangent };
  });
}

export function changeProfileNodeType(nodes: ProfileNode[], nodeIndex: number, nodeType: ProfileNode["nodeType"]) {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) return nodes;
  const nextNodes = structuredClone(nodes);
  const node = nextNodes[nodeIndex];
  node.nodeType = nodeType;
  if (nodeType === "corner" || nodeType === "straight") {
    delete node.handleIn;
    delete node.handleOut;
  } else {
    const tangent = tangentForNode(nextNodes, nodeIndex);
    node.handleIn = { xMm: -tangent.xMm, yMm: -tangent.yMm };
    node.handleOut = tangent;
  }
  return nextNodes;
}

export function updateProfileNodeHandle(nodes: ProfileNode[], nodeIndex: number, handle: ProfileHandle, relative: VectorPoint) {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodes.length) return nodes;
  const nextNodes = structuredClone(nodes);
  const node = nextNodes[nodeIndex];
  const opposite: ProfileHandle = handle === "handleIn" ? "handleOut" : "handleIn";
  const relativeLength = Math.hypot(relative.xMm, relative.yMm);
  const currentOpposite = node[opposite];
  const oppositeLength = node.nodeType === "smooth" && currentOpposite
    ? Math.hypot(currentOpposite.xMm, currentOpposite.yMm)
    : relativeLength;
  const oppositeVector = relativeLength > 1e-4
    ? { xMm: (-relative.xMm / relativeLength) * oppositeLength, yMm: (-relative.yMm / relativeLength) * oppositeLength }
    : { xMm: 0, yMm: 0 };
  node.nodeType = node.nodeType === "smooth" ? "smooth" : "symmetric";
  node[handle] = relative;
  node[opposite] = oppositeVector;
  return nextNodes;
}
