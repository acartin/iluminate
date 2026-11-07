import paper from "paper";
import type { ModelPath, ProfileNode, ProfileVector } from "./contracts";

const viewportMarker = "__three_d_model_viewport__";
const epsilon = 1e-7;

type PointLike = { x: number; y: number; add?: (point: { x: number; y: number }) => PointLike };
type PaperVector = { x: number; y: number };
type ItemLike = {
  className?: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  clippingMask?: boolean;
  closed?: boolean;
  children?: ItemLike[];
  segments?: Array<{ point: PointLike; handleIn?: PaperVector; handleOut?: PaperVector }>;
  localToGlobal?: (point: PointLike) => { x: number; y: number };
};

function metric(value: string | null, label: string) {
  const match = value?.trim().match(/^([0-9]+(?:\.[0-9]+)?)mm$/i);
  const number = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(number) || number <= 0 || number > 2000) throw new Error(`${label} must be expressed in millimeters.`);
  return number;
}

function safeSvg(source: string) {
  if (new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024) throw new Error("SVG files are limited to 2 MB.");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") throw new Error("The file is not a valid SVG.");
  if (document.querySelector("script,style,image,foreignObject,use,text,filter,iframe") || Array.from(document.querySelectorAll("*")).some((element) => Array.from(element.attributes).some((attribute) => /^on/i.test(attribute.name) || (attribute.name !== "xmlns" && /(?:https?:|file:|data:|url\s*\()/i.test(attribute.value))))) throw new Error("The SVG contains unsupported or external content.");
  const allowed = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "title", "metadata"]);
  if (Array.from(document.querySelectorAll("*")).some((element) => !allowed.has(element.localName))) throw new Error("The SVG contains unsupported geometry.");
  const widthMm = metric(document.documentElement.getAttribute("width"), "SVG width");
  const heightMm = metric(document.documentElement.getAttribute("height"), "SVG height");
  const viewBox = document.documentElement.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error("The SVG requires a valid viewBox.");
  return { document, widthMm, heightMm, viewBox };
}

function globalPoint(item: ItemLike, point: PointLike) {
  return item.localToGlobal?.(point) ?? point;
}

function add(point: PointLike, vector: PaperVector): PointLike {
  return point.add?.(vector) ?? { x: point.x + vector.x, y: point.y + vector.y };
}

function nonzero(vector?: PaperVector) {
  return vector && (Math.abs(vector.x) > epsilon || Math.abs(vector.y) > epsilon);
}

function nodeType(handleIn?: ProfileVector, handleOut?: ProfileVector): ProfileNode["nodeType"] {
  if (!handleIn && !handleOut) return "corner";
  if (!handleIn || !handleOut) return "smooth";
  const cross = Math.abs(handleIn.xMm * handleOut.yMm - handleIn.yMm * handleOut.xMm);
  const a = Math.hypot(handleIn.xMm, handleIn.yMm);
  const b = Math.hypot(handleOut.xMm, handleOut.yMm);
  return cross <= Math.max(epsilon, a * b * 1e-5) && Math.abs(a - b) <= Math.max(epsilon, Math.max(a, b) * 1e-5) ? "symmetric" : "smooth";
}

function collect(item: ItemLike, paths: ItemLike[]) {
  if (item.name === viewportMarker || item.visible === false || item.opacity === 0 || item.clippingMask) return;
  if (item.className === "Path" && item.segments?.length) paths.push(item);
  else (item.children ?? []).forEach((child) => collect(child, paths));
}

function safeId(name: string, index: number, used: Set<string>) {
  const base = name.trim().replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^[^A-Za-z0-9_]+/, "") || `model-path-${index + 1}`;
  let id = base.slice(0, 110);
  let suffix = 2;
  while (used.has(id)) id = `${base.slice(0, 100)}-${suffix++}`;
  used.add(id);
  return id;
}

export function importSvgModelPaths(source: string, fileName: string, assetId?: string): ModelPath[] {
  const parsed = safeSvg(source);
  const marker = parsed.document.createElementNS("http://www.w3.org/2000/svg", "rect");
  marker.setAttribute("id", viewportMarker);
  marker.setAttribute("x", String(parsed.viewBox[0])); marker.setAttribute("y", String(parsed.viewBox[1]));
  marker.setAttribute("width", String(parsed.viewBox[2])); marker.setAttribute("height", String(parsed.viewBox[3]));
  marker.setAttribute("fill", "#000"); marker.setAttribute("fill-opacity", "0.000001");
  parsed.document.documentElement.prepend(marker);
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  try {
    const root = scope.project.importSVG(new XMLSerializer().serializeToString(parsed.document), { expandShapes: true, insert: false }) as unknown as ItemLike;
    const imported: ItemLike[] = [];
    collect(root, imported);
    if (!imported.length) throw new Error("The SVG does not contain usable paths.");
    if (imported.length > 128) throw new Error("SVG files are limited to 128 Model Paths.");
    const scaleX = parsed.widthMm / parsed.viewBox[2];
    const scaleY = parsed.heightMm / parsed.viewBox[3];
    const used = new Set<string>();
    return imported.map((path, index) => {
      const nodes = (path.segments ?? []).map((segment): ProfileNode => {
        const point = globalPoint(path, segment.point);
        const mapVector = (handle?: PaperVector) => {
          if (!nonzero(handle)) return undefined;
          const end = globalPoint(path, add(segment.point, handle!));
          return { xMm: (end.x - point.x) * scaleX, yMm: -(end.y - point.y) * scaleY };
        };
        const handleIn = mapVector(segment.handleIn);
        const handleOut = mapVector(segment.handleOut);
        return { xMm: (point.x - parsed.viewBox[0]) * scaleX, yMm: (parsed.viewBox[1] + parsed.viewBox[3] - point.y) * scaleY, nodeType: nodeType(handleIn, handleOut), ...(handleIn ? { handleIn } : {}), ...(handleOut ? { handleOut } : {}) };
      });
      if (nodes.length < (path.closed ? 3 : 2)) throw new Error("An imported path has too few nodes.");
      const id = safeId(path.name ?? "", index, used);
      return { id, name: path.name?.trim() || `Model Path ${index + 1}`, nodes, closed: path.closed === true, visible: true, locked: false, connectionNodeIndex: 0, source: { type: "asset-svg", ...(assetId ? { assetId } : {}), sourceName: fileName } };
    });
  } finally {
    scope.project.clear();
  }
}
