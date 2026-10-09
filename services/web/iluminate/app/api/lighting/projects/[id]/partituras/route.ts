import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { createPartitura, listProjectPartituras } from "@/lib/server/partituras";
import { redirectTo } from "@/lib/request-url";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ records: await listProjectPartituras((await params).id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const menu = await getMenu();
  const form = await request.formData();
  const partitura = await createPartitura({ projectId: id, name: String(form.get("name") ?? ""), trustedClientId: menu.tenant.client_id });
  return redirectTo(`/partituras/designer/${encodeURIComponent(partitura.id)}`);
}
