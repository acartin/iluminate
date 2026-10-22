import type { DesignerChannelForm, DesignerForm, DesignerPoint, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { channelCenterPolyline, channelIsClosed, channelWidthCm, movedChannel, movedShape, pointInsideDesignerShape, shapeOutlinePoints, snapValue } from "../designer-geometry";
import type { DesignerActiveLayer, DesignerSelection } from "../types";

type DesignerGeometrySelection = Extract<Exclude<DesignerSelection, null>, {
  type: "build_area" | "zone" | "face_graphic" | "projection" | "derived_geometry" | "channel";
}>;

type MarqueeLayer = "artwork" | "zones" | "faceGraphic";
type SelectionRect = { x: number; y: number; width: number; height: number };
type SelectableShape = Pick<DesignerZoneForm, "shape" | "x" | "y" | "width" | "height" | "points" | "contours" | "pathMode">;

export type DesignerMarqueeSelectionResult = {
  layer: MarqueeLayer | null;
  selections: DesignerGeometrySelection[];
};

export function designerMarqueeSelection(
  designer: DesignerForm,
  activeLayer: DesignerActiveLayer | null,
  start: DesignerPoint,
  end: DesignerPoint
): DesignerMarqueeSelectionResult {
  const rect = normalizedRect(start, end);
  const candidates: Array<
    | { layer: MarqueeLayer; selection: DesignerGeometrySelection; shape: SelectableShape; channel?: never }
    | { layer: "zones"; selection: DesignerGeometrySelection; channel: DesignerChannelForm; shape?: never }
  > = [];

  if (designer.layers.artwork.visible) {
    designer.buildAreas.forEach((shape) => {
      if (shape.visible !== false) candidates.push({ layer: "artwork", selection: { type: "build_area", id: shape.id }, shape });
    });
  }
  if (designer.layers.zones.visible) {
    designer.zones.forEach((shape) => {
      if (shape.visible !== false) candidates.push({ layer: "zones", selection: { type: "zone", id: shape.id }, shape });
    });
    designer.channels.forEach((channel) => {
      if (channel.visible !== false) candidates.push({ layer: "zones", selection: { type: "channel", id: channel.id }, channel });
    });
  }
  if (designer.layers.faceGraphic.visible) {
    designer.faceGraphics.forEach((shape) => {
      if (shape.visible !== false) candidates.push({ layer: "faceGraphic", selection: { type: "face_graphic", id: shape.id }, shape });
    });
  }

  // Projected and derived profiles only render in their active destination.
  // Keep the marquee's candidate set identical to what the operator can see.
  designer.projections.forEach((projection) => {
    const layer = marqueeLayerForTarget(projection.targetLayer);
    if (!projection.visible || !layerIsActive(layer, activeLayer) || !designer.layers[layer].visible) return;
    const resolved = resolveDesignerProjectionGeometry(designer, projection.id);
    if (resolved.geometry) candidates.push({ layer, selection: { type: "projection", id: projection.id }, shape: designerGeometryAsShape(resolved.geometry) });
  });
  designer.derivedGeometries.forEach((operation) => {
    const layer = marqueeLayerForTarget(operation.targetLayer);
    if (!operation.visible || !layerIsActive(layer, activeLayer) || !designer.layers[layer].visible) return;
    const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
    if (resolved.geometry) candidates.push({ layer, selection: { type: "derived_geometry", id: operation.id }, shape: designerGeometryAsShape(resolved.geometry) });
  });

  const hits = candidates.filter((candidate) => candidate.channel ? channelTouchesRect(candidate.channel, rect) : shapeTouchesRect(candidate.shape, rect));
  if (!hits.length) return { layer: null, selections: [] };

  const normalizedActiveLayer = activeLayer === "reference" ? "artwork" : activeLayer;
  const activeHits = normalizedActiveLayer === "artwork" || normalizedActiveLayer === "zones" || normalizedActiveLayer === "faceGraphic"
    ? hits.filter((hit) => hit.layer === normalizedActiveLayer)
    : [];
  const selectedLayer = activeHits.length
    ? normalizedActiveLayer as MarqueeLayer
    : (["faceGraphic", "zones", "artwork"] as const).reduce((best, layer) => {
        const count = hits.filter((hit) => hit.layer === layer).length;
        return count > best.count ? { layer, count } : best;
      }, { layer: "faceGraphic" as MarqueeLayer, count: 0 }).layer;

  return {
    layer: selectedLayer,
    selections: hits.filter((hit) => hit.layer === selectedLayer).map((hit) => hit.selection)
  };
}

export function moveDesignerMarqueeDiffusors(designer: DesignerForm, selectionKeys: string[], anchorKey: string, delta: DesignerPoint, snapCm: number): DesignerForm {
  const selected = new Set(selectionKeys);
  const [anchorType, anchorId] = anchorKey.split(":", 2);
  const anchor = anchorType === "zone"
    ? designer.zones.find((zone) => zone.id === anchorId)
    : anchorType === "channel"
      ? designer.channels.find((channel) => channel.id === anchorId)?.points[0]
      : null;
  if (!anchor) return designer;
  const snappedDelta = {
    x: snapValue(anchor.x + delta.x, snapCm) - anchor.x,
    y: snapValue(anchor.y + delta.y, snapCm) - anchor.y
  };
  return {
    ...designer,
    zones: designer.zones.map((zone) => selected.has(`zone:${zone.id}`) ? movedShape(zone, snappedDelta.x, snappedDelta.y, 0) : zone),
    channels: designer.channels.map((channel) => selected.has(`channel:${channel.id}`) ? movedChannel(channel, snappedDelta.x, snappedDelta.y, 0) : channel)
  };
}

function channelTouchesRect(channel: DesignerChannelForm, rect: SelectionRect) {
  const radius = channelWidthCm(channel) / 2;
  const expanded = { x: rect.x - radius, y: rect.y - radius, width: rect.width + radius * 2, height: rect.height + radius * 2 };
  const center = channelCenterPolyline(channel);
  if (center.some((point) => pointInsideRect(expanded, point))) return true;
  const segments = center.slice(1).map((end, index) => ({ start: center[index], end }));
  if (channelIsClosed(channel) && center.length > 2) segments.push({ start: center[center.length - 1], end: center[0] });
  return segments.some(({ start, end }) => rectangleSegments(expanded).some((edge) => segmentsTouch(start, end, edge.start, edge.end)));
}

function marqueeLayerForTarget(targetLayer: "reference" | "zones" | "faceGraphic"): MarqueeLayer {
  return targetLayer === "reference" ? "artwork" : targetLayer;
}

function layerIsActive(layer: MarqueeLayer, activeLayer: DesignerActiveLayer | null) {
  return layer === "artwork" ? activeLayer === "artwork" || activeLayer === "reference" : activeLayer === layer;
}

function normalizedRect(start: DesignerPoint, end: DesignerPoint): SelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function shapeTouchesRect(shape: SelectableShape, rect: SelectionRect) {
  if (!rectsTouch(shape, rect)) return false;
  if (shape.shape === "rect") return true;
  if (shape.shape === "ellipse") {
    const radiusX = Math.max(0.001, shape.width / 2);
    const radiusY = Math.max(0.001, shape.height / 2);
    const center = { x: shape.x + radiusX, y: shape.y + radiusY };
    const nearest = {
      x: Math.max(rect.x, Math.min(center.x, rect.x + rect.width)),
      y: Math.max(rect.y, Math.min(center.y, rect.y + rect.height))
    };
    return ((nearest.x - center.x) / radiusX) ** 2 + ((nearest.y - center.y) / radiusY) ** 2 <= 1;
  }

  const corners = rectangleCorners(rect);
  if (corners.some((corner) => pointInsideDesignerShape(shape, corner))) return true;
  const contours = shape.contours?.length
    ? shape.contours.map((contour) => shapeOutlinePoints({ shape: "polygon", points: contour.points, pathMode: contour.pathMode }))
    : [shapeOutlinePoints(shape)];
  return contours.some((outline) => outline.some((point) => pointInsideRect(rect, point))
    || closedSegments(outline).some(({ start, end }) => rectangleSegments(rect).some((edge) => segmentsTouch(start, end, edge.start, edge.end))));
}

function rectsTouch(a: SelectionRect, b: SelectionRect) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function pointInsideRect(rect: SelectionRect, point: DesignerPoint) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function rectangleCorners(rect: SelectionRect): DesignerPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

function rectangleSegments(rect: SelectionRect) {
  return closedSegments(rectangleCorners(rect));
}

function closedSegments(points: DesignerPoint[]) {
  return points.map((start, index) => ({ start, end: points[(index + 1) % points.length] }));
}

function segmentsTouch(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint) {
  const cross = (p: DesignerPoint, q: DesignerPoint, r: DesignerPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const epsilon = 1e-9;
  const onSegment = (p: DesignerPoint, q: DesignerPoint, r: DesignerPoint) => Math.abs(cross(p, q, r)) <= epsilon
    && r.x >= Math.min(p.x, q.x) - epsilon && r.x <= Math.max(p.x, q.x) + epsilon
    && r.y >= Math.min(p.y, q.y) - epsilon && r.y <= Math.max(p.y, q.y) + epsilon;
  return abC * abD < 0 && cdA * cdB < 0
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
