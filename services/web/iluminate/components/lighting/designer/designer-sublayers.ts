import type { DesignerForm, DesignerSublayerForm, DesignerSublayerScope } from "@/lib/lighting/partitura-model";

/** Insert a duplicate directly above its source in the Layers row order. */
export function insertDesignerCopyAbove<T extends { id: string }>(items: T[], sourceId: string, copy: T) {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0) return [...items, copy];
  return [...items.slice(0, sourceIndex), copy, ...items.slice(sourceIndex)];
}

/** Keep a duplicate beside its source when the source belongs to a user sublayer. */
export function inheritDesignerSublayerForCopy(
  sublayers: DesignerSublayerForm[],
  scope: DesignerSublayerScope,
  sourceId: string,
  copyId: string
) {
  return sublayers.map((sublayer) => {
    if (sublayer.scope !== scope) return sublayer;
    const sourceIndex = sublayer.objectIds.indexOf(sourceId);
    if (sourceIndex < 0) return sublayer;
    return {
      ...sublayer,
      objectIds: [
        ...sublayer.objectIds.slice(0, sourceIndex),
        copyId,
        ...sublayer.objectIds.slice(sourceIndex)
      ]
    };
  });
}

export function designerSublayersInScope(designer: DesignerForm, scope: DesignerSublayerScope) {
  return designer.sublayers.filter((sublayer) => sublayer.scope === scope);
}

export function designerSublayerForObject(
  designer: DesignerForm,
  scope: DesignerSublayerScope,
  objectId: string
) {
  return designer.sublayers.find((sublayer) => sublayer.scope === scope && sublayer.objectIds.includes(objectId));
}

export function nextDesignerSublayer(
  designer: DesignerForm,
  scope: DesignerSublayerScope,
  objectIds: string[] = []
): DesignerSublayerForm {
  const usedIds = new Set(designer.sublayers.map((entry) => entry.id));
  const usedNames = new Set(designer.sublayers.filter((entry) => entry.scope === scope).map((entry) => entry.name.toLowerCase()));
  let number = designer.sublayers.length + 1;
  while (usedIds.has(`sublayer_${number}`)) number += 1;
  let nameNumber = designer.sublayers.filter((entry) => entry.scope === scope).length + 1;
  while (usedNames.has(`sublayer ${nameNumber}`)) nameNumber += 1;
  return {
    id: `sublayer_${number}`,
    name: `Sublayer ${nameNumber}`,
    scope,
    visible: true,
    locked: false,
    objectIds: Array.from(new Set(objectIds))
  };
}

export function assignDesignerObjectsToSublayer(
  sublayers: DesignerSublayerForm[],
  scope: DesignerSublayerScope,
  objectIds: string[],
  targetId: string | null
) {
  const moving = new Set(objectIds);
  return sublayers.map((sublayer) => {
    if (sublayer.scope !== scope) return sublayer;
    const remaining = sublayer.objectIds.filter((id) => !moving.has(id));
    return sublayer.id === targetId
      ? { ...sublayer, objectIds: [...remaining, ...objectIds.filter((id) => !remaining.includes(id))] }
      : { ...sublayer, objectIds: remaining };
  });
}

export function removeDesignerSublayer(sublayers: DesignerSublayerForm[], sublayerId: string) {
  return sublayers.filter((entry) => entry.id !== sublayerId);
}

/**
 * Produces a presentation copy for Design. Authored object eyes/locks remain in
 * the source document, so hiding a sublayer never destroys a child's state.
 */
export function designerWithSublayerMasks(designer: DesignerForm): DesignerForm {
  const state = (scope: DesignerSublayerScope, id: string) => {
    const system = scope === "faceGraphic" ? null : designer.systemSublayers[scope];
    const sublayer = designerSublayerForObject(designer, scope, id);
    return {
      visible: system?.visible !== false && sublayer?.visible !== false,
      locked: system?.locked === true || sublayer?.locked === true
    };
  };
  const geometryScope = (targetLayer: "reference" | "zones" | "faceGraphic"): DesignerSublayerScope => targetLayer;
  return {
    ...designer,
    artwork: designer.artwork.map((entry) => {
      const mask = state("artwork", entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    buildAreas: designer.buildAreas.map((entry) => {
      const mask = state("reference", entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    zones: designer.zones.map((entry) => {
      const mask = state("zones", entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    channels: designer.channels.map((entry) => {
      const mask = state("channels", entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    faceGraphics: designer.faceGraphics.map((entry) => {
      const mask = state("faceGraphic", entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    texts: designer.texts.map((entry) => {
      const mask = state(geometryScope(entry.targetLayer), entry.id);
      return { ...entry, visible: entry.visible && mask.visible, locked: entry.locked || mask.locked };
    }),
    projections: designer.projections.map((entry) => {
      const mask = state(geometryScope(entry.targetLayer), entry.id);
      return { ...entry, visible: entry.visible && mask.visible };
    }),
    derivedGeometries: designer.derivedGeometries.map((entry) => {
      const mask = state(geometryScope(entry.targetLayer), entry.id);
      return { ...entry, visible: entry.visible && mask.visible };
    }),
    routes: designer.routes.map((entry) => {
      const mask = state(entry.kind === "data_cable" ? "dataCables" : "strings", entry.id);
      return { ...entry, visible: entry.visible !== false && mask.visible, locked: entry.locked === true || mask.locked };
    })
  };
}

/** Restore authored eye/lock values after the canvas edits a masked copy. */
export function restoreDesignerSublayerAuthoredState(base: DesignerForm, changed: DesignerForm): DesignerForm {
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((entry) => [entry.id, entry]));
  const artwork = byId(base.artwork);
  const references = byId(base.buildAreas);
  const zones = byId(base.zones);
  const faceGraphics = byId(base.faceGraphics);
  const texts = byId(base.texts);
  const projections = byId(base.projections);
  const derivedGeometries = byId(base.derivedGeometries);
  const channels = byId(base.channels);
  const routes = byId(base.routes);
  return {
    ...changed,
    systemSublayers: base.systemSublayers,
    sublayers: base.sublayers,
    artwork: changed.artwork.map((entry) => artwork.has(entry.id) ? { ...entry, visible: artwork.get(entry.id)!.visible, locked: artwork.get(entry.id)!.locked } : entry),
    buildAreas: changed.buildAreas.map((entry) => references.has(entry.id) ? { ...entry, visible: references.get(entry.id)!.visible, locked: references.get(entry.id)!.locked } : entry),
    zones: changed.zones.map((entry) => zones.has(entry.id) ? { ...entry, visible: zones.get(entry.id)!.visible, locked: zones.get(entry.id)!.locked } : entry),
    faceGraphics: changed.faceGraphics.map((entry) => faceGraphics.has(entry.id) ? { ...entry, visible: faceGraphics.get(entry.id)!.visible, locked: faceGraphics.get(entry.id)!.locked } : entry),
    texts: changed.texts.map((entry) => texts.has(entry.id) ? { ...entry, visible: texts.get(entry.id)!.visible, locked: texts.get(entry.id)!.locked } : entry),
    projections: changed.projections.map((entry) => projections.has(entry.id) ? { ...entry, visible: projections.get(entry.id)!.visible } : entry),
    derivedGeometries: changed.derivedGeometries.map((entry) => derivedGeometries.has(entry.id) ? { ...entry, visible: derivedGeometries.get(entry.id)!.visible } : entry),
    channels: changed.channels.map((entry) => channels.has(entry.id) ? { ...entry, visible: channels.get(entry.id)!.visible, locked: channels.get(entry.id)!.locked } : entry),
    routes: changed.routes.map((entry) => routes.has(entry.id) ? { ...entry, visible: routes.get(entry.id)!.visible, locked: routes.get(entry.id)!.locked } : entry)
  };
}
