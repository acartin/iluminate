import type { DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";

export type DesignerGeometryCommand =
  | { type: "move"; dx: number; dy: number }
  | { type: "set_bounds"; x: number; y: number; width: number; height: number }
  | { type: "set_points"; points: DesignerPoint[]; pathMode?: "straight" | "bezier"; closed?: boolean };

/** Pure command reducer used by history/undo integrations and future projections. */
export function applyDesignerGeometryCommand(geometry: DesignerGeometry, command: DesignerGeometryCommand): DesignerGeometry {
  if (command.type === "move") {
    return {
      ...geometry,
      x: geometry.x + command.dx,
      y: geometry.y + command.dy,
      ...(geometry.points ? { points: geometry.points.map((point) => ({ ...point, x: point.x + command.dx, y: point.y + command.dy })) } : {}),
      ...(geometry.contours ? { contours: geometry.contours.map((contour) => ({ ...contour, points: contour.points.map((point) => ({ ...point, x: point.x + command.dx, y: point.y + command.dy })) })) } : {})
    };
  }
  if (command.type === "set_bounds") {
    return { ...geometry, x: command.x, y: command.y, width: Math.max(0.001, command.width), height: Math.max(0.001, command.height) };
  }
  const points = command.points.map((point) => ({ ...point }));
  if (points.length === 0) return geometry;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    ...geometry,
    kind: "path",
    points,
    contours: undefined,
    pathMode: command.pathMode ?? geometry.pathMode ?? "straight",
    closed: command.closed ?? geometry.closed ?? true,
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(0.001, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(0.001, Math.max(...ys) - Math.min(...ys))
  };
}
