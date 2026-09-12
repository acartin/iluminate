import { NextResponse } from "next/server";
import { redirectTo } from "@/lib/request-url";
import { getProjectAsset, softDeleteProjectAsset } from "@/lib/server/projects";
import { createTenantAssetReadUrl, deleteTenantArtwork, keyFromTenantStorageUri } from "@/lib/server/r2-assets";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  const record = await getProjectAsset(id, assetId);
  if (!record) return NextResponse.json({ message: "Asset not found in project." }, { status: 404 });

  const key = keyFromTenantStorageUri(Number(record.clientId), record.asset.storageUri);
  return NextResponse.redirect(await createTenantAssetReadUrl(Number(record.clientId), key), 302);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  const form = await request.formData();
  if (String(form.get("_method") ?? "").toLowerCase() !== "delete") return redirectTo(`/projects/${id}/workspace?tab=assets`);

  const record = await getProjectAsset(id, assetId);
  if (record) {
    const clientId = Number(record.clientId);
    await deleteTenantArtwork(clientId, keyFromTenantStorageUri(clientId, record.asset.storageUri));
    await softDeleteProjectAsset(id, assetId);
  }

  return redirectTo(`/projects/${id}/workspace?tab=assets`);
}
