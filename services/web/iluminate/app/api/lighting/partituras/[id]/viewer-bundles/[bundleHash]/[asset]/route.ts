import { NextResponse } from "next/server";
import { getMenu, permissionsByRole } from "@/lib/api";
import { buildOwnerPlayerBundle } from "@/lib/server/owner-player-bundle";
import { getPartituraForClient } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; bundleHash: string; asset: string }> }
) {
  const [{ id, bundleHash, asset }, menu] = await Promise.all([params, getMenu()]);
  const permissions = permissionsByRole[menu.user.role];
  if (!permissions.includes("*") && !permissions.includes("lighting:partituras:read")) {
    return NextResponse.json({ message: "Not authorized." }, { status: 403 });
  }

  const record = await getPartituraForClient(id, menu.tenant.client_id);
  if (!record) return NextResponse.json({ message: "Viewer bundle not found." }, { status: 404 });

  try {
    const bundle = buildOwnerPlayerBundle(record);
    if (bundle.manifest.bundleHash !== `sha256:${bundleHash}`) {
      return NextResponse.json({ message: "Viewer bundle not found." }, { status: 404 });
    }
    const file = bundle.files.get(asset);
    if (!file) return NextResponse.json({ message: "Viewer asset not found." }, { status: 404 });
    return new Response(file.bytes, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": file.mediaType,
        "Content-Length": String(file.bytes.byteLength),
        ETag: `"${file.checksum}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : "Unable to build the Viewer bundle."
    }, { status: 422 });
  }
}
