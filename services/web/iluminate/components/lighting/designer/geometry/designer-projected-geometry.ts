import type { DesignerForm, DesignerGeometry, DesignerPoint, DesignerProjectionLayer } from "@/lib/lighting/partitura-model";
import { resolveDesignerProjectionGeometry as resolveCanonicalProjectionGeometry } from "@/lib/lighting/partitura-model";
import { resolveChannelOutlineContours } from "../rendering/channel-swept-outline";

/** Area projections use the swept perimeter; fabrication keeps the canonical centerline toolpath. */
export function resolveDesignerProjectionGeometry(
  designer: DesignerForm,
  projectionId: string,
  destination?: DesignerProjectionLayer | "fabrication"
) {
  const projection = designer.projections.find((entry) => entry.id === projectionId);
  const channel = projection
    ? designer.channels.find((entry) => entry.geometryId === projection.sourceGeometryId)
    : null;
  if (!projection || !channel || destination === "fabrication") return resolveCanonicalProjectionGeometry(designer, projectionId);

  const contours = resolveChannelOutlineContours(channel);
  if (!contours.length) return { geometry: null, issue: "collapsed" as const, warnings: [] };
  const bounds = pointBounds(contours.flatMap((contour) => contour.points));
  const geometry: DesignerGeometry = {
    id: projection.geometryId,
    kind: "path",
    ...bounds,
    points: contours[0].points,
    ...(contours.length > 1 ? { contours } : {}),
    pathMode: "bezier",
    closed: true,
    fillRule: contours.length > 1 ? "evenodd" : "nonzero"
  };
  return { geometry, issue: null, warnings: [] };
}

function pointBounds(points: DesignerPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
