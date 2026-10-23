import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { deletePartitura, getPartituraForClient, savePartituraDocument } from "@/lib/server/partituras";
import { jsonResponse, readJsonRequest } from "@/lib/server/compressed-json";
import type { PartituraDocument, PersistedPartitura } from "@/lib/lighting/partitura-model";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const menu = await getMenu();
  const partitura = await getPartituraForClient(id, menu.tenant.client_id);
  if (!partitura) return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
  return jsonResponse(request, { partitura });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const menu = await getMenu();
  const body = await readJsonRequest<{
    name?: string;
    status?: PersistedPartitura["status"];
    document?: PartituraDocument;
    clearGeneratedPartitura?: boolean;
  }>(request).catch(() => null);
  if (!body?.document || !body.name || !body.status) {
    return NextResponse.json({ message: "name, status and document are required." }, { status: 400 });
  }
  const saved = await savePartituraDocument(id, {
    name: body.name,
    status: body.status,
    document: body.document,
    clearGeneratedPartitura: body.clearGeneratedPartitura !== false
  }, menu.tenant.client_id);
  if (!saved) return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
  return NextResponse.json({ saved });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const menu = await getMenu();
  const deleted = await deletePartitura(id, menu.tenant.client_id);
  if (!deleted) return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const formData = await request.formData();
  const method = String(formData.get("_method") ?? "").toLowerCase();
  if (method !== "delete") {
    return NextResponse.json({ message: "Unsupported method override." }, { status: 405 });
  }

  const { id } = await params;
  const menu = await getMenu();
  await deletePartitura(id, menu.tenant.client_id);
  return Response.redirect(new URL("/partituras/designer", request.url));
}
