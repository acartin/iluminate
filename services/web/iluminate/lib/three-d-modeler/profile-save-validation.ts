import paper from "paper";
import type { ProfileContour, ProfileNode, ThreeDModelDocument } from "./contracts";

export type ProfileSaveIssue = {
  contourId: string;
  contourName: string;
  code: "duplicate-node" | "self-intersection" | "zero-area";
  message: string;
  repairable: boolean;
};

export type ProfileSaveValidation = {
  issues: ProfileSaveIssue[];
  repairedDocument: ThreeDModelDocument;
  canAutoCorrect: boolean;
};

const geometryScope = new paper.PaperScope();
geometryScope.setup(new geometryScope.Size(1, 1));
const COORDINATE_EPSILON_MM = 1e-6;
const AREA_EPSILON_MM2 = 1e-6;

export function validateProfilesBeforeSave(document: ThreeDModelDocument): ProfileSaveValidation {
  const repairedDocument = structuredClone(document);
  const issues: ProfileSaveIssue[] = [];

  repairedDocument.profile.contours = repairedDocument.profile.contours.map((contour) => {
    const deduplicated = removeConsecutiveDuplicateNodes(contour.nodes);
    if (deduplicated.length !== contour.nodes.length) {
      issues.push({
        contourId: contour.id,
        contourName: contour.name,
        code: "duplicate-node",
        message: `${contour.name} contains consecutive duplicate nodes.`,
        repairable: deduplicated.length >= 3
      });
    }

    if (deduplicated.length < 3) {
      issues.push({
        contourId: contour.id,
        contourName: contour.name,
        code: "zero-area",
        message: `${contour.name} does not contain enough distinct nodes to form a face.`,
        repairable: false
      });
      return contour;
    }

    const source = contourToPaperPath(deduplicated);
    try {
      const crossings = uniqueCrossings(source.getCrossings(source));
      if (!crossings.length) {
        if (Math.abs(source.area) <= AREA_EPSILON_MM2) {
          issues.push({
            contourId: contour.id,
            contourName: contour.name,
            code: "zero-area",
            message: `${contour.name} does not enclose a usable area.`,
            repairable: false
          });
          return contour;
        }
        return deduplicated.length === contour.nodes.length ? contour : correctedContour(contour, deduplicated);
      }

      const resolved = (source as unknown as { resolveCrossings(): paper.Path | paper.CompoundPath }).resolveCrossings();
      try {
        const candidates = collectPaths(resolved)
          .filter((path) => path.closed && path.segments.length >= 3 && Math.abs(path.area) > AREA_EPSILON_MM2)
          .sort((left, right) => Math.abs(right.area) - Math.abs(left.area));
        const primary = candidates[0];
        const repairable = Boolean(primary);
        issues.push({
          contourId: contour.id,
          contourName: contour.name,
          code: "self-intersection",
          message: `${contour.name} contains ${crossings.length} self-intersection${crossings.length === 1 ? "" : "s"}. Automatic correction keeps the largest even-odd face and removes crossing loops.`,
          repairable
        });
        if (!primary) return contour;
        return correctedContour(contour, paperPathNodes(primary));
      } finally {
        resolved.remove();
      }
    } finally {
      source.remove();
    }
  });

  return {
    issues,
    repairedDocument,
    canAutoCorrect: issues.length > 0 && issues.every((issue) => issue.repairable)
  };
}

function contourToPaperPath(nodes: ProfileNode[]) {
  const path = new geometryScope.Path({ insert: false, closed: true });
  nodes.forEach((node) => path.add(new geometryScope.Segment(
    new geometryScope.Point(node.xMm, node.yMm),
    new geometryScope.Point(node.handleIn?.xMm ?? 0, node.handleIn?.yMm ?? 0),
    new geometryScope.Point(node.handleOut?.xMm ?? 0, node.handleOut?.yMm ?? 0)
  )));
  return path;
}

function collectPaths(item: paper.Path | paper.CompoundPath): paper.Path[] {
  if (item.className === "Path") return [item as paper.Path];
  return Array.from(item.children).flatMap((child) => collectPaths(child as paper.Path | paper.CompoundPath));
}

function paperPathNodes(path: paper.Path): ProfileNode[] {
  return path.segments.map((segment) => {
    const hasHandleIn = segment.handleIn.length > COORDINATE_EPSILON_MM;
    const hasHandleOut = segment.handleOut.length > COORDINATE_EPSILON_MM;
    return {
      xMm: roundGeometry(segment.point.x),
      yMm: roundGeometry(segment.point.y),
      nodeType: hasHandleIn || hasHandleOut ? "smooth" : "corner",
      ...(hasHandleIn ? { handleIn: { xMm: roundGeometry(segment.handleIn.x), yMm: roundGeometry(segment.handleIn.y) } } : {}),
      ...(hasHandleOut ? { handleOut: { xMm: roundGeometry(segment.handleOut.x), yMm: roundGeometry(segment.handleOut.y) } } : {})
    } satisfies ProfileNode;
  });
}

function correctedContour(contour: ProfileContour, nodes: ProfileNode[]): ProfileContour {
  const connection = contour.nodes[contour.connectionNodeIndex] ?? contour.nodes[0];
  const connectionNodeIndex = nodes.reduce((nearest, node, index) => (
    distance(node, connection) < distance(nodes[nearest], connection) ? index : nearest
  ), 0);
  return { ...contour, nodes, connectionNodeIndex, parameters: [] };
}

function removeConsecutiveDuplicateNodes(nodes: ProfileNode[]) {
  const result = nodes.filter((node, index) => index === 0 || distance(node, nodes[index - 1]) > COORDINATE_EPSILON_MM);
  if (result.length > 1 && distance(result[0], result[result.length - 1]) <= COORDINATE_EPSILON_MM) result.pop();
  return result;
}

function uniqueCrossings(crossings: Array<{ point: { x: number; y: number } }>) {
  const unique: Array<{ x: number; y: number }> = [];
  crossings.forEach(({ point }) => {
    if (!unique.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= COORDINATE_EPSILON_MM)) {
      unique.push({ x: point.x, y: point.y });
    }
  });
  return unique;
}

function distance(left: Pick<ProfileNode, "xMm" | "yMm">, right: Pick<ProfileNode, "xMm" | "yMm">) {
  return Math.hypot(left.xMm - right.xMm, left.yMm - right.yMm);
}

function roundGeometry(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
