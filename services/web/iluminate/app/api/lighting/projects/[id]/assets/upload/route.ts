import { randomUUID } from "node:crypto";
import { redirectTo } from "@/lib/request-url";
import { createProjectAsset, getProject } from "@/lib/server/projects";
import { uploadTenantArtwork } from "@/lib/server/r2-assets";

export const runtime = "nodejs";

const maxArtworkBytes = 2 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp", "image/bmp"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, form] = await Promise.all([getProject(id), request.formData()]);
  if (!project) return redirectTo("/projects");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > maxArtworkBytes || !allowedMimeTypes.has(file.type)) {
    return redirectTo(`/projects/${id}/workspace?tab=assets`);
  }
  const assetId = randomUUID();
  const mimeType = file.type || "application/octet-stream";
  const key = await uploadTenantArtwork(Number(project.clientId), assetId, file.name, mimeType, new Uint8Array(await file.arrayBuffer()));
  await createProjectAsset({ clientId: project.clientId, projectId: id, assetType: "reference", storageUri: `r2://${process.env.CLOUDFLARE_R2_BUCKET}/${key}`, fileName: file.name, mimeType, sizeBytes: file.size });
  return redirectTo(`/projects/${id}/workspace?tab=assets`);
}
