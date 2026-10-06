import type { DesignerContour, DesignerFaceGraphicPassMode, DesignerForm, DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";
import { resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { designerFontResource } from "@/lib/lighting/designer-font-catalog";
import { designerTextToGeometry } from "@/lib/lighting/designer-text-geometry";
import { channelBorderPolylines, channelIsClosed, openChannelOutline, pointInPolygon, shapeOutlinePoints } from "../designer-geometry";
import { validateDesignerGeometryTopology } from "../geometry/designer-geometry-boolean";

export type FabricationExportFormat = "svg" | "dxf";
export type FabricationLayer = "reference" | "zones" | "faceGraphic";

export type FabricationExportOptions = {
  includeReference: boolean;
  includeZones: boolean;
  includeFaceGraphic: boolean;
  flattenToleranceMm: number;
  minimumFeatureMm: number;
};

export const DEFAULT_FABRICATION_EXPORT_OPTIONS: FabricationExportOptions = {
  includeReference: true,
  includeZones: true,
  includeFaceGraphic: true,
  flattenToleranceMm: 0.1,
  minimumFeatureMm: 0.5
};

export type FabricationExportIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  objectId?: string;
};

export type FabricationExportResult = {
  svg: string;
  dxf: string;
  sourceChecksum: string;
  issues: FabricationExportIssue[];
  pathCount: number;
  layerCount: number;
};

type FabricationIdentity = {
  projectId: string;
  partituraId: string;
  partituraKey: string;
  partituraName: string;
};

type FabricationPath = {
  id: string;
  name: string;
  layer: FabricationLayer;
  groupName: string;
  geometry: DesignerGeometry;
  passMode?: DesignerFaceGraphicPassMode;
  filterColor?: string;
};

export async function generateDesignerFabricationExport(args: {
  designer: DesignerForm;
  identity: FabricationIdentity;
  sourceDocument: unknown;
  fontDataById?: Map<string, ArrayBuffer>;
  options?: Partial<FabricationExportOptions>;
  generatedAt?: string;
}): Promise<FabricationExportResult> {
  const options = { ...DEFAULT_FABRICATION_EXPORT_OPTIONS, ...args.options };
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceChecksum = await sha256Hex(stableJson(args.sourceDocument));
  const issues: FabricationExportIssue[] = [];
  if (!(args.designer.canvasWidthCm > 0) || !(args.designer.canvasHeightCm > 0)) {
    issues.push({ severity: "error", code: "invalid-units", message: "Fabrication canvas dimensions must be positive centimeters." });
  }
  if (!(options.flattenToleranceMm > 0)) {
    issues.push({ severity: "error", code: "invalid-tolerance", message: "DXF flattening tolerance must be greater than 0 mm." });
  }
  const paths = collectFabricationPaths(args.designer, args.fontDataById ?? new Map(), options, issues);
  paths.forEach((path) => validateFabricationPath(path, args.designer, options, issues));
  if (!paths.length) issues.push({ severity: "error", code: "empty-output", message: "No manufacturing geometry is enabled for export." });
  const svg = serializeSvg(paths, args.designer, args.identity, generatedAt, sourceChecksum);
  const dxf = serializeDxf(paths, args.designer, args.identity, generatedAt, sourceChecksum, options.flattenToleranceMm);
  return { svg, dxf, sourceChecksum, issues: deduplicateIssues(issues), pathCount: paths.length, layerCount: new Set(paths.map((path) => path.groupName)).size };
}

function collectFabricationPaths(designer: DesignerForm, fontDataById: Map<string, ArrayBuffer>, options: FabricationExportOptions, issues: FabricationExportIssue[]) {
  const paths: FabricationPath[] = [];
  const canonical = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
  const enabled = (layer: FabricationLayer) => layer === "reference" ? options.includeReference : layer === "zones" ? options.includeZones : options.includeFaceGraphic;
  const nativeGeometry = (record: { id: string; geometryId?: string; shape: "rect" | "ellipse" | "polygon"; x: number; y: number; width: number; height: number; points?: DesignerPoint[]; contours?: DesignerContour[]; pathMode?: "straight" | "bezier"; fillRule?: "nonzero" | "evenodd" }, prefix: string): DesignerGeometry => {
    const stored = record.geometryId ? canonical.get(record.geometryId) : null;
    if (stored) return stored;
    return {
      id: record.geometryId ?? `${prefix}_${record.id}`,
      kind: record.shape === "polygon" ? "path" : record.shape,
      x: record.x, y: record.y, width: record.width, height: record.height,
      points: record.points, contours: record.contours, pathMode: record.pathMode,
      closed: true, fillRule: record.fillRule ?? "nonzero"
    };
  };
  if (enabled("reference")) {
    designer.buildAreas.forEach((item) => paths.push({ id: item.id, name: item.name, layer: "reference", groupName: "REFERENCE", geometry: nativeGeometry(item, "geometry_build_area") }));
  }
  if (enabled("zones")) {
    designer.zones.forEach((item) => paths.push({ id: item.id, name: item.name, layer: "zones", groupName: "DIFFUSORS_ZONES", geometry: nativeGeometry(item, "geometry_zone") }));
    designer.channels.forEach((channel) => {
      const borders = channelIsClosed(channel) ? channelBorderPolylines(channel) : null;
      const outline = borders ? borders.left : openChannelOutline(channel);
      if (outline.length < 3 || (borders && borders.right.length < 3)) {
        issues.push({ severity: "error", code: "open-profile", objectId: channel.id, message: `${channel.name} cannot produce a closed channel outline.` });
        return;
      }
      paths.push({
        id: channel.id,
        name: channel.name,
        layer: "zones",
        groupName: "DIFFUSORS_CHANNELS",
        geometry: borders
          ? geometryFromContours(`fabrication_channel_${channel.id}`, [borders.left, borders.right])
          : geometryFromPolyline(`fabrication_channel_${channel.id}`, outline)
      });
    });
  }
  if (enabled("faceGraphic")) {
    designer.faceGraphics.forEach((item) => paths.push({
      id: item.id,
      name: item.name,
      layer: "faceGraphic",
      groupName: faceGraphicGroup(item.passMode, item.filterColor),
      geometry: nativeGeometry(item, "geometry_face_graphic"),
      passMode: item.passMode,
      filterColor: normalizeColor(item.filterColor)
    }));
  }
  designer.derivedGeometries.filter((operation) => enabled(operation.targetLayer)).forEach((operation) => {
    const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
    if (!resolved.geometry) {
      issues.push({ severity: "error", code: `derived-${resolved.issue ?? "broken"}`, objectId: operation.id, message: `${operation.name} cannot be resolved for fabrication.` });
      return;
    }
    paths.push({
      id: operation.id,
      name: operation.name,
      layer: operation.targetLayer,
      groupName: operation.targetLayer === "reference" ? "REFERENCE_DERIVED" : operation.targetLayer === "zones" ? "DIFFUSORS_DERIVED" : faceGraphicGroup(operation.passMode ?? "translucent", operation.filterColor ?? "#FFFFFF"),
      geometry: resolved.geometry,
      ...(operation.targetLayer === "faceGraphic" ? { passMode: operation.passMode ?? "translucent" as const, filterColor: normalizeColor(operation.filterColor ?? "#FFFFFF") } : {})
    });
  });
  designer.projections.forEach((projection) => {
    const resolved = resolveDesignerProjectionGeometry(designer, projection.id);
    if (resolved.issue) issues.push({ severity: "warning", code: `projection-${resolved.issue}`, objectId: projection.id, message: `${projection.name} is a broken construction reference and was excluded.` });
  });
  designer.texts.filter((text) => enabled(text.targetLayer)).forEach((text) => {
    const resource = designerFontResource(text.fontId);
    const fontData = fontDataById.get(text.fontId);
    if (!resource || resource.hash !== text.fontHash || !fontData) {
      issues.push({ severity: "error", code: "unresolved-font", objectId: text.id, message: `${text.name} cannot be outlined because its controlled font is unresolved.` });
      return;
    }
    const geometry = designerTextToGeometry(text, fontData.slice(0), `fabrication_text_${text.id}`);
    if (!geometry) {
      issues.push({ severity: "warning", code: "empty-text", objectId: text.id, message: `${text.name} contains no visible glyphs and was excluded.` });
      return;
    }
    paths.push({
      id: text.id,
      name: text.name,
      layer: text.targetLayer,
      groupName: text.targetLayer === "reference" ? "REFERENCE_TEXT" : text.targetLayer === "zones" ? "DIFFUSORS_TEXT" : faceGraphicGroup("translucent", "#FFFFFF"),
      geometry,
      ...(text.targetLayer === "faceGraphic" ? { passMode: "translucent" as const, filterColor: "#FFFFFF" } : {})
    });
  });
  return paths;
}

function validateFabricationPath(path: FabricationPath, designer: DesignerForm, options: FabricationExportOptions, issues: FabricationExportIssue[]) {
  validateDesignerGeometryTopology(path.geometry).forEach((issue) => issues.push({
    severity: "error",
    code: issue,
    objectId: path.id,
    message: `${path.name} has ${issue.replaceAll("-", " ")} geometry.`
  }));
  if (compoundContoursIntersect(path.geometry)) issues.push({ severity: "error", code: "invalid-hole", objectId: path.id, message: `${path.name} has intersecting compound contours.` });
  const epsilon = 1e-6;
  if (path.geometry.x < -epsilon || path.geometry.y < -epsilon || path.geometry.x + path.geometry.width > designer.canvasWidthCm + epsilon || path.geometry.y + path.geometry.height > designer.canvasHeightCm + epsilon) {
    issues.push({ severity: "warning", code: "outside-fabrication-area", objectId: path.id, message: `${path.name} extends outside the ${formatNumber(designer.canvasWidthCm * 10)} × ${formatNumber(designer.canvasHeightCm * 10)} mm fabrication area.` });
  }
  const minimumCm = Math.max(0, options.minimumFeatureMm) / 10;
  if (minimumCm > 0 && (path.geometry.width < minimumCm || path.geometry.height < minimumCm)) {
    issues.push({ severity: "warning", code: "small-feature", objectId: path.id, message: `${path.name} is smaller than the ${formatNumber(options.minimumFeatureMm)} mm fabrication guidance.` });
  }
}

function serializeSvg(paths: FabricationPath[], designer: DesignerForm, identity: FabricationIdentity, generatedAt: string, checksum: string) {
  const widthMm = designer.canvasWidthCm * 10;
  const heightMm = designer.canvasHeightCm * 10;
  const groups = groupPaths(paths);
  const metadata = escapeXml(JSON.stringify({ ...identity, generatedAt, sourceChecksum: `sha256:${checksum}`, units: "mm", scale: "1:1" }));
  const body = Array.from(groups.entries()).map(([groupName, entries]) => {
    const representative = entries[0];
    const attributes = representative.passMode
      ? ` data-pass-mode="${representative.passMode}" data-filter-color="${escapeXml(representative.filterColor ?? "#FFFFFF")}"`
      : "";
    const stroke = representative.passMode === "translucent" ? normalizeColor(representative.filterColor ?? "#FFFFFF") : representative.passMode === "clear" ? "#00AEEF" : "#000000";
    const elements = entries.map((path) => `    <path id="${escapeXml(svgId(path.id))}" data-name="${escapeXml(path.name)}" d="${geometryToSvgPath(path.geometry)}" fill="none" fill-rule="${path.geometry.fillRule ?? "nonzero"}" stroke="${stroke}" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`).join("\n");
    return `  <g id="${escapeXml(svgId(groupName))}" data-designer-layer="${representative.layer}" data-operation="${escapeXml(groupName)}"${attributes}>\n${elements}\n  </g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(widthMm)}mm" height="${formatNumber(heightMm)}mm" viewBox="0 0 ${formatNumber(widthMm)} ${formatNumber(heightMm)}">\n  <title>${escapeXml(identity.partituraName)} · Fabrication</title>\n  <metadata>${metadata}</metadata>\n${body}\n</svg>\n`;
}

function serializeDxf(paths: FabricationPath[], designer: DesignerForm, identity: FabricationIdentity, generatedAt: string, checksum: string, toleranceMm: number) {
  const layers = Array.from(new Set(paths.map((path) => dxfLayerName(path.groupName))));
  const lines: Array<string | number> = [
    0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1024", 9, "$INSUNITS", 70, 4,
    9, "$EXTMIN", 10, 0, 20, 0, 9, "$EXTMAX", 10, formatNumber(designer.canvasWidthCm * 10), 20, formatNumber(designer.canvasHeightCm * 10),
    999, `Iluminate ${identity.partituraKey} | ${generatedAt} | sha256:${checksum}`,
    0, "ENDSEC", 0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, layers.length
  ];
  layers.forEach((layer, index) => lines.push(0, "LAYER", 2, layer, 70, 0, 62, 1 + index % 7, 6, "CONTINUOUS"));
  lines.push(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
  paths.forEach((path) => {
    flattenGeometryMm(path.geometry, toleranceMm).forEach((contour) => {
      if (contour.length < 3) return;
      lines.push(0, "LWPOLYLINE", 100, "AcDbEntity", 8, dxfLayerName(path.groupName), 100, "AcDbPolyline", 90, contour.length, 70, 1);
      // Designer/SVG coordinates grow downward from the top-left. DXF/CAD
      // coordinates grow upward, so mirror around the physical canvas height
      // to preserve the authored orientation without changing scale.
      contour.forEach((point) => lines.push(10, formatNumber(point.x), 20, formatNumber(designer.canvasHeightCm * 10 - point.y)));
    });
  });
  lines.push(0, "ENDSEC", 0, "EOF");
  return `${lines.join("\n")}\n`;
}

function geometryToSvgPath(geometry: DesignerGeometry) {
  if (geometry.kind === "rect") return `M ${mm(geometry.x)} ${mm(geometry.y)} H ${mm(geometry.x + geometry.width)} V ${mm(geometry.y + geometry.height)} H ${mm(geometry.x)} Z`;
  if (geometry.kind === "ellipse") {
    const rx = geometry.width * 5;
    const ry = geometry.height * 5;
    const cx = geometry.x * 10 + rx;
    const cy = geometry.y * 10 + ry;
    return `M ${formatNumber(cx - rx)} ${formatNumber(cy)} A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx + rx)} ${formatNumber(cy)} A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx - rx)} ${formatNumber(cy)} Z`;
  }
  return geometryContours(geometry).map((contour) => contourToSvgPath(contour)).join(" ");
}

function contourToSvgPath(contour: DesignerContour) {
  if (!contour.points.length) return "";
  const commands = [`M ${mm(contour.points[0].x)} ${mm(contour.points[0].y)}`];
  contour.points.forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    if (contour.pathMode === "bezier" && (start.handleOut || end.handleIn)) {
      commands.push(`C ${mm(start.x + (start.handleOut?.x ?? 0))} ${mm(start.y + (start.handleOut?.y ?? 0))} ${mm(end.x + (end.handleIn?.x ?? 0))} ${mm(end.y + (end.handleIn?.y ?? 0))} ${mm(end.x)} ${mm(end.y)}`);
    } else commands.push(`L ${mm(end.x)} ${mm(end.y)}`);
  });
  commands.push("Z");
  return commands.join(" ");
}

function flattenGeometryMm(geometry: DesignerGeometry, toleranceMm: number): DesignerPoint[][] {
  if (geometry.kind === "rect") return [[
    { x: geometry.x * 10, y: geometry.y * 10 },
    { x: (geometry.x + geometry.width) * 10, y: geometry.y * 10 },
    { x: (geometry.x + geometry.width) * 10, y: (geometry.y + geometry.height) * 10 },
    { x: geometry.x * 10, y: (geometry.y + geometry.height) * 10 }
  ]];
  if (geometry.kind === "ellipse") {
    const rx = geometry.width * 5;
    const ry = geometry.height * 5;
    const radius = Math.max(rx, ry);
    const steps = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - Math.max(0.001, toleranceMm) / Math.max(radius, 0.001)))));
    return [Array.from({ length: steps }, (_, index) => ({
      x: geometry.x * 10 + rx + Math.cos(index * Math.PI * 2 / steps) * rx,
      y: geometry.y * 10 + ry + Math.sin(index * Math.PI * 2 / steps) * ry
    }))];
  }
  return geometryContours(geometry).map((contour) => flattenContourMm(contour, toleranceMm));
}

function flattenContourMm(contour: DesignerContour, toleranceMm: number) {
  if (!contour.points.length) return [];
  const output: DesignerPoint[] = [{ x: contour.points[0].x * 10, y: contour.points[0].y * 10 }];
  contour.points.forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    if (contour.pathMode !== "bezier" || (!start.handleOut && !end.handleIn)) {
      if (index < contour.points.length - 1) output.push({ x: end.x * 10, y: end.y * 10 });
      return;
    }
    flattenCubic(
      { x: start.x * 10, y: start.y * 10 },
      { x: (start.x + (start.handleOut?.x ?? 0)) * 10, y: (start.y + (start.handleOut?.y ?? 0)) * 10 },
      { x: (end.x + (end.handleIn?.x ?? 0)) * 10, y: (end.y + (end.handleIn?.y ?? 0)) * 10 },
      { x: end.x * 10, y: end.y * 10 },
      Math.max(0.001, toleranceMm), output, 0
    );
    if (index === contour.points.length - 1) output.pop();
  });
  return output;
}

function flattenCubic(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint, tolerance: number, output: DesignerPoint[], depth: number) {
  const flatness = Math.max(pointLineDistance(b, a, d), pointLineDistance(c, a, d));
  if (flatness <= tolerance || depth >= 14) {
    output.push(d);
    return;
  }
  const ab = midpoint(a, b); const bc = midpoint(b, c); const cd = midpoint(c, d);
  const abc = midpoint(ab, bc); const bcd = midpoint(bc, cd); const center = midpoint(abc, bcd);
  flattenCubic(a, ab, abc, center, tolerance, output, depth + 1);
  flattenCubic(center, bcd, cd, d, tolerance, output, depth + 1);
}

function compoundContoursIntersect(geometry: DesignerGeometry) {
  const contours = geometryContours(geometry).map((contour) => shapeOutlinePoints({ shape: "polygon", points: contour.points, pathMode: contour.pathMode }));
  for (let leftIndex = 0; leftIndex < contours.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < contours.length; rightIndex += 1) {
      const left = contours[leftIndex]; const right = contours[rightIndex];
      if (polygonEdgesIntersect(left, right)) return true;
      // Disjoint outlines and properly nested holes are both valid.
      if (left[0] && right[0] && pointInPolygon(left[0], right) && pointInPolygon(right[0], left)) return true;
    }
  }
  return false;
}

function polygonEdgesIntersect(left: DesignerPoint[], right: DesignerPoint[]) {
  for (let a = 0; a < left.length; a += 1) for (let b = 0; b < right.length; b += 1) {
    if (segmentsProperlyIntersect(left[a], left[(a + 1) % left.length], right[b], right[(b + 1) % right.length])) return true;
  }
  return false;
}

function segmentsProperlyIntersect(a: DesignerPoint, b: DesignerPoint, c: DesignerPoint, d: DesignerPoint) {
  const cross = (p: DesignerPoint, q: DesignerPoint, r: DesignerPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < -1e-10 && cdA * cdB < -1e-10;
}

function geometryContours(geometry: DesignerGeometry): DesignerContour[] {
  if (geometry.contours?.length) return geometry.contours;
  if (!geometry.points?.length) return [];
  return [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: true }];
}

function geometryFromPolyline(id: string, points: DesignerPoint[]): DesignerGeometry {
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  return { id, kind: "path", x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), points, pathMode: "straight", closed: true, fillRule: "nonzero" };
}

function geometryFromContours(id: string, contours: DesignerPoint[][]): DesignerGeometry {
  const points = contours.flat();
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  return {
    id, kind: "path", x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    points: contours[0], contours: contours.map((contour) => ({ points: contour, pathMode: "straight", closed: true })),
    pathMode: "straight", closed: true, fillRule: "evenodd"
  };
}

function faceGraphicGroup(passMode: DesignerFaceGraphicPassMode, filterColor: string) {
  return `FACE_${passMode.toUpperCase()}${passMode === "translucent" ? `_${normalizeColor(filterColor).slice(1)}` : ""}`;
}

function groupPaths(paths: FabricationPath[]) {
  const groups = new Map<string, FabricationPath[]>();
  paths.forEach((path) => groups.set(path.groupName, [...(groups.get(path.groupName) ?? []), path]));
  return groups;
}

function dxfLayerName(value: string) { return value.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 64); }
function svgId(value: string) { return value.replace(/[^A-Za-z0-9_.:-]+/g, "_"); }
function normalizeColor(value: string) { return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "#FFFFFF"; }
function mm(valueCm: number) { return formatNumber(valueCm * 10); }
function formatNumber(value: number) { return Number(value.toFixed(6)).toString(); }
function midpoint(a: DesignerPoint, b: DesignerPoint) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function pointLineDistance(point: DesignerPoint, start: DesignerPoint, end: DesignerPoint) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return length < 1e-9 ? Math.hypot(point.x - start.x, point.y - start.y) : Math.abs((end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x) / length;
}
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function deduplicateIssues(issues: FabricationExportIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => { const key = `${issue.severity}:${issue.code}:${issue.objectId ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
