import { NextResponse } from "next/server";
import { deleteProject, getProject, updateProject } from "@/lib/server/projects";
import { redirectTo } from "@/lib/request-url";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const project = await getProject((await params).id);
  return project ? NextResponse.json({ project }) : NextResponse.json({ message: "Project not found." }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData();
  const method = String(form.get("_method") ?? "patch").toLowerCase();
  if (method === "delete") {
    await deleteProject(id);
    return redirectTo("/projects");
  }
  await updateProject(id, { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), status: String(form.get("status") ?? "draft") as "draft" | "active" | "archived" });
  return redirectTo(`/projects/${encodeURIComponent(id)}/workspace`);
}
