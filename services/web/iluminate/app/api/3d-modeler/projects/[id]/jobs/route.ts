import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { getProjectForClient } from "@/lib/server/projects";
import { allocateThreeDJob, listThreeDJobs } from "@/lib/server/three-d-models";
import { validateThreeDModelDocument } from "@/lib/three-d-modeler/contracts";

export const runtime = "nodejs";

async function context(id: string) {
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) return null;
  const project = await getProjectForClient(id, menu.tenant.client_id);
  return project ? { menu, project } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await context((await params).id);
  if (!resolved) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ jobs: await listThreeDJobs(resolved.project.clientId, resolved.project.id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await context((await params).id);
  if (!resolved) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 2.2 * 1024 * 1024) throw new Error("The 3D job request is too large.");
    const body = await request.json() as { sweepId?: unknown; document?: unknown };
    if (typeof body.sweepId !== "string") throw new Error("Select a Sweep relation.");
    const document = validateThreeDModelDocument(body.document);
    const job = await allocateThreeDJob(resolved.project.clientId, resolved.project.id, document, body.sweepId, resolved.menu.user.id);
    return NextResponse.json({ id: job.id, status: job.status, reused: job.reused }, { status: job.reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The 3D job could not be queued." }, { status: 400 });
  }
}
