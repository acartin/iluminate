import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { createThreeDProfile, listThreeDProfiles } from "@/lib/server/three-d-profiles";

export const runtime = "nodejs";

async function context() {
  const menu = await getMenu();
  const canRead = menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler" || item.href === "/profiles"));
  return { menu, canRead, canEdit: menu.user.role === "system-admin" };
}

export async function GET() {
  if (!(await context()).canRead) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return NextResponse.json({ profiles: await listThreeDProfiles() });
}

export async function POST(request: Request) {
  const { menu, canEdit } = await context();
  if (!canEdit) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  try {
    const body = await request.json() as { name?: unknown; description?: unknown };
    const profile = await createThreeDProfile(body.name, body.description, menu.user.id);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The Profile could not be created." }, { status: 400 });
  }
}
