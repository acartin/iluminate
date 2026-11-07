import type { ThreeDLayerFolder, ThreeDModelDocument } from "./contracts";

export type ThreeDLayerTarget = { type: "root" } | { type: "folder"; id: string };

export function folderForObject(document: ThreeDModelDocument, objectId: string) {
  return document.layers.folders.find((folder) => folder.objectIds.includes(objectId)) ?? null;
}

export function objectLayerState(document: ThreeDModelDocument, objectId: string) {
  const object = document.profile.contours.find((contour) => contour.id === objectId);
  const folder = folderForObject(document, objectId);
  return {
    visible: object?.visible !== false && folder?.visible !== false,
    locked: object?.locked === true || folder?.locked === true
  };
}

export function nextLayerFolder(document: ThreeDModelDocument): ThreeDLayerFolder {
  const used = new Set(document.layers.folders.map((folder) => folder.id));
  let index = document.layers.folders.length + 1;
  while (used.has(`folder-${index}`)) index += 1;
  return { id: `folder-${index}`, name: `Folder ${index}`, visible: true, locked: false, objectIds: [] };
}

export function assignObjectToLayer(
  document: ThreeDModelDocument,
  objectId: string,
  target: ThreeDLayerTarget,
  beforeObjectId?: string
) {
  document.layers.rootObjectIds = document.layers.rootObjectIds.filter((id) => id !== objectId);
  document.layers.folders.forEach((folder) => { folder.objectIds = folder.objectIds.filter((id) => id !== objectId); });
  const destination = target.type === "root"
    ? document.layers.rootObjectIds
    : document.layers.folders.find((folder) => folder.id === target.id)?.objectIds;
  if (!destination) return;
  const beforeIndex = beforeObjectId ? destination.indexOf(beforeObjectId) : -1;
  if (beforeIndex >= 0) destination.splice(beforeIndex, 0, objectId);
  else destination.push(objectId);
}

export function removeObjectFromLayers(document: ThreeDModelDocument, objectId: string) {
  document.layers.rootObjectIds = document.layers.rootObjectIds.filter((id) => id !== objectId);
  document.layers.folders.forEach((folder) => { folder.objectIds = folder.objectIds.filter((id) => id !== objectId); });
}
