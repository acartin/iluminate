import type { DesignerForm } from "@/lib/lighting/partitura-model";

export function diffusorObjectKeys(designer: DesignerForm) {
  return [
    ...designer.zones.map((item) => `zone:${item.id}`),
    ...designer.channels.map((item) => `channel:${item.id}`),
    ...designer.projections.filter((item) => item.targetLayer === "zones").map((item) => `projection:${item.id}`),
    ...designer.derivedGeometries.filter((item) => item.targetLayer === "zones").map((item) => `derived:${item.id}`),
    ...designer.texts.filter((item) => item.targetLayer === "zones").map((item) => `text:${item.id}`)
  ];
}

export function visibleDiffusorObjectKeys(designer: DesignerForm) {
  return [
    ...designer.zones.filter((item) => item.visible !== false).map((item) => `zone:${item.id}`),
    ...designer.channels.filter((item) => item.visible !== false).map((item) => `channel:${item.id}`),
    ...designer.projections.filter((item) => item.targetLayer === "zones" && item.visible !== false).map((item) => `projection:${item.id}`),
    ...designer.derivedGeometries.filter((item) => item.targetLayer === "zones" && item.visible !== false).map((item) => `derived:${item.id}`),
    ...designer.texts.filter((item) => item.targetLayer === "zones" && item.visible !== false).map((item) => `text:${item.id}`)
  ];
}

export function applyDiffusorObjectVisibility(designer: DesignerForm, visibleObjectKeys: Iterable<string>): DesignerForm {
  const visible = new Set(visibleObjectKeys);
  return {
    ...designer,
    zones: designer.zones.map((item) => ({ ...item, visible: visible.has(`zone:${item.id}`) })),
    channels: designer.channels.map((item) => ({ ...item, visible: visible.has(`channel:${item.id}`) })),
    projections: designer.projections.map((item) => item.targetLayer === "zones" ? { ...item, visible: visible.has(`projection:${item.id}`) } : item),
    derivedGeometries: designer.derivedGeometries.map((item) => item.targetLayer === "zones" ? { ...item, visible: visible.has(`derived:${item.id}`) } : item),
    texts: designer.texts.map((item) => item.targetLayer === "zones" ? { ...item, visible: visible.has(`text:${item.id}`) } : item)
  };
}

export function sameDiffusorVisibility(left: Iterable<string>, right: Iterable<string>) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && Array.from(leftSet).every((key) => rightSet.has(key));
}
