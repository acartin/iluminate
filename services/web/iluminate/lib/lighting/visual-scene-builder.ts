import {
  VISUAL_SCENE_VERSION,
  type Partitura,
  type VisualContour,
  type VisualSceneV1,
  type VisualShape
} from "@iluminate/lighting-core";
import type {
  DesignerBuildAreaForm,
  DesignerChannelForm,
  DesignerFaceGraphicForm,
  DesignerForm,
  DesignerZoneForm
} from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "@/components/lighting/designer/designer-compiler";
import { fitViewportToDesigner } from "@/components/lighting/designer/designer-geometry";
import { resolveChannelOutlineContours } from "@/components/lighting/designer/rendering/channel-swept-outline";
import { resolvePhysicalFaceGraphics } from "@/components/lighting/player/optical-model";

export function buildVisualScene(partitura: Partitura, designer: DesignerForm, layout: CompiledDesignerLayout): VisualSceneV1 {
  const indexByPixelId = new Map(partitura.pixelMap.map((pixel) => [pixel.id, pixel.index]));
  const shapes: VisualShape[] = [
    ...designer.buildAreas.filter((shape) => shape.visible).map((shape) => closedShape(shape, "build-area")),
    ...designer.zones.filter((shape) => shape.visible).map((shape) => closedShape(shape, "zone")),
    ...designer.channels.filter((shape) => shape.visible).map(channelShape),
    ...resolvePhysicalFaceGraphics(designer).map((shape) => closedShape(shape, "face-graphic"))
  ];
  const treatments = designer.lightSources
    .filter((source) => source.visible && source.enabled && designer.layers.lightSources.visible)
    .map((source) => ({
      id: source.id,
      targetType: source.targetType,
      targetId: source.targetId,
      pixelIndices: (layout.zones.find((zone) => zone.id === source.id)?.pixelIds ?? []).flatMap((pixelId) => {
        const index = indexByPixelId.get(pixelId);
        return index === undefined ? [] : [index];
      }),
      mode: source.mode,
      material: source.material,
      intensity: source.intensity,
      sourceDistanceCm: source.sourceDistanceCm,
      softnessCm: source.softnessCm,
      spreadCm: source.spreadCm,
      throwCm: source.throwCm,
      beamAngleDeg: source.beamAngleDeg,
      directionDeg: source.directionDeg,
      falloff: source.falloff,
      transmissionPct: source.transmissionPct,
      occludeSource: source.occludeSource,
      faceColor: source.faceColor
    }));
  return {
    version: VISUAL_SCENE_VERSION,
    sourceChecksum: partitura.sourceChecksum,
    bounds: { widthCm: designer.canvasWidthCm, heightCm: designer.canvasHeightCm },
    addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
    pixels: partitura.pixelMap.map(({ index, x, y, tangentDeg }) => ({ index, x, y, tangentDeg })),
    shapes,
    treatments,
    defaultCamera: fitViewportToDesigner(designer),
    presentation: {
      mode: "as_built",
      aspectRatio: designer.canvasWidthCm / Math.max(0.0001, designer.canvasHeightCm),
      background: "night"
    },
    assets: []
  };
}

type ClosedShape = DesignerBuildAreaForm | DesignerZoneForm | DesignerFaceGraphicForm;

function closedShape(shape: ClosedShape, kind: VisualShape["kind"]): VisualShape {
  const contours = shape.shape === "polygon"
    ? (shape.contours?.length ? shape.contours : [{ points: shape.points ?? [], pathMode: shape.pathMode ?? "straight" }]).map(toContour)
    : [];
  return {
    id: shape.id,
    name: shape.name,
    kind,
    primitive: shape.shape === "rect" ? "rectangle" : shape.shape === "ellipse" ? "ellipse" : "path",
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    contours,
    fillRule: shape.fillRule ?? "evenodd",
    ...(kind === "face-graphic" ? {
      passMode: (shape as DesignerFaceGraphicForm).passMode,
      filterColor: (shape as DesignerFaceGraphicForm).filterColor
    } : {})
  };
}

function channelShape(shape: DesignerChannelForm): VisualShape {
  const contours = resolveChannelOutlineContours(shape).map(toContour);
  const contourPoints = contours.flatMap((contour) => contour.points);
  const xs = contourPoints.map((point) => point.x);
  const ys = contourPoints.map((point) => point.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  return {
    id: shape.id,
    name: shape.name,
    kind: "channel",
    primitive: "path",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    contours,
    fillRule: "evenodd"
  };
}

function toContour(contour: { points: VisualContour["points"]; pathMode?: "straight" | "bezier" }): VisualContour {
  return { points: contour.points, pathMode: contour.pathMode ?? "straight" };
}
