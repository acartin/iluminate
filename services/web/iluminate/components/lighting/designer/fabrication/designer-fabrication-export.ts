import type { DesignerChannelForm, DesignerContour, DesignerFaceGraphicPassMode, DesignerForm, DesignerGeometry, DesignerPoint } from "@/lib/lighting/partitura-model";
import { resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry } from "@/lib/lighting/partitura-model";
import { designerFontResource } from "@/lib/lighting/designer-font-catalog";
import { designerTextToGeometry } from "@/lib/lighting/designer-text-geometry";
import { pointInPolygon, shapeOutlinePoints } from "../designer-geometry";
import { validateDesignerGeometryTopology } from "../geometry/designer-geometry-boolean";

export type FabricationExportFormat = "svg" | "dxf";
export type FabricationLayer = "reference" | "zones" | "channels" | "faceGraphic";

export type FabricationExportOptions = {
  includeReference: boolean;
  includeZones: boolean;
  includeChannels: boolean;
  includeFaceGraphic: boolean;
  includeAlignmentMarks: boolean;
  flattenToleranceMm: number;
  minimumFeatureMm: number;
};

export const DEFAULT_FABRICATION_EXPORT_OPTIONS: FabricationExportOptions = {
  includeReference: true,
  includeZones: true,
  includeChannels: true,
  includeFaceGraphic: true,
  includeAlignmentMarks: true,
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
  files: Array<{
    layer: FabricationLayer;
    fileSuffix: string;
    svg: string;
    dxf: string;
    pathCount: number;
  }>;
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

type FabricationContour = {
  points: DesignerPoint[];
  pathMode: "straight" | "bezier";
  closed: boolean;
};

export async function generateDesignerFabricationExport(args: {
  designer: DesignerForm;
  identity: FabricationIdentity;
  sourceDocument: unknown;
  fontDataById?: Map<string, ArrayBuffer>;
  options?: Partial<FabricationExportOptions>;
  generatedAt?: string;
}): Promise<FabricationExportResult> {
  const options = {
    ...DEFAULT_FABRICATION_EXPORT_OPTIONS,
    ...args.options,
    ...(args.options?.includeZones !== undefined && args.options.includeChannels === undefined ? { includeChannels: args.options.includeZones } : {})
  };
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
  const combinedPaths = options.includeAlignmentMarks && args.designer.alignmentMarks.enabled && paths.length
    ? [...paths, ...alignmentMarkPaths(args.designer, paths[0].layer)]
    : paths;
  const svg = serializeSvg(combinedPaths, args.designer, args.identity, generatedAt, sourceChecksum);
  const dxf = serializeDxf(combinedPaths, args.designer, args.identity, generatedAt, sourceChecksum, options.flattenToleranceMm);
  const fileSuffix: Record<FabricationLayer, string> = { reference: "reference", zones: "zones", channels: "channels-toolpath", faceGraphic: "face-graphic" };
  const files = (["reference", "zones", "channels", "faceGraphic"] as const).flatMap((layer) => {
    const layerPaths = paths.filter((path) => path.layer === layer);
    const serializedPaths = options.includeAlignmentMarks && args.designer.alignmentMarks.enabled
      ? [...layerPaths, ...alignmentMarkPaths(args.designer, layer)]
      : layerPaths;
    return layerPaths.length ? [{
      layer,
      fileSuffix: fileSuffix[layer],
      svg: serializeSvg(serializedPaths, args.designer, args.identity, generatedAt, sourceChecksum, layer),
      dxf: serializeDxf(serializedPaths, args.designer, args.identity, generatedAt, sourceChecksum, options.flattenToleranceMm, layer),
      pathCount: layerPaths.length
    }] : [];
  });
  return { svg, dxf, files, sourceChecksum, issues: deduplicateIssues(issues), pathCount: paths.length, layerCount: files.length };
}

function alignmentMarkPaths(designer: DesignerForm, layer: FabricationLayer): FabricationPath[] {
  const { originXcm, originYcm, spacingMm } = designer.alignmentMarks;
  const spacingCm = spacingMm / 10;
  const armCm = 0.5;
  const path = (id: string, name: string, points: DesignerPoint[]): FabricationPath => ({
    id: `alignment_${id}`,
    name,
    layer,
    groupName: "ALIGNMENT_GUIDES_NO_CUT",
    geometry: {
      id: `geometry_alignment_${id}`,
      kind: "path",
      x: Math.min(...points.map((point) => point.x)),
      y: Math.min(...points.map((point) => point.y)),
      width: Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
      height: Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
      points,
      pathMode: "straight",
      closed: false,
      fillRule: "nonzero"
    }
  });
  const centers = [
    { id: "origin", name: "Alignment origin", x: originXcm, y: originYcm },
    { id: "x_spacing", name: `Alignment X ${formatNumber(spacingMm)} mm`, x: originXcm + spacingCm, y: originYcm },
    { id: "y_spacing", name: `Alignment Y ${formatNumber(spacingMm)} mm`, x: originXcm, y: originYcm + spacingCm }
  ];
  return centers.flatMap((center) => [
    path(`${center.id}_horizontal`, `${center.name} horizontal`, [{ x: center.x - armCm, y: center.y }, { x: center.x + armCm, y: center.y }]),
    path(`${center.id}_vertical`, `${center.name} vertical`, [{ x: center.x, y: center.y - armCm }, { x: center.x, y: center.y + armCm }])
  ]);
}

function collectFabricationPaths(designer: DesignerForm, fontDataById: Map<string, ArrayBuffer>, options: FabricationExportOptions, issues: FabricationExportIssue[]) {
  const paths: FabricationPath[] = [];
  const canonical = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
  const enabled = (layer: FabricationLayer) => layer === "reference" ? options.includeReference : layer === "zones" ? options.includeZones : layer === "channels" ? options.includeChannels : options.includeFaceGraphic;
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
  }
  if (enabled("channels")) {
    designer.channels.forEach((channel) => {
      const geometry = channel.geometryId ? canonical.get(channel.geometryId) : null;
      if (!geometry?.points?.length && channel.points.length < 2) {
        issues.push({ severity: "error", code: "empty-toolpath", objectId: channel.id, message: `${channel.name} cannot produce a router centerline toolpath.` });
        return;
      }
      paths.push({
        id: channel.id,
        name: channel.name,
        layer: "channels",
        groupName: "CHANNEL_TOOLPATH",
        geometry: geometry ?? geometryFromChannel(channel)
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
  validateDesignerGeometryTopology(path.geometry).filter((issue) => path.layer !== "channels" || issue !== "open-profile").forEach((issue) => issues.push({
    severity: "error",
    code: issue,
    objectId: path.id,
    message: `${path.name} has ${issue.replaceAll("-", " ")} geometry.`
  }));
  if (path.layer !== "channels" && compoundContoursIntersect(path.geometry)) issues.push({ severity: "error", code: "invalid-hole", objectId: path.id, message: `${path.name} has intersecting compound contours.` });
  const epsilon = 1e-6;
  if (path.geometry.x < -epsilon || path.geometry.y < -epsilon || path.geometry.x + path.geometry.width > designer.canvasWidthCm + epsilon || path.geometry.y + path.geometry.height > designer.canvasHeightCm + epsilon) {
    issues.push({ severity: "warning", code: "outside-fabrication-area", objectId: path.id, message: `${path.name} extends outside the ${formatNumber(designer.canvasWidthCm * 10)} × ${formatNumber(designer.canvasHeightCm * 10)} mm fabrication area.` });
  }
  const minimumCm = Math.max(0, options.minimumFeatureMm) / 10;
  if (path.layer !== "channels" && minimumCm > 0 && (path.geometry.width < minimumCm || path.geometry.height < minimumCm)) {
    issues.push({ severity: "warning", code: "small-feature", objectId: path.id, message: `${path.name} is smaller than the ${formatNumber(options.minimumFeatureMm)} mm fabrication guidance.` });
  }
}

function serializeSvg(paths: FabricationPath[], designer: DesignerForm, identity: FabricationIdentity, generatedAt: string, checksum: string, outputLayer?: FabricationLayer) {
  const widthMm = designer.canvasWidthCm * 10;
  const heightMm = designer.canvasHeightCm * 10;
  const groups = groupPaths(paths);
  const metadata = escapeXml(JSON.stringify({ ...identity, generatedAt, sourceChecksum: `sha256:${checksum}`, units: "mm", scale: "1:1", ...(outputLayer ? { outputLayer } : {}) }));
  const body = Array.from(groups.entries()).map(([groupName, entries]) => {
    const representative = entries[0];
    const isAlignmentGuide = groupName === "ALIGNMENT_GUIDES_NO_CUT";
    const attributes = isAlignmentGuide
      ? ` data-purpose="alignment-calibration" data-operation-mode="no-cut" data-spacing-mm="${formatNumber(designer.alignmentMarks.spacingMm)}"`
      : representative.layer === "channels"
      ? ` data-toolpath="router-centerline"`
      : representative.passMode
      ? ` data-pass-mode="${representative.passMode}" data-filter-color="${escapeXml(representative.filterColor ?? "#FFFFFF")}"`
      : "";
    const stroke = isAlignmentGuide ? "#FF00FF" : representative.passMode === "translucent" ? normalizeColor(representative.filterColor ?? "#FFFFFF") : representative.passMode === "clear" ? "#00AEEF" : "#000000";
    const elements = entries.map((path) => `    <path id="${escapeXml(svgId(path.id))}" data-name="${escapeXml(path.name)}" d="${geometryToSvgPath(path.geometry)}" fill="none" fill-rule="${path.geometry.fillRule ?? "nonzero"}" stroke="${stroke}" stroke-width="0.1" vector-effect="non-scaling-stroke"/>`).join("\n");
    return `  <g id="${escapeXml(svgId(groupName))}" data-designer-layer="${isAlignmentGuide ? "global" : representative.layer}" data-operation="${escapeXml(groupName)}"${attributes}>\n${elements}\n  </g>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(widthMm)}mm" height="${formatNumber(heightMm)}mm" viewBox="0 0 ${formatNumber(widthMm)} ${formatNumber(heightMm)}">\n  <title>${escapeXml(identity.partituraName)} · Fabrication</title>\n  <metadata>${metadata}</metadata>\n${body}\n</svg>\n`;
}

function serializeDxf(paths: FabricationPath[], designer: DesignerForm, identity: FabricationIdentity, generatedAt: string, checksum: string, toleranceMm: number, outputLayer?: FabricationLayer) {
  const layers = Array.from(new Set(paths.map((path) => dxfLayerName(path.groupName))));
  const lines: Array<string | number> = [
    0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1024", 9, "$INSUNITS", 70, 4,
    9, "$EXTMIN", 10, 0, 20, 0, 9, "$EXTMAX", 10, formatNumber(designer.canvasWidthCm * 10), 20, formatNumber(designer.canvasHeightCm * 10),
    999, `Iluminate ${identity.partituraKey}${outputLayer ? ` | ${outputLayer}` : ""} | ${generatedAt} | sha256:${checksum}`,
    ...(paths.some((path) => path.groupName === "ALIGNMENT_GUIDES_NO_CUT") ? [999, `ALIGNMENT_GUIDES_NO_CUT | spacing=${formatNumber(designer.alignmentMarks.spacingMm)}mm | remove before machining`] : []),
    0, "ENDSEC", 0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, layers.length
  ];
  layers.forEach((layer, index) => lines.push(0, "LAYER", 2, layer, 70, 0, 62, 1 + index % 7, 6, "CONTINUOUS"));
  lines.push(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
  paths.forEach((path) => {
    flattenGeometryMm(path.geometry, toleranceMm).forEach((contour) => {
      if (contour.points.length < (contour.closed ? 3 : 2)) return;
      lines.push(0, "LWPOLYLINE", 100, "AcDbEntity", 8, dxfLayerName(path.groupName), 100, "AcDbPolyline", 90, contour.points.length, 70, contour.closed ? 1 : 0);
      // Designer/SVG coordinates grow downward from the top-left. DXF/CAD
      // coordinates grow upward, so mirror around the physical canvas height
      // to preserve the authored orientation without changing scale.
      contour.points.forEach((point) => lines.push(10, formatNumber(point.x), 20, formatNumber(designer.canvasHeightCm * 10 - point.y)));
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

function contourToSvgPath(contour: FabricationContour) {
  if (!contour.points.length) return "";
  const commands = [`M ${mm(contour.points[0].x)} ${mm(contour.points[0].y)}`];
  const segmentCount = contour.closed === false ? contour.points.length - 1 : contour.points.length;
  contour.points.slice(0, segmentCount).forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    if (contour.pathMode === "bezier" && (start.handleOut || end.handleIn)) {
      commands.push(`C ${mm(start.x + (start.handleOut?.x ?? 0))} ${mm(start.y + (start.handleOut?.y ?? 0))} ${mm(end.x + (end.handleIn?.x ?? 0))} ${mm(end.y + (end.handleIn?.y ?? 0))} ${mm(end.x)} ${mm(end.y)}`);
    } else commands.push(`L ${mm(end.x)} ${mm(end.y)}`);
  });
  if (contour.closed !== false) commands.push("Z");
  return commands.join(" ");
}

function flattenGeometryMm(geometry: DesignerGeometry, toleranceMm: number): Array<{ points: DesignerPoint[]; closed: boolean }> {
  if (geometry.kind === "rect") return [{ points: [
    { x: geometry.x * 10, y: geometry.y * 10 },
    { x: (geometry.x + geometry.width) * 10, y: geometry.y * 10 },
    { x: (geometry.x + geometry.width) * 10, y: (geometry.y + geometry.height) * 10 },
    { x: geometry.x * 10, y: (geometry.y + geometry.height) * 10 }
  ], closed: true }];
  if (geometry.kind === "ellipse") {
    const rx = geometry.width * 5;
    const ry = geometry.height * 5;
    const radius = Math.max(rx, ry);
    const steps = Math.max(16, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - Math.max(0.001, toleranceMm) / Math.max(radius, 0.001)))));
    return [{ points: Array.from({ length: steps }, (_, index) => ({
      x: geometry.x * 10 + rx + Math.cos(index * Math.PI * 2 / steps) * rx,
      y: geometry.y * 10 + ry + Math.sin(index * Math.PI * 2 / steps) * ry
    })), closed: true }];
  }
  return geometryContours(geometry).map((contour) => ({ points: flattenContourMm(contour, toleranceMm), closed: contour.closed !== false }));
}

function flattenContourMm(contour: FabricationContour, toleranceMm: number) {
  if (!contour.points.length) return [];
  const output: DesignerPoint[] = [{ x: contour.points[0].x * 10, y: contour.points[0].y * 10 }];
  const segmentCount = contour.closed === false ? contour.points.length - 1 : contour.points.length;
  contour.points.slice(0, segmentCount).forEach((start, index) => {
    const end = contour.points[(index + 1) % contour.points.length];
    if (contour.pathMode !== "bezier" || (!start.handleOut && !end.handleIn)) {
      if (contour.closed === false || index < contour.points.length - 1) output.push({ x: end.x * 10, y: end.y * 10 });
      return;
    }
    flattenCubic(
      { x: start.x * 10, y: start.y * 10 },
      { x: (start.x + (start.handleOut?.x ?? 0)) * 10, y: (start.y + (start.handleOut?.y ?? 0)) * 10 },
      { x: (end.x + (end.handleIn?.x ?? 0)) * 10, y: (end.y + (end.handleIn?.y ?? 0)) * 10 },
      { x: end.x * 10, y: end.y * 10 },
      Math.max(0.001, toleranceMm), output, 0
    );
    if (contour.closed !== false && index === contour.points.length - 1) output.pop();
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

function geometryContours(geometry: DesignerGeometry): FabricationContour[] {
  if (geometry.contours?.length) return geometry.contours;
  if (!geometry.points?.length) return [];
  return [{ points: geometry.points, pathMode: geometry.pathMode ?? "straight", closed: geometry.closed !== false }];
}

function geometryFromChannel(channel: DesignerChannelForm): DesignerGeometry {
  const boundPoints = channel.points.flatMap((point) => [
    point,
    ...(point.handleIn ? [{ x: point.x + point.handleIn.x, y: point.y + point.handleIn.y }] : []),
    ...(point.handleOut ? [{ x: point.x + point.handleOut.x, y: point.y + point.handleOut.y }] : [])
  ]);
  const xs = boundPoints.map((point) => point.x); const ys = boundPoints.map((point) => point.y);
  return {
    id: channel.geometryId ?? `fabrication_channel_${channel.id}`,
    kind: "path", x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
    points: channel.points, pathMode: channel.pathMode, closed: channel.closed, fillRule: "nonzero"
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
export async function sha256Hex(value: string | ArrayBuffer, subtleCrypto: Pick<SubtleCrypto, "digest"> | null | undefined = globalThis.crypto?.subtle) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  if (subtleCrypto) {
    const digest = await subtleCrypto.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return sha256Bytes(bytes);
}
function sha256Bytes(bytes: Uint8Array) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  const rotateRight = (word: number, count: number) => (word >>> count) | (word << (32 - count));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const sigma0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const sigma1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let a = state[0]; let b = state[1]; let c = state[2]; let d = state[3];
    let e = state[4]; let f = state[5]; let g = state[6]; let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temporary1) >>> 0; d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
function deduplicateIssues(issues: FabricationExportIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => { const key = `${issue.severity}:${issue.code}:${issue.objectId ?? ""}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
