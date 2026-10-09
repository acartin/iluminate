import type { DesignerContour, DesignerPoint, DesignerZoneForm } from "./partitura-model";
import type { PaperApi } from "@/components/lighting/designer/types";

const SVG_VIEWPORT_MARKER = "__iluminate_svg_viewport__";
const EPSILON = 1e-7;

type VectorPoint = { x: number; y: number };

export type SvgPathSegment = {
  point: VectorPoint;
  handleIn?: VectorPoint;
  handleOut?: VectorPoint;
};

export type SvgPathCandidate = {
  name?: string;
  fillRule: "nonzero" | "evenodd";
  contours: Array<{ closed: boolean; segments: SvgPathSegment[] }>;
};

export type SvgZoneImportPlacement = {
  artwork: Pick<DesignerZoneForm, "x" | "y" | "width" | "height">;
  intrinsicWidthCm: number;
  intrinsicHeightCm: number;
};

export type SvgZoneDraft = Omit<DesignerZoneForm, "id" | "geometryId" | "name"> & { suggestedName?: string };

type PaperPointLike = VectorPoint & { add?: (point: VectorPoint) => PaperPointLike };
type PaperSegmentLike = { point: PaperPointLike; handleIn?: VectorPoint; handleOut?: VectorPoint };
type PaperItemLike = {
  className?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  clippingMask?: boolean;
  closed?: boolean;
  fillRule?: string;
  children?: PaperItemLike[];
  segments?: PaperSegmentLike[];
  localToGlobal?: (point: PaperPointLike) => VectorPoint;
};

export function importArtworkSvgAsZoneDrafts(svgSource: string, paper: PaperApi, placement: SvgZoneImportPlacement) {
  const document = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.nodeName.toLowerCase() !== "svg") {
    throw new Error("The asset is not a valid SVG document.");
  }
  document.querySelectorAll("script, foreignObject, image").forEach((element) => element.remove());
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const viewBox = document.documentElement.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const resolvedViewBox = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
    ? viewBox as [number, number, number, number]
    : null;
  marker.setAttribute("id", SVG_VIEWPORT_MARKER);
  marker.setAttribute("x", resolvedViewBox ? String(resolvedViewBox[0]) : "0");
  marker.setAttribute("y", resolvedViewBox ? String(resolvedViewBox[1]) : "0");
  marker.setAttribute("width", resolvedViewBox ? String(resolvedViewBox[2]) : "100%");
  marker.setAttribute("height", resolvedViewBox ? String(resolvedViewBox[3]) : "100%");
  marker.setAttribute("fill", "#000000");
  marker.setAttribute("fill-opacity", "0.000001");
  document.documentElement.insertBefore(marker, document.documentElement.firstChild);

  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  try {
    const root = scope.project.importSVG(new XMLSerializer().serializeToString(document), {
      expandShapes: true,
      insert: false
    }) as unknown as PaperItemLike;
    const markerItem = findPaperItem(root, (item) => item.name === SVG_VIEWPORT_MARKER);
    if (!markerItem) throw new Error("The SVG viewport could not be resolved.");
    const markerPoints = paperItemGlobalPoints(markerItem);
    if (markerPoints.length < 3) throw new Error("The SVG viewport is empty.");
    const viewport = vectorBounds(markerPoints);
    if (viewport.width <= EPSILON || viewport.height <= EPSILON) throw new Error("The SVG viewport has no measurable size.");
    const candidates = collectPaperPathCandidates(root);
    return placeSvgPathCandidates(candidates, viewport, placement);
  } finally {
    scope.project.clear();
    // PaperScope.setup() changes Paper.js' module-global active scope. Restore
    // the Designer scope or subsequent Path constructors target this detached
    // temporary project and the visible canvas appears completely empty.
    paper.activate();
  }
}

export function placeSvgPathCandidates(
  candidates: SvgPathCandidate[],
  viewport: { x: number; y: number; width: number; height: number },
  placement: SvgZoneImportPlacement
) {
  const intrinsicScale = Math.min(
    placement.artwork.width / placement.intrinsicWidthCm,
    placement.artwork.height / placement.intrinsicHeightCm
  );
  const displayedWidth = placement.intrinsicWidthCm * intrinsicScale;
  const displayedHeight = placement.intrinsicHeightCm * intrinsicScale;
  const displayedX = placement.artwork.x + (placement.artwork.width - displayedWidth) / 2;
  const displayedY = placement.artwork.y + (placement.artwork.height - displayedHeight) / 2;
  const scaleX = displayedWidth / viewport.width;
  const scaleY = displayedHeight / viewport.height;
  const mapPoint = (point: VectorPoint) => ({
    x: roundGeometry(displayedX + (point.x - viewport.x) * scaleX),
    y: roundGeometry(displayedY + (point.y - viewport.y) * scaleY)
  });
  const mapVector = (vector: VectorPoint | undefined) => vector && !vectorIsZero(vector) ? {
    x: roundGeometry(vector.x * scaleX),
    y: roundGeometry(vector.y * scaleY)
  } : undefined;

  let skippedOpenPaths = 0;
  const drafts: SvgZoneDraft[] = [];
  candidates.forEach((candidate) => {
    const closedContours = candidate.contours.filter((contour) => {
      if (!contour.closed || contour.segments.length < 3) {
        skippedOpenPaths += 1;
        return false;
      }
      return true;
    });
    if (!closedContours.length) return;
    const regions = splitSvgContoursIntoRegions(closedContours);
    regions.forEach((region, regionIndex) => {
    const contours = region.map((contour): DesignerContour => {
      const points = contour.segments.map((segment): DesignerPoint => {
        const handleIn = mapVector(segment.handleIn);
        const handleOut = mapVector(segment.handleOut);
        return {
          ...mapPoint(segment.point),
          ...(handleIn ? { handleIn } : {}),
          ...(handleOut ? { handleOut } : {}),
          nodeType: importedNodeType(handleIn, handleOut)
        };
      });
      return {
        points,
        pathMode: points.some((point) => point.handleIn || point.handleOut) ? "bezier" : "straight",
        closed: true
      };
    });
    if (!contours.every(validImportedContour)) return;
    const bounds = designerContourBounds(contours);
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
    drafts.push({
      suggestedName: candidate.name && regions.length > 1 ? `${candidate.name} · ${regionIndex + 1}` : candidate.name,
      shape: "polygon",
      ...bounds,
      points: contours[0].points,
      ...(contours.length > 1 ? { contours } : {}),
      fillRule: contours.length > 1 ? "evenodd" : candidate.fillRule,
      pathMode: contours.some((contour) => contour.pathMode === "bezier") ? "bezier" : "straight",
      visible: true,
      locked: false,
      opacity: 1
    });
    });
  });
  return { drafts, skippedOpenPaths };
}

function validImportedContour(contour: DesignerContour) {
  return contour.points.length >= 3 && contour.points.every((point) => [
    point.x,
    point.y,
    point.handleIn?.x ?? 0,
    point.handleIn?.y ?? 0,
    point.handleOut?.x ?? 0,
    point.handleOut?.y ?? 0
  ].every(Number.isFinite));
}

function splitSvgContoursIntoRegions(contours: SvgPathCandidate["contours"]) {
  if (contours.length <= 1) return [contours];
  const outlines = contours.map(sampleSvgContour);
  const areas = outlines.map(polygonArea);
  const parents = outlines.map((outline, index) => {
    const probe = outline[0];
    if (!probe) return -1;
    let parent = -1;
    let parentArea = Number.POSITIVE_INFINITY;
    outlines.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index || areas[candidateIndex] <= areas[index] || areas[candidateIndex] >= parentArea) return;
      if (pointInsidePolygon(probe, candidate)) {
        parent = candidateIndex;
        parentArea = areas[candidateIndex];
      }
    });
    return parent;
  });
  const depths = parents.map((_, index) => {
    let depth = 0;
    let parent = parents[index];
    const visited = new Set<number>();
    while (parent >= 0 && !visited.has(parent)) {
      visited.add(parent);
      depth += 1;
      parent = parents[parent];
    }
    return depth;
  });
  return contours.flatMap((contour, index) => {
    if (depths[index] % 2 !== 0) return [];
    const holes = contours.filter((_, candidateIndex) => parents[candidateIndex] === index && depths[candidateIndex] % 2 === 1);
    return [[contour, ...holes]];
  });
}

function sampleSvgContour(contour: SvgPathCandidate["contours"][number]) {
  const sampled: VectorPoint[] = [];
  contour.segments.forEach((start, index) => {
    const end = contour.segments[(index + 1) % contour.segments.length];
    if (!sampled.length) sampled.push(start.point);
    const hasCurve = Boolean(start.handleOut && !vectorIsZero(start.handleOut) || end.handleIn && !vectorIsZero(end.handleIn));
    if (!hasCurve) {
      sampled.push(end.point);
      return;
    }
    const controlA = start.handleOut ? addVector(start.point, start.handleOut) : start.point;
    const controlB = end.handleIn ? addVector(end.point, end.handleIn) : end.point;
    for (let step = 1; step <= 16; step += 1) sampled.push(cubicPoint(start.point, controlA, controlB, end.point, step / 16));
  });
  return sampled;
}

function cubicPoint(start: VectorPoint, controlA: VectorPoint, controlB: VectorPoint, end: VectorPoint, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  };
}

function pointInsidePolygon(point: VectorPoint, polygon: VectorPoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const start = polygon[index];
    const end = polygon[previous];
    if (start.y > point.y !== end.y > point.y && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x) inside = !inside;
  }
  return inside;
}

function polygonArea(points: VectorPoint[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function collectPaperPathCandidates(root: PaperItemLike) {
  const candidates: SvgPathCandidate[] = [];
  const visit = (item: PaperItemLike, inheritedName?: string) => {
    if (item.name === SVG_VIEWPORT_MARKER || item.visible === false || item.opacity === 0 || item.clippingMask) return;
    const name = item.name || inheritedName;
    if (item.className === "CompoundPath") {
      const contours = (item.children ?? []).filter((child) => child.className === "Path").map(paperPathCandidateContour);
      if (contours.length) candidates.push({ name, fillRule: item.fillRule === "evenodd" ? "evenodd" : "nonzero", contours });
      return;
    }
    if (item.className === "Path") {
      const contour = paperPathCandidateContour(item);
      if (contour.segments.length) candidates.push({ name, fillRule: item.fillRule === "evenodd" ? "evenodd" : "nonzero", contours: [contour] });
      return;
    }
    (item.children ?? []).forEach((child) => visit(child, name));
  };
  visit(root);
  return candidates;
}

function paperPathCandidateContour(path: PaperItemLike) {
  return {
    closed: path.closed === true,
    segments: (path.segments ?? []).map((segment): SvgPathSegment => {
      const point = paperItemGlobalPoint(path, segment.point);
      const handleInEnd = segment.handleIn && !vectorIsZero(segment.handleIn)
        ? paperItemGlobalPoint(path, addPaperPoint(segment.point, segment.handleIn))
        : null;
      const handleOutEnd = segment.handleOut && !vectorIsZero(segment.handleOut)
        ? paperItemGlobalPoint(path, addPaperPoint(segment.point, segment.handleOut))
        : null;
      return {
        point,
        ...(handleInEnd ? { handleIn: subtractVector(handleInEnd, point) } : {}),
        ...(handleOutEnd ? { handleOut: subtractVector(handleOutEnd, point) } : {})
      };
    })
  };
}

function paperItemGlobalPoints(item: PaperItemLike): VectorPoint[] {
  if (item.segments?.length) return item.segments.map((segment) => paperItemGlobalPoint(item, segment.point));
  return (item.children ?? []).flatMap(paperItemGlobalPoints);
}

function paperItemGlobalPoint(item: PaperItemLike, point: PaperPointLike) {
  const global = item.localToGlobal?.(point) ?? point;
  return { x: global.x, y: global.y };
}

function addPaperPoint(point: PaperPointLike, vector: VectorPoint): PaperPointLike {
  return point.add?.(vector) ?? { x: point.x + vector.x, y: point.y + vector.y };
}

function findPaperItem(item: PaperItemLike, predicate: (candidate: PaperItemLike) => boolean): PaperItemLike | null {
  if (predicate(item)) return item;
  for (const child of item.children ?? []) {
    const match = findPaperItem(child, predicate);
    if (match) return match;
  }
  return null;
}

function importedNodeType(handleIn: VectorPoint | undefined, handleOut: VectorPoint | undefined): DesignerPoint["nodeType"] {
  if (!handleIn && !handleOut) return "straight";
  if (!handleIn || !handleOut) return "smooth";
  const cross = Math.abs(handleIn.x * handleOut.y - handleIn.y * handleOut.x);
  const inLength = Math.hypot(handleIn.x, handleIn.y);
  const outLength = Math.hypot(handleOut.x, handleOut.y);
  const collinear = cross <= Math.max(EPSILON, inLength * outLength * 1e-5);
  const equalLength = Math.abs(inLength - outLength) <= Math.max(EPSILON, Math.max(inLength, outLength) * 1e-5);
  return collinear && equalLength ? "symmetric" : "smooth";
}

function designerContourBounds(contours: DesignerContour[]) {
  const controls = contours.flatMap((contour) => contour.points.flatMap((point) => [
    point,
    ...(point.handleIn ? [{ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }] : []),
    ...(point.handleOut ? [{ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }] : [])
  ]));
  return vectorBounds(controls);
}

function vectorBounds(points: VectorPoint[]) {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: Math.max(0.001, maxX - minX), height: Math.max(0.001, maxY - minY) };
}

function subtractVector(end: VectorPoint, start: VectorPoint) {
  return { x: end.x - start.x, y: end.y - start.y };
}

function addVector(point: VectorPoint, vector: VectorPoint) {
  return { x: point.x + vector.x, y: point.y + vector.y };
}

function vectorIsZero(vector: VectorPoint) {
  return Math.abs(vector.x) <= EPSILON && Math.abs(vector.y) <= EPSILON;
}

function roundGeometry(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
