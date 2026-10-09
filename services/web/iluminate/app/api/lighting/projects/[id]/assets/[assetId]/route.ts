import { NextResponse } from "next/server";
import { redirectTo } from "@/lib/request-url";
import { inspectArtworkIntrinsicSize } from "@/lib/lighting/artwork-intrinsic-size";
import { getProjectAsset, softDeleteProjectAsset } from "@/lib/server/projects";
import { createTenantAssetReadUrl, deleteTenantArtwork, keyFromTenantStorageUri, readTenantArtwork } from "@/lib/server/r2-assets";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  const record = await getProjectAsset(id, assetId);
  if (!record) return NextResponse.json({ message: "Asset not found in project." }, { status: 404 });

  const key = keyFromTenantStorageUri(Number(record.clientId), record.asset.storageUri);
  const inspection = new URL(request.url).searchParams.get("inspect");
  if (inspection === "size" || inspection === "svg-source") {
    try {
      const bytes = await readTenantArtwork(Number(record.clientId), key);
      const size = inspectArtworkIntrinsicSize(bytes, record.asset.mimeType);
      if (inspection === "size") return NextResponse.json(size);
      if (!record.asset.mimeType.toLowerCase().includes("svg") && !record.asset.fileName.toLowerCase().endsWith(".svg")) {
        return NextResponse.json({ message: "Only SVG artwork can create vector zones." }, { status: 415 });
      }
      if (bytes.byteLength > 10 * 1024 * 1024) {
        return NextResponse.json({ message: "SVG artwork exceeds the 10 MB vector-import limit." }, { status: 413 });
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/<svg(?:\s|>)/i.test(source)) return NextResponse.json({ message: "The asset does not contain an SVG document." }, { status: 422 });
      return NextResponse.json({ source, widthCm: size.widthCm, heightCm: size.heightCm });
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "Artwork size could not be determined." }, { status: 422 });
    }
  }
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
