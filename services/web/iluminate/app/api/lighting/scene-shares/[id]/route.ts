import { NextResponse } from "next/server";
import { getMenu, permissionsByRole } from "@/lib/api";
import { getSceneShareStatus, revokeSceneShare } from "@/lib/server/scene-publication";

export const runtime = "nodejs";

function canManage(role: keyof typeof permissionsByRole) {
  const permissions = permissionsByRole[role];
  return permissions.includes("*") || permissions.includes("lighting:partituras:manage");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  if (!canManage(menu.user.role)) return NextResponse.json({ message: "Not authorized." }, { status: 403 });
  const publication = await getSceneShareStatus({ shareId: (await params).id, trustedClientId: menu.tenant.client_id });
  if (!publication) return NextResponse.json({ message: "Share not found." }, { status: 404 });
  return NextResponse.json({ publication });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  if (!canManage(menu.user.role)) return NextResponse.json({ message: "Not authorized." }, { status: 403 });
  const revoked = await revokeSceneShare({
    shareId: (await params).id,
    trustedClientId: menu.tenant.client_id,
    actorId: menu.user.id
  });
  if (!revoked) return NextResponse.json({ message: "Share not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
