import type { ModelPath, ProfileContour } from "./contracts";

export type SweepRiskCandidate = {
  nodeIndex: number;
  xMm: number;
  yMm: number;
  adjacentSegmentMm: number;
  turnDeg: number;
  riskRatio: number;
  reason: string;
};

export type SweepRiskDiagnostic = {
  title: string;
  summary: string;
  candidates: SweepRiskCandidate[];
  suggestions: string[];
  lateralReachMm: number;
  shortestSegmentMm: number;
};

type Point = { xMm: number; yMm: number };

const distance = (a: Point, b: Point) => Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
const cubicPoint = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const inverse = 1 - t;
  return {
    xMm: inverse ** 3 * a.xMm + 3 * inverse ** 2 * t * b.xMm + 3 * inverse * t ** 2 * c.xMm + t ** 3 * d.xMm,
    yMm: inverse ** 3 * a.yMm + 3 * inverse ** 2 * t * b.yMm + 3 * inverse * t ** 2 * c.yMm + t ** 3 * d.yMm
  };
};

function segmentLength(path: ModelPath, index: number) {
  const start = path.nodes[index];
  const end = path.nodes[(index + 1) % path.nodes.length];
  if (!start.handleOut && !end.handleIn) return distance(start, end);
  const controlA = start.handleOut ? { xMm: start.xMm + start.handleOut.xMm, yMm: start.yMm + start.handleOut.yMm } : start;
  const controlB = end.handleIn ? { xMm: end.xMm + end.handleIn.xMm, yMm: end.yMm + end.handleIn.yMm } : end;
  let length = 0;
  let previous: Point = start;
  for (let sample = 1; sample <= 24; sample += 1) {
    const current = cubicPoint(start, controlA, controlB, end, sample / 24);
    length += distance(previous, current);
    previous = current;
  }
  return length;
}

function turnDegrees(path: ModelPath, index: number) {
  const node = path.nodes[index];
  const previous = path.nodes[(index - 1 + path.nodes.length) % path.nodes.length];
  const next = path.nodes[(index + 1) % path.nodes.length];
  const incoming = node.handleIn
    ? { xMm: -node.handleIn.xMm, yMm: -node.handleIn.yMm }
    : { xMm: node.xMm - previous.xMm, yMm: node.yMm - previous.yMm };
  const outgoing = node.handleOut
    ? node.handleOut
    : { xMm: next.xMm - node.xMm, yMm: next.yMm - node.yMm };
  const incomingLength = Math.hypot(incoming.xMm, incoming.yMm);
  const outgoingLength = Math.hypot(outgoing.xMm, outgoing.yMm);
  if (incomingLength < 1e-9 || outgoingLength < 1e-9) return 180;
  const cosine = Math.max(-1, Math.min(1, (incoming.xMm * outgoing.xMm + incoming.yMm * outgoing.yMm) / (incomingLength * outgoingLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function profileLateralReach(profile: ProfileContour) {
  const connection = profile.nodes[profile.connectionNodeIndex] ?? profile.nodes[0];
  return Math.max(.01, ...profile.nodes.flatMap((node) => {
    const values = [Math.abs(node.xMm - connection.xMm)];
    if (node.handleIn) values.push(Math.abs(node.xMm + node.handleIn.xMm - connection.xMm));
    if (node.handleOut) values.push(Math.abs(node.xMm + node.handleOut.xMm - connection.xMm));
    return values;
  }));
}

export function diagnoseSweepRisk(path: ModelPath, profile: ProfileContour, cornerPolicy: "round" | "miter" = "round"): SweepRiskDiagnostic | null {
  if (path.nodes.length < 3) return null;
  const edgeCount = path.closed ? path.nodes.length : path.nodes.length - 1;
  const lengths = Array.from({ length: edgeCount }, (_, index) => segmentLength(path, index));
  const shortestSegmentMm = Math.min(...lengths);
  const lateralReachMm = profileLateralReach(profile);
  const candidates: SweepRiskCandidate[] = [];
  const firstNode = path.closed ? 0 : 1;
  const lastNode = path.closed ? path.nodes.length - 1 : path.nodes.length - 2;
  for (let nodeIndex = firstNode; nodeIndex <= lastNode; nodeIndex += 1) {
    const previousSegment = lengths[(nodeIndex - 1 + edgeCount) % edgeCount];
    const nextSegment = lengths[nodeIndex % edgeCount];
    const adjacentSegmentMm = Math.min(previousSegment, nextSegment);
    const turnDeg = turnDegrees(path, nodeIndex);
    const availableMm = Math.max(.001, adjacentSegmentMm / 2);
    const requiredMm = lateralReachMm * Math.tan(Math.min(80, turnDeg / 2) * Math.PI / 180);
    const clearanceRatio = requiredMm / availableMm;
    const densityRatio = lateralReachMm / Math.max(.001, adjacentSegmentMm);
    const riskRatio = Math.max(clearanceRatio, densityRatio);
    if (riskRatio < .75 && !(path.closed && path.nodes.length > 64 && adjacentSegmentMm < lateralReachMm * 2)) continue;
    const reason = adjacentSegmentMm < lateralReachMm
      ? `The adjacent segment is ${adjacentSegmentMm.toFixed(2)} mm, shorter than the profile's ${lateralReachMm.toFixed(2)} mm lateral reach.`
      : requiredMm > availableMm
        ? `The ${turnDeg.toFixed(1)}° turn needs about ${requiredMm.toFixed(2)} mm of clearance; only ${availableMm.toFixed(2)} mm is locally available.`
        : `This dense corner is a likely ${cornerPolicy === "round" ? "Round-transition" : "profile-overlap"} conflict for a ${lateralReachMm.toFixed(2)} mm lateral profile reach.`;
    const node = path.nodes[nodeIndex];
    candidates.push({ nodeIndex, xMm: node.xMm, yMm: node.yMm, adjacentSegmentMm, turnDeg, riskRatio, reason });
  }
  candidates.sort((left, right) => right.riskRatio - left.riskRatio || left.nodeIndex - right.nodeIndex);
  const selected = candidates.slice(0, 6);
  if (!selected.length) return null;
  const density = path.nodes.length > 64 ? ` The closed path is dense (${path.nodes.length} nodes).` : "";
  return {
    title: cornerPolicy === "round" ? "Likely Round-transition conflict" : "Likely profile-overlap conflict",
    summary: `${selected.length} high-risk area${selected.length === 1 ? "" : "s"} found. The shortest segment is ${shortestSegmentMm.toFixed(2)} mm while the profile reaches ${lateralReachMm.toFixed(2)} mm laterally.${density}`,
    candidates: selected,
    suggestions: cornerPolicy === "round"
      ? [
          "Try Miter for this Sweep.",
          "Simplify nearly aligned nodes or replace faceted arcs with Bezier curves.",
          "Increase local corner radius or segment length, or reduce the profile's lateral reach."
        ]
      : [
          "Flip the Profile side to compare the available material envelope.",
          "Simplify nearly aligned nodes or replace faceted arcs with Bezier curves.",
          "Open tight concave transitions or reduce the profile's lateral reach."
        ],
    lateralReachMm,
    shortestSegmentMm
  };
}

export function diagnoseRoundSweepRisk(path: ModelPath, profile: ProfileContour) {
  return diagnoseSweepRisk(path, profile, "round");
}
