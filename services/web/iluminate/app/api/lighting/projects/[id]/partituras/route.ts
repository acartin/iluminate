import { NextResponse } from "next/server";
import { createPartitura, listProjectPartituras } from "@/lib/server/partituras";
import { redirectTo } from "@/lib/request-url";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ records: await listProjectPartituras((await params).id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData();
  const partitura = await createPartitura({ projectId: id, name: String(form.get("name") ?? "") });
  return redirectTo(`/partituras/generator/${encodeURIComponent(partitura.id)}`);
}
