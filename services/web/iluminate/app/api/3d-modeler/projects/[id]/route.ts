import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { getProjectForClient } from "@/lib/server/projects";
import { getThreeDDocument, listThreeDJobs, saveThreeDDocument } from "@/lib/server/three-d-models";
import { emptyThreeDModelDocument, validateThreeDModelDocument } from "@/lib/three-d-modeler/contracts";

export const runtime = "nodejs";

async function context(id: string) {
  const menu = await getMenu();
  const allowed = menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"));
  if (!allowed) return null;
  const project = await getProjectForClient(id, menu.tenant.client_id);
  return project ? { menu, project } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await context((await params).id);
  if (!resolved) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [saved, jobs] = await Promise.all([getThreeDDocument(resolved.project.clientId, resolved.project.id), listThreeDJobs(resolved.project.clientId, resolved.project.id)]);
  return NextResponse.json({ document: saved?.document ?? emptyThreeDModelDocument, revision: saved?.revision ?? 0, jobs });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await context((await params).id);
  if (!resolved) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  try {
    const document = validateThreeDModelDocument((await request.json()).document);
    const revision = await saveThreeDDocument(resolved.project.clientId, resolved.project.id, document, resolved.menu.user.id);
    return NextResponse.json({ document, revision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The 3D document could not be saved." }, { status: 400 });
  }
}
