import type {
  DesignerFaceGraphicForm,
  DesignerFaceGraphicPassMode,
  DesignerForm,
  DesignerOpticalTreatment,
  DesignerPoint
} from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry } from "@/lib/lighting/partitura-model";
import { pointInsideDesignerShape } from "../designer/designer-geometry";

export type DiffuserRenderSettings = {
  diffuserDistanceCm: number;
  intensity: number;
  afterZoneEffectCm: number;
  afterZoneOpacity: number;
  showOutlines: boolean;
};

export const DEFAULT_DIFFUSER_RENDER_SETTINGS: DiffuserRenderSettings = {
  diffuserDistanceCm: 10,
  intensity: 1,
  afterZoneEffectCm: 0,
  afterZoneOpacity: 0.26,
  showOutlines: true
};

export type OpticalRgb = { r: number; g: number; b: number };

/** Front preview is emissive: an unlit diffuser must not add ambient gray. */
export function frontMaterialOffStyle(material: DesignerOpticalTreatment["material"]) {
  return material === "day_night"
    ? { color: 0x171a20, alpha: 0.92 }
    : { color: 0x000000, alpha: 1 };
}

/** Pure reference implementation for the physical Face Graphic contract. */
export function applyFaceGraphicTransmission(color: OpticalRgb, passMode: DesignerFaceGraphicPassMode, filterColor = "#FFFFFF"): OpticalRgb {
  if (passMode === "opaque") return { r: 0, g: 0, b: 0 };
  if (passMode === "clear") return { ...color };
  const filter = hexToRgb(filterColor);
  return {
    r: color.r * filter.r / 255,
    g: color.g * filter.g / 255,
    b: color.b * filter.b / 255
  };
}

export function applyFaceGraphicToOpticalMode(color: OpticalRgb, opticalMode: DesignerOpticalTreatment["mode"], passMode: DesignerFaceGraphicPassMode, filterColor = "#FFFFFF") {
  return opticalMode === "front" ? applyFaceGraphicTransmission(color, passMode, filterColor) : { ...color };
}

/** The first item is visually in front. Outside a defined graphic is opaque. */
export function faceGraphicTransmissionAtPoint(faceGraphics: DesignerFaceGraphicForm[], point: DesignerPoint): { passMode: DesignerFaceGraphicPassMode; filterColor: string } | null {
  if (!faceGraphics.length) return null;
  const region = faceGraphics.find((element) => pointInsideDesignerShape(element, point));
  return region ? { passMode: region.passMode, filterColor: region.filterColor } : { passMode: "opaque", filterColor: "#000000" };
}

/** Reference mapping used by the Face Graphic filter. */
export function faceGraphicMaskUv(point: DesignerPoint, canvasSize: { width: number; height: number }) {
  return {
    x: point.x / Math.max(1, canvasSize.width),
    y: point.y / Math.max(1, canvasSize.height)
  };
}

/** Resolves physical Face Graphic regions, including live derived profiles. */
export function resolvePhysicalFaceGraphics(designer: DesignerForm): DesignerFaceGraphicForm[] {
  const derived = designer.derivedGeometries.flatMap((operation): DesignerFaceGraphicForm[] => {
    if (operation.targetLayer !== "faceGraphic" || operation.visible === false) return [];
    const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
    if (!resolved.geometry) return [];
    return [{
      id: operation.id,
      geometryId: operation.geometryId,
      name: operation.name,
      ...designerGeometryAsShape(resolved.geometry),
      passMode: operation.passMode ?? "translucent",
      filterColor: operation.filterColor ?? "#FFFFFF",
      visible: true,
      locked: true,
      opacity: 1
    }];
  });
  return [...designer.faceGraphics.filter((graphic) => graphic.visible !== false), ...derived];
}

export function orderOpticalTreatmentsForRendering(treatments: DesignerOpticalTreatment[]) {
  const renderLayer = (treatment: DesignerOpticalTreatment) => treatment.mode === "front" ? 1 : 0;
  return treatments
    .map((treatment, index) => ({ treatment, index }))
    .sort((left, right) => renderLayer(left.treatment) - renderLayer(right.treatment) || left.index - right.index)
    .map(({ treatment }) => treatment);
}

function hexToRgb(color: string): OpticalRgb {
  const normalized = color.replace("#", "");
  const expanded = normalized.length === 3 ? normalized.split("").map((value) => `${value}${value}`).join("") : normalized;
  const parsed = Number.parseInt(expanded, 16);
  return Number.isFinite(parsed) ? { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 } : { r: 255, g: 255, b: 255 };
}
