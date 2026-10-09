import type { DesignerActiveLayer, DesignerTool } from "../types";
import { DEFAULT_CHANNEL_ROUTER_DIAMETER_MM } from "@/lib/lighting/partitura-model";

export type DesignerGeometryTarget = "build_area" | "zone" | "channel" | "face_graphic" | "work_line";
export type DesignerGeometryToolPolicy = {
  target: DesignerGeometryTarget;
  construction: "primitive" | "path";
  shape: "rect" | "ellipse" | "path";
  mode: "straight" | "bezier";
  layers: DesignerActiveLayer[];
};

const GEOMETRY_TOOL_POLICIES: Partial<Record<DesignerTool, DesignerGeometryToolPolicy>> = {
  work_line: { target: "work_line", construction: "path", shape: "path", mode: "straight", layers: ["artwork", "reference", "zones", "faceGraphic"] },
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

// Keep terminal attraction inside the visible node instead of pulling in nearby wiring.
export const TERMINAL_SOLDER_CAPTURE_RADIUS_PX = 5;
export const POINTER_DRAG_THRESHOLD_PX = 3;

export const CHANNEL_ROUTER_BIT_PRESETS = [
  { label: "1/8 in · 3.175 mm", diameterMm: 3.175 },
  { label: "3/16 in · 4.763 mm", diameterMm: 4.7625 },
  { label: "6 mm · 0.236 in", diameterMm: 6 },
  { label: "1/4 in · 6.35 mm", diameterMm: 6.35 },
  { label: "8 mm · 0.315 in", diameterMm: 8 },
  { label: "3/8 in · 9.525 mm", diameterMm: 9.525 },
  { label: "10 mm · 0.394 in", diameterMm: 10 },
  { label: "12 mm · 0.472 in", diameterMm: 12 },
  { label: "1/2 in · 12.7 mm", diameterMm: 12.7 }
] as const;

export function channelWidthForRouterDiameter(diameterMm: number) {
  if (!Number.isFinite(diameterMm)) return DEFAULT_CHANNEL_ROUTER_DIAMETER_MM;
  return Math.max(3, Math.min(20, diameterMm));
}

export function canvasInteractionSnapCm(configuredSnapCm: number, snapToGrid: boolean) {
  return snapToGrid ? configuredSnapCm : 0;
}

export function geometryToolPolicy(tool: DesignerTool) {
  return GEOMETRY_TOOL_POLICIES[tool] ?? null;
}

export function geometryToolAllowedOnLayer(tool: DesignerTool, layer: DesignerActiveLayer | null) {
  const policy = geometryToolPolicy(tool);
  return Boolean(policy && layer && policy.layers.includes(layer));
}
