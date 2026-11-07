import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { deleteThreeDSolidObject, renameThreeDSolidObject } from "@/lib/server/three-d-models";
import { getProjectForClient } from "@/lib/server/projects";

export const runtime = "nodejs";

async function authorizedProject(params: Promise<{ id: string; jobId: string }>) {
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) return { error: NextResponse.json({ error: "Not authorized." }, { status: 403 }) };
  const values = await params;
  const project = await getProjectForClient(values.id, menu.tenant.client_id);
  if (!project) return { error: NextResponse.json({ error: "Project not found." }, { status: 404 }) };
  return { project, jobId: values.jobId };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const context = await authorizedProject(params);
  if (context.error) return context.error;
  try {
    const body = await request.json() as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return NextResponse.json({ error: "The Solid Object name must contain 1 to 80 characters." }, { status: 400 });
    const displayName = await renameThreeDSolidObject(context.project!.clientId, context.project!.id, context.jobId!, name);
    return displayName ? NextResponse.json({ displayName }) : NextResponse.json({ error: "Solid Object not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Solid Object could not be renamed." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const context = await authorizedProject(params);
  if (context.error) return context.error;
  try {
    const deleted = await deleteThreeDSolidObject(context.project!.clientId, context.project!.id, context.jobId!);
    return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Solid Object not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Solid Object could not be deleted." }, { status: 500 });
  }
}
