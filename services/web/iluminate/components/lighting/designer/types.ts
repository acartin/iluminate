import type {
  DesignerBuildAreaForm,
  DesignerControllerForm,
  DesignerArtworkForm,
  DesignerLayersForm,
  DesignerPoint,
  DesignerRouteForm,
  DesignerRouteKind,
  DesignerZoneForm
} from "@/lib/lighting/partitura-model";

export type DesignerTool = "select" | "measure" | "build_area_rect" | "build_area_ellipse" | "build_area_polygon" | "build_area_bezier" | "zone_rect" | "zone_ellipse" | "zone_polygon" | "zone_bezier" | "led_string" | "data_cable" | "cut" | "pan";
export type DesignerRouteTerminal = { routeId: string; pointIndex: number };
export type DesignerSelection =
  | { type: "artwork"; id: string }
  | { type: "build_area"; id: string; pointIndex?: number }
  | { type: "zone"; id: string; pointIndex?: number }
  | { type: "route"; id: string; pointIndex?: number }
  | { type: "controller"; id: string }
  | null;
export type ResizeHandle = "nw" | "ne" | "sw" | "se";
export type DesignerViewport = { x: number; y: number; width: number; height: number };
export type DesignerActiveLayer = keyof DesignerLayersForm;
export type DesignerRouteDraft = { kind: DesignerRouteKind; points: DesignerPoint[]; routeId?: string };
export type DesignerShapeDraft = { target: "build_area" | "zone"; mode: "straight" | "bezier"; points: DesignerPoint[] };
export type DesignerMeasurement = { start: DesignerPoint; end?: DesignerPoint; locked?: boolean };
export type DesignerDrag =
  | { type: "artwork-move"; artworkId: string; start: { x: number; y: number }; original: DesignerArtworkForm }
  | { type: "artwork-resize"; artworkId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerArtworkForm }
  | { type: "build-area-move"; buildAreaId: string; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-resize"; buildAreaId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-point"; buildAreaId: string; pointIndex: number }
  | { type: "build-area-handle"; buildAreaId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "controller-move"; start: { x: number; y: number }; originalRoutes: DesignerRouteForm[]; original: import("@/lib/lighting/partitura-model").DesignerControllerForm }
  | { type: "zone-move"; zoneId: string; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-resize"; zoneId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-point"; zoneId: string; pointIndex: number }
  | { type: "zone-handle"; zoneId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "route-move"; routeId: string; start: { x: number; y: number }; original: DesignerRouteForm }
  | { type: "route-point"; routeId: string; pointIndex: number; jointGroup: DesignerRouteTerminal[] }
  | { type: "pan"; start: { x: number; y: number }; original: DesignerViewport };
export type DesignerCanvasHit =
  | { type: "artwork"; id: string }
  | { type: "artwork_resize"; id: string; handle: ResizeHandle }
  | { type: "build_area"; id: string }
  | { type: "build_area_point"; id: string; pointIndex: number }
  | { type: "build_area_handle"; id: string; pointIndex: number; handle: "in" | "out" }
  | { type: "build_area_resize"; id: string; handle: ResizeHandle }
  | { type: "zone"; id: string }
  | { type: "zone_point"; id: string; pointIndex: number }
  | { type: "zone_handle"; id: string; pointIndex: number; handle: "in" | "out" }
  | { type: "zone_resize"; id: string; handle: ResizeHandle }
  | { type: "route"; id: string }
  | { type: "route_point"; id: string; pointIndex: number }
  | { type: "controller"; id: string }
  | null;
export type DesignerRouteSummary = { lengthCm: number; pixels: number; leds: number };
export type PaperApi = typeof import("paper");
export type PaperPoint = InstanceType<PaperApi["Point"]>;
export type PaperRectangle = InstanceType<PaperApi["Rectangle"]>;

declare global {
  interface Window {
    paper?: PaperApi;
  }
}
