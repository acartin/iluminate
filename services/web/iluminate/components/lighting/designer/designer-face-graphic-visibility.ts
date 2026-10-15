import type { DesignerForm } from "@/lib/lighting/partitura-model";

export function faceGraphicObjectKeys(designer: DesignerForm) {
  return [
    ...designer.faceGraphics.map((item) => `faceGraphic:${item.id}`),
    ...designer.projections.filter((item) => item.targetLayer === "faceGraphic").map((item) => `projection:${item.id}`),
    ...designer.derivedGeometries.filter((item) => item.targetLayer === "faceGraphic").map((item) => `derived:${item.id}`),
    ...designer.texts.filter((item) => item.targetLayer === "faceGraphic").map((item) => `text:${item.id}`)
  ];
}

export function visibleFaceGraphicObjectKeys(designer: DesignerForm) {
  return [
    ...designer.faceGraphics.filter((item) => item.visible !== false).map((item) => `faceGraphic:${item.id}`),
    ...designer.projections.filter((item) => item.targetLayer === "faceGraphic" && item.visible !== false).map((item) => `projection:${item.id}`),
    ...designer.derivedGeometries.filter((item) => item.targetLayer === "faceGraphic" && item.visible !== false).map((item) => `derived:${item.id}`),
    ...designer.texts.filter((item) => item.targetLayer === "faceGraphic" && item.visible !== false).map((item) => `text:${item.id}`)
  ];
}

export function applyFaceGraphicObjectVisibility(designer: DesignerForm, visibleObjectKeys: Iterable<string>): DesignerForm {
  const visible = new Set(visibleObjectKeys);
  return {
    ...designer,
    faceGraphics: designer.faceGraphics.map((item) => ({ ...item, visible: visible.has(`faceGraphic:${item.id}`) })),
    projections: designer.projections.map((item) => item.targetLayer === "faceGraphic" ? { ...item, visible: visible.has(`projection:${item.id}`) } : item),
    derivedGeometries: designer.derivedGeometries.map((item) => item.targetLayer === "faceGraphic" ? { ...item, visible: visible.has(`derived:${item.id}`) } : item),
    texts: designer.texts.map((item) => item.targetLayer === "faceGraphic" ? { ...item, visible: visible.has(`text:${item.id}`) } : item)
  };
}

export function sameFaceGraphicVisibility(left: Iterable<string>, right: Iterable<string>) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && Array.from(leftSet).every((key) => rightSet.has(key));
}
