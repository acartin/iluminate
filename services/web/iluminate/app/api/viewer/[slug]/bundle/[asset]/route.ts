import { NextResponse } from "next/server";
import { getStandaloneViewerAsset, getStandaloneViewerLink } from "@/lib/server/standalone-viewer-link";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; asset: string }> }
) {
  const { slug, asset } = await params;
  const share = await getStandaloneViewerLink(slug);
  if (!share) return NextResponse.json({ message: "Viewer not found." }, { status: 404 });
  const bytes = await getStandaloneViewerAsset(slug, asset);
  if (!bytes) return NextResponse.json({ message: "Viewer asset not found." }, { status: 404 });
  const contentType = asset === "manifest.json"
    ? "application/vnd.iluminate.player-bundle+json"
    : asset === "partitura.v2.json"
      ? "application/vnd.iluminate.partitura+json"
      : "application/vnd.iluminate.visual-scene+json";
  return new Response(bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff"
    }
  });
}
