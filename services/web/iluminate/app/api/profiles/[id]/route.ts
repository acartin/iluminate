import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { getThreeDProfile, saveThreeDProfile } from "@/lib/server/three-d-profiles";

export const runtime = "nodejs";

async function context() {
  const menu = await getMenu();
  const canRead = menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler" || item.href === "/profiles"));
  return { menu, canRead, canEdit: menu.user.role === "system-admin" };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await context()).canRead) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const profile = await getThreeDProfile((await params).id);
  return profile ? NextResponse.json({ document: profile.document, revision: profile.revision, jobs: [] }) : NextResponse.json({ error: "Profile not found." }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { menu, canEdit } = await context();
  if (!canEdit) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const body = await request.json() as { document?: unknown; revision?: number };
    const profile = await saveThreeDProfile((await params).id, body.document, body.revision ?? 0, menu.user.id);
    return NextResponse.json({ document: profile.document, revision: profile.revision });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Profile could not be saved." }, { status: 409 });
  }
}
