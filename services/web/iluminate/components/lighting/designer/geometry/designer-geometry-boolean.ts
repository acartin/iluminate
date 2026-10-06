import type { DesignerContour, DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";
import type { PaperApi } from "../types";

export type DesignerBooleanOperation = "union" | "subtract" | "intersect" | "exclude";
export type DesignerTopologyIssue = "open-profile" | "self-intersection" | "duplicate-contour" | "empty-result";

export type DesignerBooleanResult = {
  geometry: DesignerGeometry | null;
  issues: DesignerTopologyIssue[];
};

type PaperPathItem = InstanceType<PaperApi["Path"]> | InstanceType<PaperApi["CompoundPath"]>;

export function validateDesignerGeometryTopology(geometry: DesignerGeometry): DesignerTopologyIssue[] {
  if (geometry.kind !== "path") return [];
  if (geometry.closed === false) return ["open-profile"];
  const contours = geometryContours(geometry);
  const issues = new Set<DesignerTopologyIssue>();
  if (!contours.length || contours.some((contour) => !contour.closed || contour.points.length < 3)) issues.add("open-profile");
  const signatures = new Set<string>();
  contours.forEach((contour) => {
    const signature = contourSignature(contour);
    if (signatures.has(signature)) issues.add("duplicate-contour");
    signatures.add(signature);
    if (contourSelfIntersects(contour)) issues.add("self-intersection");
  });
  return Array.from(issues);
}

export function applyDesignerBooleanOperation(
  paper: PaperApi,
  geometries: DesignerGeometry[],
  operation: DesignerBooleanOperation,
  resultId: string
): DesignerBooleanResult {
  const inputIssues = geometries.flatMap(validateDesignerGeometryTopology);
  if (geometries.length < 2 || inputIssues.length) return { geometry: null, issues: Array.from(new Set(inputIssues)) };
  const items = geometries.map((geometry) => geometryToPaperItem(paper, geometry));
  let result = items[0];
  try {
    for (let index = 1; index < items.length; index += 1) {
      const operand = items[index];
      const next = operation === "union"
        ? result.unite(operand, { insert: false })
        : operation === "subtract"
          ? result.subtract(operand, { insert: false })
          : operation === "intersect"
            ? result.intersect(operand, { insert: false })
            : result.exclude(operand, { insert: false });
      if (result !== items[0]) result.remove();
      result = next as PaperPathItem;
    }
    const geometry = paperItemToGeometry(result, resultId);
    if (!geometry) return { geometry: null, issues: ["empty-result"] };
    const outputIssues = validateDesignerGeometryTopology(geometry);
    return outputIssues.length ? { geometry: null, issues: outputIssues } : { geometry, issues: [] };
  } finally {
    items.forEach((item) => item.remove());
    result?.remove();
  }
}

function geometryContours(geometry: DesignerGeometry): DesignerContour[] {
  if (geometry.contours?.length) return geometry.contours;
  if (!geometry.points?.length) return [];
  return [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: true }];
}

function geometryToPaperItem(paper: PaperApi, geometry: DesignerGeometry): PaperPathItem {
  if (geometry.kind === "rect") return new paper.Path.Rectangle({ rectangle: new paper.Rectangle(geometry.x, geometry.y, geometry.width, geometry.height), insert: false });
  if (geometry.kind === "ellipse") return new paper.Path.Ellipse({ rectangle: new paper.Rectangle(geometry.x, geometry.y, geometry.width, geometry.height), insert: false });
  const paths = geometryContours(geometry).map((contour) => contourToPaperPath(paper, contour));
  if (paths.length === 1) return paths[0];
  const compound = new paper.CompoundPath({ insert: false });
  paths.forEach((path) => compound.addChild(path));
  compound.fillRule = "evenodd";
  return compound;
}

function contourToPaperPath(paper: PaperApi, contour: DesignerContour) {
  const path = new paper.Path({ insert: false, closed: true });
  contour.points.forEach((point) => {
    path.add(new paper.Segment(
      new paper.Point(point.x, point.y),
      new paper.Point(point.handleIn?.x ?? 0, point.handleIn?.y ?? 0),
      new paper.Point(point.handleOut?.x ?? 0, point.handleOut?.y ?? 0)
    ));
  });
  return path;
}

function paperItemToGeometry(item: PaperPathItem, id: string): DesignerGeometry | null {
  const paths = collectPaperPaths(item).filter((path) => path.closed && path.segments.length >= 3 && Math.abs(path.area) > 1e-6);
  if (!paths.length) return null;
  const contours = paths.map((path): DesignerContour => ({
    points: path.segments.map((segment): DesignerPoint => ({
      x: roundGeometryNumber(segment.point.x),
      y: roundGeometryNumber(segment.point.y),
      ...(segment.handleIn.length > 1e-7 ? { handleIn: { x: roundGeometryNumber(segment.handleIn.x), y: roundGeometryNumber(segment.handleIn.y) } } : {}),
      ...(segment.handleOut.length > 1e-7 ? { handleOut: { x: roundGeometryNumber(segment.handleOut.x), y: roundGeometryNumber(segment.handleOut.y) } } : {}),
      nodeType: segment.handleIn.length > 1e-7 || segment.handleOut.length > 1e-7 ? "smooth" : "corner"
    })),
    pathMode: path.segments.some((segment) => segment.handleIn.length > 1e-7 || segment.handleOut.length > 1e-7) ? "bezier" : "straight",
    closed: true
  }));
  const bounds = item.bounds;
  const x = roundGeometryNumber(bounds.x);
  const y = roundGeometryNumber(bounds.y);
  return {
    id,
    kind: "path",
    x,
    y,
    width: Math.max(0.001, roundGeometryNumber(bounds.width)),
    height: Math.max(0.001, roundGeometryNumber(bounds.height)),
    points: contours[0].points,
    ...(contours.length > 1 ? { contours } : {}),
    pathMode: contours.some((contour) => contour.pathMode === "bezier") ? "bezier" : "straight",
    closed: true,
    fillRule: "evenodd"
  };
}

function collectPaperPaths(item: PaperPathItem): Array<InstanceType<PaperApi["Path"]>> {
  if (item.className === "Path") return [item as InstanceType<PaperApi["Path"]>];
  return Array.from(item.children).flatMap((child) => collectPaperPaths(child as PaperPathItem));
}

function roundGeometryNumber(value: number) {
  return Math.round(value * 100000) / 100000;
}

function contourSignature(contour: DesignerContour) {
  const encoded = contour.points.map((point) => `${roundGeometryNumber(point.x)},${roundGeometryNumber(point.y)}`);
  const variants: string[] = [];
  for (let index = 0; index < encoded.length; index += 1) variants.push([...encoded.slice(index), ...encoded.slice(0, index)].join(";"));
  const reversed = [...encoded].reverse();
  for (let index = 0; index < reversed.length; index += 1) variants.push([...reversed.slice(index), ...reversed.slice(0, index)].join(";"));
  return variants.sort()[0] ?? "";
}

function contourSelfIntersects(contour: DesignerContour) {
  const points = flattenContour(contour);
  if (points.length < 4) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (first === 0 && secondNext === 0) continue;
      if (segmentsCross(points[first], points[firstNext], points[second], points[secondNext])) return true;
    }
  }
  return false;
}

function flattenContour(contour: DesignerContour) {
  if (contour.pathMode !== "bezier") return contour.points;
  const points: DesignerPoint[] = [];
  contour.points.forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    // Every segment contributes its own start anchor. Skipping anchors after
    // the first segment connects two interior samples with a false chord,
    // which can report valid glyph outlines as self-intersecting.
    for (let step = 0; step < 12; step += 1) points.push(cubicPoint(start, end, step / 12));
  });
  return points;
}

function cubicPoint(start: DesignerPoint, end: DesignerPoint, t: number): DesignerPoint {
  const a = start.handleOut ? { x: start.x + start.handleOut.x, y: start.y + start.handleOut.y } : start;
  const b = end.handleIn ? { x: end.x + end.handleIn.x, y: end.y + end.handleIn.y } : end;
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * a.x + 3 * inverse * t ** 2 * b.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * a.y + 3 * inverse * t ** 2 * b.y + t ** 3 * end.y
  };
}

function segmentsCross(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint) {
  const cross = (p: DesignerPoint, q: DesignerPoint, r: DesignerPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  // Tangent/collinear contacts are common in converted glyphs and are not a
  // crossing. Only a proper side-to-side intersection invalidates a contour.
  return abC * abD < -1e-10 && cdA * cdB < -1e-10;
}
