import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/server/projects";
import { getMenu } from "@/lib/api";
import { redirectTo } from "@/lib/request-url";

export const runtime = "nodejs";

export async function GET() {
  const menu = await getMenu();
  return NextResponse.json({ records: await listProjects(menu.tenant.client_id) });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return redirectTo("/projects?feedback=error&message=Project+name+is+required.");
  const project = await createProject({ name, description: String(form.get("description") ?? "") });
  return redirectTo(`/projects/${encodeURIComponent(project.id)}/workspace`);
}
