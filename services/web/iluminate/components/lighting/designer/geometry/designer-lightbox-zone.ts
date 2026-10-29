import paper from "paper";
import type { DesignerChannelForm, DesignerContour, DesignerGeometry, DesignerPoint, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape } from "@/lib/lighting/partitura-model";
import { pointInsideDesignerShape } from "../designer-geometry";
import { resolveChannelOutlineContours } from "../rendering/channel-swept-outline";
import { validateDesignerGeometryTopology } from "./designer-geometry-boolean";

const lightboxPaperScope = new paper.PaperScope();
lightboxPaperScope.setup(new lightboxPaperScope.Size(1, 1));

export type DesignerLightboxProfile = {
  name: string;
  geometry: DesignerGeometry;
};

export type DesignerLightboxZoneIssue = "open-channel" | "collapsed-channel" | "missing-profile";

export type DesignerLightboxZoneResult = {
  zone: DesignerZoneForm | null;
  profileName?: string;
  internalChannelIds?: string[];
  issue?: DesignerLightboxZoneIssue;
};

/**
 * Materializes the optical region enclosed by a closed Channel. The smallest
 * closed profile containing the complete physical Channel footprint supplies
 * the stable operator-facing name. Closed Channels fully contained by that
 * region on the same fabrication surface are materialized as holes using their
 * complete physical footprint; no live dependency is retained.
 */
export function generateDesignerLightboxZone(
  channel: DesignerChannelForm,
  profiles: DesignerLightboxProfile[],
  zoneId: string,
  existingZoneNames: string[],
  candidateChannels: DesignerChannelForm[] = []
): DesignerLightboxZoneResult {
  if (!channel.closed) return { zone: null, issue: "open-channel" };
  const contours = resolveChannelOutlineContours(channel);
  if (contours.length !== 2) return { zone: null, issue: "collapsed-channel" };

  const rankedContours = contours
    .map((contour) => ({ contour, area: contourArea(contour) }))
    .sort((left, right) => right.area - left.area);
  const outerContour = rankedContours[0].contour;
  const innerContour = rankedContours[1].contour;
  if (rankedContours[1].area <= 1e-6) return { zone: null, issue: "collapsed-channel" };

  const profile = profiles
    .filter(({ geometry }) => !validateDesignerGeometryTopology(geometry).length)
    .filter(({ geometry }) => contourInsideGeometry(outerContour, geometry))
    .sort((left, right) => geometryArea(left.geometry) - geometryArea(right.geometry))[0];
  if (!profile) return { zone: null, issue: "missing-profile" };

  const internalChannels = candidateChannels.flatMap((candidate) => {
    if (candidate.id === channel.id || !candidate.closed || candidate.fabricationSurface !== channel.fabricationSurface) return [];
    const candidateContours = resolveChannelOutlineContours(candidate)
      .map((contour) => ({ contour, area: contourArea(contour) }))
      .sort((left, right) => right.area - left.area);
    if (candidateContours.length !== 2 || candidateContours[1].area <= 1e-6) return [];
    return contourStrictlyInsideContour(candidateContours[0].contour, innerContour)
      ? [{ id: candidate.id, contour: candidateContours[0].contour }]
      : [];
  });
  const zoneContours = [innerContour, ...internalChannels.map(({ contour }) => contour)].map(cloneContour);
  const bounds = contourBounds(innerContour);
  const name = uniqueLightboxZoneName(profile.name, existingZoneNames);
  return {
    profileName: profile.name,
    internalChannelIds: internalChannels.map(({ id }) => id),
    zone: {
      id: zoneId,
      geometryId: `geometry_zone_${zoneId}`,
      name,
      shape: "polygon",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      points: innerContour.points.map(clonePoint),
      contours: zoneContours,
      pathMode: innerContour.pathMode,
      fillRule: "evenodd",
      visible: true,
      locked: false,
      opacity: 1
    }
  };
}

export function uniqueLightboxZoneName(profileName: string, existingZoneNames: string[]) {
  const base = `${profileName.trim() || "Zone"} lightbox`;
  const used = new Set(existingZoneNames.map((name) => name.trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

function contourInsideGeometry(contour: DesignerContour, geometry: DesignerGeometry) {
  const shape = designerGeometryAsShape(geometry);
  return flattenContour(contour).every((point) => pointInsideDesignerShape(shape, point));
}

function contourStrictlyInsideContour(contour: DesignerContour, container: DesignerContour) {
  const candidatePath = paperPath(contour);
  const containerPath = paperPath(container);
  const intersects = containerPath.getIntersections(candidatePath).length > 0;
  const contained = !intersects && flattenContour(contour).every((point) => (
    containerPath.contains(new lightboxPaperScope.Point(point.x, point.y))
  ));
  candidatePath.remove();
  containerPath.remove();
  return contained;
}

function contourArea(contour: DesignerContour) {
  const path = paperPath(contour);
  const area = Math.abs(path.area);
  path.remove();
  return area;
}

function contourBounds(contour: DesignerContour) {
  const path = paperPath(contour);
  const bounds = path.bounds;
  const result = {
    x: roundGeometryNumber(bounds.x),
    y: roundGeometryNumber(bounds.y),
    width: Math.max(0.001, roundGeometryNumber(bounds.width)),
    height: Math.max(0.001, roundGeometryNumber(bounds.height))
  };
  path.remove();
  return result;
}

function geometryArea(geometry: DesignerGeometry) {
  if (geometry.kind !== "path") return Math.max(0, geometry.width * geometry.height);
  const contours = geometry.contours?.length
    ? geometry.contours
    : geometry.points?.length ? [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: true as const }] : [];
  return contours.reduce((total, contour) => total + contourArea(contour), 0);
}

function paperPath(contour: DesignerContour) {
  const path = new lightboxPaperScope.Path({ insert: false, closed: true });
  contour.points.forEach((point) => {
    path.add(new lightboxPaperScope.Segment(
      new lightboxPaperScope.Point(point.x, point.y),
      new lightboxPaperScope.Point(point.handleIn?.x ?? 0, point.handleIn?.y ?? 0),
      new lightboxPaperScope.Point(point.handleOut?.x ?? 0, point.handleOut?.y ?? 0)
    ));
  });
  return path;
}

function flattenContour(contour: DesignerContour) {
  if (contour.pathMode !== "bezier") return contour.points;
  const points: DesignerPoint[] = [];
  contour.points.forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    for (let step = 0; step < 16; step += 1) points.push(cubicPoint(start, end, step / 16));
  });
  return points;
}

function cubicPoint(start: DesignerPoint, end: DesignerPoint, t: number): DesignerPoint {
  const controlA = start.handleOut ? { x: start.x + start.handleOut.x, y: start.y + start.handleOut.y } : start;
  const controlB = end.handleIn ? { x: end.x + end.handleIn.x, y: end.y + end.handleIn.y } : end;
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
  };
}

function clonePoint(point: DesignerPoint): DesignerPoint {
  return {
    ...point,
    ...(point.handleIn ? { handleIn: { ...point.handleIn } } : {}),
    ...(point.handleOut ? { handleOut: { ...point.handleOut } } : {})
  };
}

function cloneContour(contour: DesignerContour): DesignerContour {
  return {
    ...contour,
    points: contour.points.map(clonePoint)
  };
}

function roundGeometryNumber(value: number) {
  return Math.round(value * 100000) / 100000;
}
