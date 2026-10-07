import { canonicalizeDesignerGeometry, designerGeometryAsShape, type DesignerForm, type DesignerGeometry, type DesignerPoint } from "@/lib/lighting/partitura-model";
import { filletDesignerGeometry } from "@/lib/lighting/designer-derived-geometry";

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

export type DesignerNativeFilletTarget = {
  type: "build_area" | "zone" | "channel" | "face_graphic";
  id: string;
  cornerIndex: number;
};

export type DesignerNativeFilletResult = {
  designer: DesignerForm;
  applied: boolean;
  issue: "missing-source" | "collapsed" | "invalid-topology" | null;
  warnings: string[];
};

/** Applies one fillet directly to its native owner while preserving semantic identity. */
export function applyDesignerNativeFillet(
  designer: DesignerForm,
  target: DesignerNativeFilletTarget,
  radiusMm: number
): DesignerNativeFilletResult {
  const canonical = designer.geometries?.length ? designer : canonicalizeDesignerGeometry(designer);
  const owner = target.type === "build_area"
    ? canonical.buildAreas.find((entry) => entry.id === target.id)
    : target.type === "zone"
      ? canonical.zones.find((entry) => entry.id === target.id)
      : target.type === "channel"
        ? canonical.channels.find((entry) => entry.id === target.id)
        : canonical.faceGraphics.find((entry) => entry.id === target.id);
  const source = owner?.geometryId ? canonical.geometries?.find((geometry) => geometry.id === owner.geometryId) : null;
  if (!owner || !source) return { designer, applied: false, issue: "missing-source", warnings: [] };

  const result = filletDesignerGeometry(source, radiusMm, [target.cornerIndex], source.id);
  if (!result.geometry) return { designer, applied: false, issue: result.issue, warnings: result.warnings };
  const changed = source.kind !== result.geometry.kind
    || source.pathMode !== result.geometry.pathMode
    || JSON.stringify(source.points ?? null) !== JSON.stringify(result.geometry.points ?? null)
    || JSON.stringify(source.contours ?? null) !== JSON.stringify(result.geometry.contours ?? null);
  if (!changed) return { designer, applied: false, issue: result.issue, warnings: result.warnings };

  const shape = designerGeometryAsShape(result.geometry);
  const nextDesigner = target.type === "build_area"
    ? { ...canonical, buildAreas: canonical.buildAreas.map((entry) => entry.id === target.id ? { ...entry, ...shape } : entry) }
    : target.type === "zone"
      ? { ...canonical, zones: canonical.zones.map((entry) => entry.id === target.id ? { ...entry, ...shape } : entry) }
      : target.type === "channel"
        ? {
            ...canonical,
            channels: canonical.channels.map((entry) => entry.id === target.id ? {
              ...entry,
              points: shape.points ?? entry.points,
              pathMode: shape.pathMode,
              closed: result.geometry!.closed !== false
            } : entry)
          }
        : { ...canonical, faceGraphics: canonical.faceGraphics.map((entry) => entry.id === target.id ? { ...entry, ...shape } : entry) };
  return { designer: canonicalizeDesignerGeometry(nextDesigner), applied: true, issue: result.issue, warnings: result.warnings };
}
