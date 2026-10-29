import type { DesignerForm } from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "./designer-compiler";

const DESIGNER_COMPILER_VERSION = 10;

/** Stable signature of the authored data that changes electrical or targeting semantics. */
export function designerCompileSignature(designer: DesignerForm) {
  return JSON.stringify({
    compilerVersion: DESIGNER_COMPILER_VERSION,
    stripConfiguration: designer.stripConfiguration,
    controller: designer.controller,
    routes: designer.routes.map(({ id, name, kind, designSurface, diffuserMapping, points }) => ({ id, name, kind, designSurface: designSurface === "front" ? "front" : "rear", diffuserMapping, points })),
    zones: designer.zones.map(({ id, name, shape, x, y, width, height, points, contours, pathMode, fillRule }) => ({ id, name, shape, x, y, width, height, points, contours, pathMode, fillRule })),
    channels: designer.channels.map(({ id, name, points, pathMode, widthMm, closed, cap, fabricationSurface }) => ({ id, name, points, pathMode, widthMm, closed, cap, fabricationSurface: fabricationSurface === "rear" ? "rear" : "front" })),
    lightSources: designer.lightSources.map(({ id, name, targetType, targetId, mode, enabled }) => ({ id, name, targetType, targetId, mode, enabled })),
    groups: designer.groups.map(({ id, name, members }) => ({
      id,
      name,
      members: members.map(({ type, id: memberId }) => ({ type, id: memberId }))
    })),
    addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
    ledPackageSizeMm: designer.ledPackageSizeMm,
    snapCm: designer.snapCm
  });
}

export function compiledStringIdsForSource(layout: CompiledDesignerLayout | undefined, sourceId: string) {
  if (!layout) return [];
  const pixelsById = new Map(layout.pixelMap.map((pixel) => [pixel.id, pixel]));
  return Array.from(new Set((layout.zones.find((zone) => zone.id === sourceId)?.pixelIds ?? [])
    .map((pixelId) => pixelsById.get(pixelId)?.stringId)
    .filter((stringId): stringId is string => Boolean(stringId))));
}
