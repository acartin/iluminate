import type {
  DesignerBuildAreaForm,
  DesignerChannelForm,
  DesignerControllerForm,
  DesignerForm,
  DesignerFaceGraphicForm,
  DesignerArtworkForm,
  DesignerAlignmentMarksForm,
  DesignerLayersForm,
  DesignerPoint,
  DesignerRouteForm,
  DesignerRouteKind,
  DesignerRouteSurface,
  DesignerText,
  DesignerWorkLineForm,
  DesignerZoneForm
} from "@/lib/lighting/partitura-model";

export type DesignerTool = "select" | "move" | "path_trim" | "fillet" | "measure" | "work_line" | "image_place" | "build_area_rect" | "build_area_ellipse" | "build_area_polygon" | "build_area_bezier" | "reference_text" | "zone_rect" | "zone_ellipse" | "zone_polygon" | "zone_text" | "channel_bezier" | "face_graphic_rect" | "face_graphic_ellipse" | "face_graphic_polygon" | "face_graphic_bezier" | "face_graphic_text" | "led_string" | "data_cable" | "cut" | "pan";
export type DesignerMoveAxis = "x" | "y";
export type DesignerFilletCornerTarget = { type: "build_area" | "zone" | "channel" | "face_graphic"; id: string; cornerIndex: number };
export type DesignerRouteTerminal = { routeId: string; pointIndex: number };
export type DesignerSelection =
  | { type: "artwork"; id: string }
  | { type: "build_area"; id: string; pointIndex?: number }
  | { type: "work_line"; id: string; pointIndex?: number }
  | { type: "zone"; id: string; pointIndex?: number }
  | { type: "face_graphic"; id: string; pointIndex?: number }
  | { type: "projection"; id: string }
  | { type: "derived_geometry"; id: string }
  | { type: "text"; id: string }
  | { type: "channel"; id: string; pointIndex?: number }
  | { type: "light_source"; id: string }
  | { type: "route"; id: string; pointIndex?: number }
  | { type: "controller"; id: string }
  | null;
export type ResizeHandle = "nw" | "ne" | "sw" | "se";
export type DesignerViewport = { x: number; y: number; width: number; height: number };
export type DesignerActiveLayer = keyof DesignerLayersForm;
export type DesignerRouteSurfaceView = "rear" | "front" | "both";
export function designerAdditiveSelectionRequested(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}
export function routeMatchesSurfaceView(surface: DesignerRouteSurface | undefined, view: DesignerRouteSurfaceView) {
  return view === "both" || (surface ?? "rear") === view;
}
export type DesignerRouteDraft = { kind: DesignerRouteKind; points: DesignerPoint[]; routeId?: string };
export type DesignerShapeDraft = { target: "build_area" | "zone" | "channel" | "face_graphic" | "work_line"; mode: "straight" | "bezier"; points: DesignerPoint[]; widthMm?: number };
export type DesignerPrimitiveDraft = {
  target: "build_area" | "zone" | "face_graphic";
  shape: "rect" | "ellipse";
  start: DesignerPoint;
  bounds: { x: number; y: number; width: number; height: number };
  clientStart: DesignerPoint;
};
export type DesignerMeasurement = { start: DesignerPoint; end?: DesignerPoint; locked?: boolean };

export function designerLayerForSelection(selection: DesignerSelection): DesignerActiveLayer | null {
  if (!selection) return null;
  if (selection.type === "artwork" || selection.type === "build_area" || selection.type === "work_line") return "artwork";
  if (selection.type === "zone" || selection.type === "channel") return "zones";
  if (selection.type === "face_graphic") return "faceGraphic";
  if (selection.type === "light_source") return "lightSources";
  if (selection.type === "controller") return "hardware";
  if (selection.type === "route") return "strings";
  return null;
}

export function designerSelectionForClipTarget(designer: DesignerForm, targetId: string): DesignerSelection {
  const source = designer.lightSources.find((entry) => entry.id === targetId);
  if (source?.targetType === "zone" && designer.zones.some((zone) => zone.id === source.targetId)) {
    return { type: "zone", id: source.targetId };
  }
  if (source?.targetType === "channel" && designer.channels.some((channel) => channel.id === source.targetId)) {
    return { type: "channel", id: source.targetId };
  }
  if (designer.zones.some((zone) => zone.id === targetId)) return { type: "zone", id: targetId };
  if (designer.channels.some((channel) => channel.id === targetId)) return { type: "channel", id: targetId };
  return null;
}

export type DesignerDrag =
  | { type: "alignment-guide-move"; start: { x: number; y: number }; original: DesignerAlignmentMarksForm }
  | { type: "artwork-move"; artworkId: string; start: { x: number; y: number }; original: DesignerArtworkForm }
  | { type: "artwork-resize"; artworkId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerArtworkForm }
  | { type: "build-area-move"; buildAreaId: string; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-resize"; buildAreaId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerBuildAreaForm }
  | { type: "build-area-point"; buildAreaId: string; pointIndex: number }
  | { type: "build-area-handle"; buildAreaId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "work-line-move"; workLineId: string; start: { x: number; y: number }; original: DesignerWorkLineForm }
  | { type: "work-line-point"; workLineId: string; pointIndex: number }
  | { type: "controller-move"; start: { x: number; y: number }; originalRoutes: DesignerRouteForm[]; original: import("@/lib/lighting/partitura-model").DesignerControllerForm }
  | { type: "zone-move"; zoneId: string; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-resize"; zoneId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerZoneForm }
  | { type: "zone-point"; zoneId: string; pointIndex: number }
  | { type: "zone-handle"; zoneId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "face-graphic-move"; elementId: string; start: { x: number; y: number }; original: DesignerFaceGraphicForm }
  | { type: "face-graphic-resize"; elementId: string; handle: ResizeHandle; start: { x: number; y: number }; original: DesignerFaceGraphicForm }
  | { type: "face-graphic-point"; elementId: string; pointIndex: number }
  | { type: "face-graphic-handle"; elementId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "text-move"; textId: string; start: { x: number; y: number }; original: DesignerText }
  | { type: "channel-move"; channelId: string; start: { x: number; y: number }; original: DesignerChannelForm }
  | { type: "channel-point"; channelId: string; pointIndex: number }
  | { type: "channel-handle"; channelId: string; pointIndex: number; handle: "in" | "out" }
  | { type: "route-move"; routeId: string; start: { x: number; y: number }; original: DesignerRouteForm }
  | { type: "route-point"; routeId: string; pointIndex: number; jointGroup: DesignerRouteTerminal[]; clientStart: { x: number; y: number } }
  | { type: "pan"; start: { x: number; y: number }; original: DesignerViewport };
export type DesignerCanvasHit =
  | { type: "artwork"; id: string }
  | { type: "artwork_resize"; id: string; handle: ResizeHandle }
  | { type: "build_area"; id: string }
  | { type: "build_area_point"; id: string; pointIndex: number }
  | { type: "build_area_handle"; id: string; pointIndex: number; handle: "in" | "out" }
  | { type: "build_area_resize"; id: string; handle: ResizeHandle }
  | { type: "work_line"; id: string }
  | { type: "work_line_point"; id: string; pointIndex: number }
  | { type: "zone"; id: string }
  | { type: "zone_point"; id: string; pointIndex: number }
  | { type: "zone_handle"; id: string; pointIndex: number; handle: "in" | "out" }
  | { type: "zone_resize"; id: string; handle: ResizeHandle }
  | { type: "face_graphic"; id: string }
  | { type: "face_graphic_point"; id: string; pointIndex: number }
  | { type: "face_graphic_resize"; id: string; handle: ResizeHandle }
  | { type: "projection"; id: string }
  | { type: "derived_geometry"; id: string }
  | { type: "text"; id: string }
  | { type: "channel"; id: string }
  | { type: "channel_point"; id: string; pointIndex: number }
  | { type: "route"; id: string }
  | { type: "route_point"; id: string; pointIndex: number }
  | { type: "controller"; id: string }
  | null;

export function designerConstrainedMoveDelta(axis: DesignerMoveAxis, deltaX: number, deltaY: number, unconstrained: boolean) {
  if (unconstrained) return { x: deltaX, y: deltaY };
  return axis === "x" ? { x: deltaX, y: 0 } : { x: 0, y: deltaY };
}

/** Converts node/handle hits into their owner so Move never edits geometry. */
export function designerWholeObjectHit(hit: DesignerCanvasHit): DesignerCanvasHit {
  if (!hit) return null;
  if (hit.type === "artwork_resize") return { type: "artwork", id: hit.id };
  if (hit.type === "build_area_point" || hit.type === "build_area_handle" || hit.type === "build_area_resize") return { type: "build_area", id: hit.id };
  if (hit.type === "work_line_point") return { type: "work_line", id: hit.id };
  if (hit.type === "zone_point" || hit.type === "zone_handle" || hit.type === "zone_resize") return { type: "zone", id: hit.id };
  if (hit.type === "face_graphic_point" || hit.type === "face_graphic_resize") return { type: "face_graphic", id: hit.id };
  if (hit.type === "channel_point") return { type: "channel", id: hit.id };
  if (hit.type === "route_point") return { type: "route", id: hit.id };
  return hit;
}
export type DesignerRouteSummary = { lengthCm: number; pixels: number; leds: number };
export type PaperApi = typeof import("paper");
export type PaperPoint = InstanceType<PaperApi["Point"]>;
export type PaperRectangle = InstanceType<PaperApi["Rectangle"]>;

declare global {
  interface Window {
    paper?: PaperApi;
  }
}
