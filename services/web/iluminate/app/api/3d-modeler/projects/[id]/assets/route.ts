import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { createProjectAsset, getProjectForClient } from "@/lib/server/projects";
import { deleteTenantArtwork, uploadTenantArtwork } from "@/lib/server/r2-assets";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const menu = await getMenu();
  if (!menu.sections.some((section) => section.items.some((item) => item.href === "/3d-modeler"))) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const project = await getProjectForClient((await params).id, menu.tenant.client_id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  let uploadedKey: string | undefined;
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 2 * 1024 * 1024 || !["image/svg+xml", "application/svg+xml"].includes(file.type)) throw new Error("Upload an SVG smaller than 2 MB.");
    const storageId = randomUUID();
    uploadedKey = await uploadTenantArtwork(Number(project.clientId), storageId, file.name, "image/svg+xml", new Uint8Array(await file.arrayBuffer()));
    const asset = await createProjectAsset({ clientId: project.clientId, projectId: project.id, assetType: "3d-source-svg", storageUri: `r2://${process.env.CLOUDFLARE_R2_BUCKET}/${uploadedKey}`, fileName: file.name, mimeType: "image/svg+xml", sizeBytes: file.size });
    return NextResponse.json({ assetId: String(asset.id), fileName: asset.fileName }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteTenantArtwork(Number(project.clientId), uploadedKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The SVG asset could not be stored." }, { status: 400 });
  }
}
