import { NextResponse } from "next/server";
import type { PlayerBundlePrivacy } from "@/lib/lighting/player-bundle-builder";
import { getMenu, permissionsByRole } from "@/lib/api";
import { createScenePublication } from "@/lib/server/scene-publication";

export const runtime = "nodejs";

const policies = new Set<PlayerBundlePrivacy>(["private", "review", "unlisted", "public"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  const permissions = permissionsByRole[menu.user.role];
  if (!permissions.includes("*") && !permissions.includes("lighting:partituras:manage")) {
    return NextResponse.json({ message: "You are not authorized to publish scenes." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const privacy = String(body.privacy ?? "private") as PlayerBundlePrivacy;
  if (!policies.has(privacy)) return NextResponse.json({ message: "Unsupported share policy." }, { status: 400 });
  if (privacy === "public" && body.rightsConfirmed !== true) {
    return NextResponse.json({ message: "Public publishing requires explicit rights confirmation." }, { status: 422 });
  }
  try {
    const publication = await createScenePublication({
      partituraId: (await params).id,
      trustedClientId: menu.tenant.client_id,
      actorId: menu.user.id,
      privacy,
      profile: String(body.profile ?? "social-1080p30")
    });
    return NextResponse.json({ ok: true, publication }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create scene publication." }, { status: 422 });
  }
}
