import type { DesignerActiveLayer, DesignerTool } from "../types";

export type DesignerGeometryTarget = "build_area" | "zone" | "channel" | "face_graphic";
export type DesignerGeometryToolPolicy = {
  target: DesignerGeometryTarget;
  construction: "primitive" | "path";
  shape: "rect" | "ellipse" | "path";
  mode: "straight" | "bezier";
  layers: DesignerActiveLayer[];
};

const GEOMETRY_TOOL_POLICIES: Partial<Record<DesignerTool, DesignerGeometryToolPolicy>> = {
  build_area_rect: { target: "build_area", construction: "primitive", shape: "rect", mode: "straight", layers: ["artwork", "reference"] },
  build_area_ellipse: { target: "build_area", construction: "primitive", shape: "ellipse", mode: "straight", layers: ["artwork", "reference"] },
  build_area_polygon: { target: "build_area", construction: "path", shape: "path", mode: "straight", layers: ["artwork", "reference"] },
  build_area_bezier: { target: "build_area", construction: "path", shape: "path", mode: "bezier", layers: ["artwork", "reference"] },
  zone_rect: { target: "zone", construction: "primitive", shape: "rect", mode: "straight", layers: ["zones"] },
  zone_ellipse: { target: "zone", construction: "primitive", shape: "ellipse", mode: "straight", layers: ["zones"] },
  zone_polygon: { target: "zone", construction: "path", shape: "path", mode: "straight", layers: ["zones"] },
  zone_bezier: { target: "zone", construction: "path", shape: "path", mode: "bezier", layers: ["zones"] },
  channel_bezier: { target: "channel", construction: "path", shape: "path", mode: "bezier", layers: ["zones"] },
  face_graphic_rect: { target: "face_graphic", construction: "primitive", shape: "rect", mode: "straight", layers: ["faceGraphic"] },
  face_graphic_ellipse: { target: "face_graphic", construction: "primitive", shape: "ellipse", mode: "straight", layers: ["faceGraphic"] },
  face_graphic_polygon: { target: "face_graphic", construction: "path", shape: "path", mode: "straight", layers: ["faceGraphic"] },
  face_graphic_bezier: { target: "face_graphic", construction: "path", shape: "path", mode: "bezier", layers: ["faceGraphic"] }
};

export const ELECTRICAL_TOOLS: ReadonlySet<DesignerTool> = new Set<DesignerTool>(["led_string", "data_cable", "cut"]);

export function geometryToolPolicy(tool: DesignerTool) {
  return GEOMETRY_TOOL_POLICIES[tool] ?? null;
}

export function geometryToolAllowedOnLayer(tool: DesignerTool, layer: DesignerActiveLayer | null) {
  const policy = geometryToolPolicy(tool);
  return Boolean(policy && layer && policy.layers.includes(layer));
}
