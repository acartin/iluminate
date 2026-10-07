import paper from "paper";
import type { DesignerChannelForm, DesignerContour, DesignerPoint } from "@/lib/lighting/partitura-model";
import { channelCenterPolyline, channelIsClosed, channelWidthCm } from "../designer-geometry";
import type { PaperApi } from "../types";

type PaperPathItem = InstanceType<PaperApi["Path"]> | InstanceType<PaperApi["CompoundPath"]>;

const outlineCache = new Map<string, DesignerPoint[][]>();
const MAX_CACHE_ENTRIES = 48;
const canonicalPaperScope = new paper.PaperScope();
canonicalPaperScope.setup(new canonicalPaperScope.Size(1, 1));

/**
 * Resolves the physical Channel footprint once for every downstream consumer.
 * Designer, Animate and fabrication must consume these contours instead of
 * independently offsetting the editable center line.
 */
export function resolveChannelOutlineContours(channel: DesignerChannelForm): DesignerContour[] {
  return sweptChannelOutlineContours(
    canonicalPaperScope as unknown as PaperApi,
    channelCenterPolyline(channel),
    channelWidthCm(channel),
    channelIsClosed(channel),
    channel.cap === "round"
  ).map((points) => ({ points, pathMode: "bezier", closed: true }));
}

/**
 * Returns the actual perimeter swept by a circular router bit along a sampled
 * centerline. Segment capsules are geometrically united, so their shared edges
 * can never appear as visible seams at acute turns.
 */
export function sweptChannelOutlineContours(
  paper: PaperApi,
  centerline: DesignerPoint[],
  widthCm: number,
  closed: boolean,
  roundCaps: boolean
): DesignerPoint[][] {
  if (centerline.length < 2 || widthCm <= 0) return [];
  const cacheKey = JSON.stringify([widthCm, closed, roundCaps, centerline]);
  const cached = outlineCache.get(cacheKey);
  if (cached) return cached;

  const center = simplifyCenterline(centerline, closed, 0.02);
  const segmentCount = closed ? center.length : center.length - 1;
  let items: PaperPathItem[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = center[index];
    const end = center[(index + 1) % center.length];
    if (Math.hypot(end.x - start.x, end.y - start.y) < 1e-8) continue;
    items.push(capsulePath(
      paper,
      start,
      end,
      widthCm / 2,
      closed || index > 0 || roundCaps,
      closed || index < segmentCount - 1 || roundCaps
    ));
  }
  if (!items.length) return [];

  while (items.length > 1) {
    const next: PaperPathItem[] = [];
    for (let index = 0; index < items.length; index += 2) {
      const left = items[index];
      const right = items[index + 1];
      if (!right) {
        next.push(left);
        continue;
      }
      const united = left.unite(right, { insert: false }) as PaperPathItem;
      left.remove();
      right.remove();
      next.push(united);
    }
    items = next;
  }

  const result = items[0];
  const contours = collectPaths(result)
    .filter((path) => path.closed && Math.abs(path.area) > 1e-8)
    .map((path) => path.segments.map((segment): DesignerPoint => ({
      x: segment.point.x,
      y: segment.point.y,
      ...(segment.handleIn.length > 1e-8 ? { handleIn: { x: segment.handleIn.x, y: segment.handleIn.y } } : {}),
      ...(segment.handleOut.length > 1e-8 ? { handleOut: { x: segment.handleOut.x, y: segment.handleOut.y } } : {})
    })));
  result.remove();

  outlineCache.set(cacheKey, contours);
  if (outlineCache.size > MAX_CACHE_ENTRIES) outlineCache.delete(outlineCache.keys().next().value!);
  return contours;
}

function capsulePath(
  paper: PaperApi,
  start: DesignerPoint,
  end: DesignerPoint,
  radius: number,
  roundStart: boolean,
  roundEnd: boolean
) {
  const startPoint = new paper.Point(start.x, start.y);
  const endPoint = new paper.Point(end.x, end.y);
  const direction = endPoint.subtract(startPoint).normalize();
  const normal = new paper.Point(-direction.y, direction.x).multiply(radius);
  const radiusVector = direction.multiply(radius);
  const path = new paper.Path({ insert: false, closed: true });
  path.add(startPoint.add(normal));
  path.add(endPoint.add(normal));
  if (roundEnd) path.arcTo(endPoint.add(radiusVector), endPoint.subtract(normal));
  else path.add(endPoint.subtract(normal));
  path.add(startPoint.subtract(normal));
  if (roundStart) path.arcTo(startPoint.subtract(radiusVector), startPoint.add(normal));
  else path.add(startPoint.add(normal));
  return path;
}

function collectPaths(item: PaperPathItem): Array<InstanceType<PaperApi["Path"]>> {
  if (item.className === "Path") return [item as InstanceType<PaperApi["Path"]>];
  return Array.from(item.children).flatMap((child) => collectPaths(child as PaperPathItem));
}

function simplifyCenterline(points: DesignerPoint[], closed: boolean, tolerance: number) {
  if (points.length < 4) return points.slice();
  if (!closed) return simplifyOpen(points, tolerance);

  let splitIndex = 1;
  let maximumDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  const first = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const second = simplifyOpen([...points.slice(splitIndex), points[0]], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function simplifyOpen(points: DesignerPoint[], tolerance: number): DesignerPoint[] {
  if (points.length < 3) return points.slice();
  let splitIndex = 0;
  let maximumDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointToSegmentDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  if (maximumDistance <= tolerance) return [points[0], points[points.length - 1]];
  const first = simplifyOpen(points.slice(0, splitIndex + 1), tolerance);
  const second = simplifyOpen(points.slice(splitIndex), tolerance);
  return [...first.slice(0, -1), ...second];
}

function pointToSegmentDistance(point: DesignerPoint, start: DesignerPoint, end: DesignerPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - start.x - dx * ratio, point.y - start.y - dy * ratio);
}
