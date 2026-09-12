import { NextResponse } from "next/server";
import { listProjectAssets } from "@/lib/server/projects";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ records: await listProjectAssets((await params).id) });
}
