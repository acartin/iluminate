import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { designerFontResource } from "@/lib/lighting/designer-font-catalog";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ fontId: string }> }) {
  const { fontId } = await params;
  const resource = designerFontResource(fontId);
  if (!resource) return NextResponse.json({ message: "Unknown Designer font." }, { status: 404 });
  const data = await readFile(join(process.cwd(), "node_modules", "@fontsource", "roboto", "files", resource.fileName));
  return new NextResponse(data, {
    headers: {
      "Content-Type": "font/woff",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${resource.hash}"`
    }
  });
}
