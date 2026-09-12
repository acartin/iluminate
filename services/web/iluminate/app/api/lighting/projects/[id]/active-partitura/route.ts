import { NextResponse } from "next/server";
import { activatePartitura } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const ok = await activatePartitura((await params).id, String(body.partituraId ?? ""));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ message: "Partitura not found in project." }, { status: 404 });
}
