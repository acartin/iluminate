import type { DesignerContour, DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";
import type { PaperApi } from "../types";

export type DesignerPathTrimPreview = {
  geometry: DesignerGeometry;
  removed: DesignerContour;
  intersections: DesignerPoint[];
};

type PaperPath = InstanceType<PaperApi["Path"]>;
type PaperCompoundPath = InstanceType<PaperApi["CompoundPath"]>;

/**
 * Resolves a self-crossing path into exact non-crossing contours, then selects
 * the smallest contour under the pointer. The resulting compound geometry can
 * be trimmed again, allowing independent crossing faces to be removed in
 * successive passes without flattening Bezier curves.
 */
export function trimDesignerPathAtPoint(
  paper: PaperApi,
  geometry: DesignerGeometry,
  point: DesignerPoint,
  maxDistance = Number.POSITIVE_INFINITY
): DesignerPathTrimPreview | null {
  if (geometry.kind !== "path" || geometry.closed === false || !geometry.points?.length) return null;
  const pointer = new paper.Point(point.x, point.y);
  const sourceContours: DesignerContour[] = geometry.contours?.length
    ? geometry.contours
    : [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: true as const }];
  let root: PaperPath | PaperCompoundPath | null = null;
  let paths: PaperPath[] = [];
  let intersections: DesignerPoint[] = [];

  if (sourceContours.length > 1) {
    paths = sourceContours.map((contour) => contourToPaperPath(paper, contour));
  } else {
    const source = contourToPaperPath(paper, sourceContours[0]);
    const crossingLocations = source.getCrossings(source);
    intersections = uniquePoints(crossingLocations.map((location) => ({
      x: round(location.point.x),
      y: round(location.point.y)
    })));
    if (!crossingLocations.length) {
      source.remove();
      return null;
    }
    root = (source as unknown as { resolveCrossings(): PaperPath | PaperCompoundPath }).resolveCrossings();
    if (root instanceof paper.CompoundPath) paths = [...root.children] as PaperPath[];
    else paths = [root as PaperPath];
  }

  try {
    if (paths.length < 2) return null;
    const primaryIndex = largestContourIndex(paths);
    const primaryContainsAll = paths.every((path, index) => index === primaryIndex || paths[primaryIndex].contains(path.bounds.center));
    let selectedIndex = -1;
    let selectedScore: [number, number, number] | null = null;

    paths.forEach((path, index) => {
      if (primaryContainsAll && index === primaryIndex) return;
      const containsPointer = path.contains(pointer);
      const strokeDistance = path.getNearestPoint(pointer).getDistance(pointer);
      if (!containsPointer && strokeDistance > maxDistance) return;
      const area = Math.abs(path.area);
      const score: [number, number, number] = [
        containsPointer ? 0 : 1,
        containsPointer ? area : strokeDistance,
        path.length
      ];
      if (!selectedScore || compareScore(score, selectedScore) < 0) {
        selectedIndex = index;
        selectedScore = score;
      }
    });
    if (selectedIndex < 0) return null;

    const removed = paperPathToContour(paths[selectedIndex]);
    const keptPaths = paths.filter((_, index) => index !== selectedIndex);
    const nextPrimaryIndex = largestContourIndex(keptPaths);
    const orderedPaths = [keptPaths[nextPrimaryIndex], ...keptPaths.filter((_, index) => index !== nextPrimaryIndex)];
    const contours = orderedPaths.map(paperPathToContour);
    const bounds = unionBounds(keptPaths);
    return {
      geometry: {
        id: geometry.id,
        kind: "path",
        x: round(bounds.x),
        y: round(bounds.y),
        width: Math.max(0.001, round(bounds.width)),
        height: Math.max(0.001, round(bounds.height)),
        points: contours[0].points,
        ...(contours.length > 1 ? { contours } : {}),
        pathMode: contours.some((contour) => contour.pathMode === "bezier") ? "bezier" : "straight",
        closed: true,
        fillRule: contours.length > 1 ? "nonzero" : (geometry.fillRule ?? "nonzero")
      },
      removed,
      intersections
    };
  } finally {
    if (root) root.remove();
    else paths.forEach((path) => path.remove());
  }
}

function contourToPaperPath(paper: PaperApi, contour: DesignerContour) {
  const path = new paper.Path({ insert: false, closed: true });
  contour.points.forEach((point) => path.add(new paper.Segment(
    new paper.Point(point.x, point.y),
    new paper.Point(point.handleIn?.x ?? 0, point.handleIn?.y ?? 0),
    new paper.Point(point.handleOut?.x ?? 0, point.handleOut?.y ?? 0)
  )));
  return path;
}

function paperPathToContour(path: PaperPath): DesignerContour {
  const points = path.segments.map((segment): DesignerPoint => ({
    x: round(segment.point.x),
    y: round(segment.point.y),
    ...(segment.handleIn.length > 1e-7 ? { handleIn: { x: round(segment.handleIn.x), y: round(segment.handleIn.y) } } : {}),
    ...(segment.handleOut.length > 1e-7 ? { handleOut: { x: round(segment.handleOut.x), y: round(segment.handleOut.y) } } : {}),
    nodeType: segment.handleIn.length > 1e-7 || segment.handleOut.length > 1e-7 ? "smooth" : "corner"
  }));
  return {
    points,
    pathMode: points.some((entry) => entry.handleIn || entry.handleOut) ? "bezier" : "straight",
    closed: true
  };
}

function largestContourIndex(paths: PaperPath[]) {
  return paths.reduce((largest, path, index) => Math.abs(path.area) > Math.abs(paths[largest].area) ? index : largest, 0);
}

function unionBounds(paths: PaperPath[]) {
  const left = Math.min(...paths.map((path) => path.bounds.left));
  const top = Math.min(...paths.map((path) => path.bounds.top));
  const right = Math.max(...paths.map((path) => path.bounds.right));
  const bottom = Math.max(...paths.map((path) => path.bounds.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function compareScore(left: [number, number, number], right: [number, number, number]) {
  for (let index = 0; index < left.length; index += 1) {
    if (Math.abs(left[index] - right[index]) > 1e-7) return left[index] - right[index];
  }
  return 0;
}

function uniquePoints(points: DesignerPoint[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function round(value: number) {
  return Math.round(value * 100000) / 100000;
}
