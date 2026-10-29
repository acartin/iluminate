import type {
  DesignerArtworkForm,
  DesignerChannelForm,
  DesignerFaceGraphicForm,
  DesignerForm,
  DesignerRouteForm,
  DesignerSublayerForm,
  DesignerSublayerScope,
  DesignerZoneForm
} from "@/lib/lighting/partitura-model";
import type { DesignerSelection } from "./types";
import { insertDesignerCopyAbove } from "./designer-sublayers";

type DesignerObjectClipboardType = "artwork" | "zone" | "channel" | "face_graphic" | "route";

type ClipboardBase<T extends DesignerObjectClipboardType, V> = {
  type: T;
  sourceId: string;
  source: V;
  sourceSublayerId?: string;
};

export type DesignerObjectClipboard =
  | ClipboardBase<"artwork", DesignerArtworkForm>
  | ClipboardBase<"zone", DesignerZoneForm>
  | ClipboardBase<"channel", DesignerChannelForm>
  | ClipboardBase<"face_graphic", DesignerFaceGraphicForm>
  | ClipboardBase<"route", DesignerRouteForm>;

export type DesignerObjectPasteResult = {
  designer: DesignerForm;
  selection: Exclude<DesignerSelection, null>;
};

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function clipboardScope(type: DesignerObjectClipboard["type"], source?: DesignerRouteForm): DesignerSublayerScope {
  if (type === "artwork") return "artwork";
  if (type === "zone") return "zones";
  if (type === "channel") return "channels";
  if (type === "face_graphic") return "faceGraphic";
  return source?.kind === "data_cable" ? "dataCables" : "strings";
}

function snapshotEntry<T extends DesignerObjectClipboard["type"], V>(
  designer: DesignerForm,
  type: T,
  source: V & { id: string },
  scope: DesignerSublayerScope
): ClipboardBase<T, V> {
  return {
    type,
    sourceId: source.id,
    source: cloneSnapshot(source),
    sourceSublayerId: designer.sublayers.find((entry) => entry.scope === scope && entry.objectIds.includes(source.id))?.id
  };
}

/** Captures an immutable object snapshot; later edits to the source cannot alter Paste. */
export function createDesignerObjectClipboard(designer: DesignerForm, selection: DesignerSelection): DesignerObjectClipboard | null {
  if (!selection) return null;
  if (selection.type === "artwork") {
    const source = designer.artwork.find((entry) => entry.id === selection.id);
    return source ? snapshotEntry(designer, "artwork", source, "artwork") : null;
  }
  if (selection.type === "zone") {
    const source = designer.zones.find((entry) => entry.id === selection.id);
    return source ? snapshotEntry(designer, "zone", source, "zones") : null;
  }
  if (selection.type === "channel") {
    const source = designer.channels.find((entry) => entry.id === selection.id);
    return source ? snapshotEntry(designer, "channel", source, "channels") : null;
  }
  if (selection.type === "face_graphic") {
    const source = designer.faceGraphics.find((entry) => entry.id === selection.id);
    return source ? snapshotEntry(designer, "face_graphic", source, "faceGraphic") : null;
  }
  if (selection.type === "route") {
    const source = designer.routes.find((entry) => entry.id === selection.id);
    return source ? snapshotEntry(designer, "route", source, clipboardScope("route", source)) : null;
  }
  return null;
}

export function designerObjectClipboardCompatible(clipboard: DesignerObjectClipboard | null, selection: DesignerSelection) {
  if (!clipboard || !selection) return false;
  if (clipboard.type === "zone" || clipboard.type === "channel") return selection.type === "zone" || selection.type === "channel";
  return clipboard.type === selection.type;
}

function nextCopyId(items: Array<{ id: string }>, sourceId: string) {
  const prefix = `${sourceId}_copy_`;
  const used = new Set(items.map((entry) => entry.id));
  let number = 1;
  while (used.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

function nextCopyName(items: Array<{ name: string }>, sourceName: string) {
  const base = `${sourceName} Copy`;
  const used = new Set(items.map((entry) => entry.name));
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${base} ${number}`)) number += 1;
  return `${base} ${number}`;
}

function placeCopyInCapturedSublayer(
  sublayers: DesignerSublayerForm[],
  clipboard: DesignerObjectClipboard,
  copyId: string
) {
  if (!clipboard.sourceSublayerId) return sublayers;
  const scope = clipboardScope(clipboard.type, clipboard.type === "route" ? clipboard.source : undefined);
  return sublayers.map((entry) => {
    if (entry.id !== clipboard.sourceSublayerId || entry.scope !== scope) return entry;
    const sourceIndex = entry.objectIds.indexOf(clipboard.sourceId);
    const insertAt = sourceIndex < 0 ? entry.objectIds.length : sourceIndex;
    return {
      ...entry,
      objectIds: [
        ...entry.objectIds.slice(0, insertAt),
        copyId,
        ...entry.objectIds.slice(insertAt)
      ]
    };
  });
}

function translatedPoint<T extends { x: number; y: number }>(point: T, offset: number): T {
  return { ...point, x: point.x + offset, y: point.y + offset };
}

/** Pastes exactly one snapshot into the matching collection of the current live Designer. */
export function pasteDesignerObject(designer: DesignerForm, clipboard: DesignerObjectClipboard): DesignerObjectPasteResult {
  const offset = designer.snapCm;
  if (clipboard.type === "artwork") {
    const source = cloneSnapshot(clipboard.source);
    const id = nextCopyId(designer.artwork, clipboard.sourceId);
    const copy = { ...source, id, name: nextCopyName(designer.artwork, source.name), x: source.x + offset, y: source.y + offset };
    return {
      designer: {
        ...designer,
        artwork: insertDesignerCopyAbove(designer.artwork, clipboard.sourceId, copy),
        sublayers: placeCopyInCapturedSublayer(designer.sublayers, clipboard, id)
      },
      selection: { type: "artwork", id }
    };
  }
  if (clipboard.type === "zone") {
    const source = cloneSnapshot(clipboard.source);
    const id = nextCopyId(designer.zones, clipboard.sourceId);
    const copy: DesignerZoneForm = {
      ...source,
      geometryId: undefined,
      id,
      name: nextCopyName(designer.zones, source.name),
      x: source.x + offset,
      y: source.y + offset,
      points: source.points?.map((point) => translatedPoint(point, offset)),
      contours: source.contours?.map((contour) => ({ ...contour, points: contour.points.map((point) => translatedPoint(point, offset)) }))
    };
    return {
      designer: {
        ...designer,
        zones: insertDesignerCopyAbove(designer.zones, clipboard.sourceId, copy),
        sublayers: placeCopyInCapturedSublayer(designer.sublayers, clipboard, id)
      },
      selection: { type: "zone", id }
    };
  }
  if (clipboard.type === "face_graphic") {
    const source = cloneSnapshot(clipboard.source);
    const id = nextCopyId(designer.faceGraphics, clipboard.sourceId);
    const copy: DesignerFaceGraphicForm = {
      ...source,
      geometryId: undefined,
      id,
      name: nextCopyName(designer.faceGraphics, source.name),
      x: source.x + offset,
      y: source.y + offset,
      points: source.points?.map((point) => translatedPoint(point, offset)),
      contours: source.contours?.map((contour) => ({ ...contour, points: contour.points.map((point) => translatedPoint(point, offset)) }))
    };
    return {
      designer: {
        ...designer,
        faceGraphics: insertDesignerCopyAbove(designer.faceGraphics, clipboard.sourceId, copy),
        sublayers: placeCopyInCapturedSublayer(designer.sublayers, clipboard, id)
      },
      selection: { type: "face_graphic", id }
    };
  }
  if (clipboard.type === "channel") {
    const source = cloneSnapshot(clipboard.source);
    const id = nextCopyId(designer.channels, clipboard.sourceId);
    const copy: DesignerChannelForm = {
      ...source,
      geometryId: undefined,
      id,
      name: nextCopyName(designer.channels, source.name),
      points: source.points.map((point) => translatedPoint(point, offset))
    };
    return {
      designer: {
        ...designer,
        channels: insertDesignerCopyAbove(designer.channels, clipboard.sourceId, copy),
        sublayers: placeCopyInCapturedSublayer(designer.sublayers, clipboard, id)
      },
      selection: { type: "channel", id }
    };
  }

  const source = cloneSnapshot(clipboard.source);
  const id = nextCopyId(designer.routes, clipboard.sourceId);
  const copy: DesignerRouteForm = {
    ...source,
    id,
    name: nextCopyName(designer.routes, source.name),
    points: source.points.map((point) => {
      const { joint: _joint, ...detached } = translatedPoint(point, offset);
      return detached;
    })
  };
  return {
    designer: {
      ...designer,
      routes: insertDesignerCopyAbove(designer.routes, clipboard.sourceId, copy),
      sublayers: placeCopyInCapturedSublayer(designer.sublayers, clipboard, id)
    },
    selection: { type: "route", id }
  };
}
