import { NextResponse } from "next/server";
import { getMenu, permissionsByRole } from "@/lib/api";
import { createStandaloneViewerLink } from "@/lib/server/standalone-viewer-link";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  const permissions = permissionsByRole[menu.user.role];
  if (!permissions.includes("*") && !permissions.includes("lighting:partituras:manage")) {
    return NextResponse.json({ message: "You are not authorized to create Viewer links." }, { status: 403 });
  }
  try {
    const viewer = await createStandaloneViewerLink({
      partituraId: (await params).id,
      trustedClientId: menu.tenant.client_id,
      actorId: menu.user.id
    });
    return NextResponse.json({ ok: true, viewer }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create Viewer link." }, { status: 422 });
  }
}
