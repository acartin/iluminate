import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { getPartituraForClient } from "@/lib/server/partituras";
import { getProjectForClient } from "@/lib/server/projects";
import type { ModelPath, ProfileNode } from "@/lib/three-d-modeler/contracts";

export const runtime = "nodejs";

type DesignerPointSnapshot = { x: number; y: number; nodeType?: string; handleIn?: { x: number; y: number }; handleOut?: { x: number; y: number } };
type FabricationPathSnapshot = { id: string; name: string; shape: "rect" | "ellipse" | "polygon"; x: number; y: number; width: number; height: number; closed?: boolean; points?: DesignerPointSnapshot[]; contours?: Array<{ points: DesignerPointSnapshot[]; closed?: boolean }>; visible?: boolean };

function node(point: DesignerPointSnapshot): ProfileNode {
  const handleIn = point.handleIn ? { xMm: point.handleIn.x * 10, yMm: -point.handleIn.y * 10 } : undefined;
  const handleOut = point.handleOut ? { xMm: point.handleOut.x * 10, yMm: -point.handleOut.y * 10 } : undefined;
  return { xMm: point.x * 10, yMm: -point.y * 10, nodeType: !handleIn && !handleOut ? "corner" : point.nodeType === "symmetric" ? "symmetric" : "smooth", ...(handleIn ? { handleIn } : {}), ...(handleOut ? { handleOut } : {}) };
}

function geometry(path: FabricationPathSnapshot) {
  if (path.shape === "rect") return [[
    { x: path.x, y: path.y }, { x: path.x + path.width, y: path.y },
    { x: path.x + path.width, y: path.y + path.height }, { x: path.x, y: path.y + path.height }
  ]];
  if (path.shape === "ellipse") {
    const cx = path.x + path.width / 2; const cy = path.y + path.height / 2; const rx = path.width / 2; const ry = path.height / 2; const k = .5522847498;
    return [[
      { x: cx + rx, y: cy, handleIn: { x: 0, y: -ry * k }, handleOut: { x: 0, y: ry * k } },
      { x: cx, y: cy + ry, handleIn: { x: rx * k, y: 0 }, handleOut: { x: -rx * k, y: 0 } },
      { x: cx - rx, y: cy, handleIn: { x: 0, y: ry * k }, handleOut: { x: 0, y: -ry * k } },
      { x: cx, y: cy - ry, handleIn: { x: -rx * k, y: 0 }, handleOut: { x: rx * k, y: 0 } }
    ]];
  }
  return path.contours?.length ? path.contours.map((contour) => contour.points) : [path.points ?? []];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const project = await getProjectForClient((await params).id, menu.tenant.client_id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!project.activePartituraId) return NextResponse.json({ plans: [], source: null });
  const partitura = await getPartituraForClient(project.activePartituraId, menu.tenant.client_id);
  if (!partitura || partitura.projectId !== project.id) return NextResponse.json({ plans: [], source: null });
  const snapshots = (partitura.document.designer?.fabricationPaths ?? []) as FabricationPathSnapshot[];
  const plans: ModelPath[] = snapshots.filter((path) => path.visible !== false).flatMap((path) => geometry(path).map((points, contourIndex) => ({
    id: `plan-${partitura.id}-${path.id}${contourIndex ? `-${contourIndex + 1}` : ""}`.slice(0, 128),
    name: `${path.name}${contourIndex ? ` · ${contourIndex + 1}` : ""}`,
    nodes: points.map(node),
    closed: path.closed !== false,
    visible: true,
    locked: false,
    connectionNodeIndex: 0,
    source: { type: "fabrication-plan" as const, sourceName: `partitura:${partitura.id}/${path.id}${contourIndex ? `/${contourIndex + 1}` : ""}` }
  })).filter((path) => path.nodes.length >= (path.closed ? 3 : 2)));
  return NextResponse.json({ plans, source: { partituraId: partitura.id, name: partitura.name, updatedAt: partitura.updatedAt } });
}
