import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { getPool } from "@/lib/server/postgres";
import { getProjectForClient } from "@/lib/server/projects";
import { readThreeDViewArtifact } from "@/lib/server/r2-three-d-models";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; jobId: string; artifact: string }> }) {
  const values = await params;
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const project = await getProjectForClient(values.id, menu.tenant.client_id);
  if (!project || !/^\d+$/.test(values.jobId)) return NextResponse.json({ error: "Model not found." }, { status: 404 });
  const allowed = await getPool().query("select 1 from iluminate.three_d_model_jobs where id = $1 and client_id = $2 and project_id = $3 and status = 'succeeded'", [values.jobId, project.clientId, project.id]);
  if (!allowed.rowCount) return NextResponse.json({ error: "Model not found." }, { status: 404 });
  const artifact = decodeURIComponent(values.artifact);
  try {
    const result = await readThreeDViewArtifact(project.clientId, project.id, values.jobId, artifact);
    return new Response(result.body, { headers: { "content-type": result.contentType, "content-length": String(result.contentLength), "content-disposition": `inline; filename="${artifact}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Model not found." }, { status: 404 });
  }
}
