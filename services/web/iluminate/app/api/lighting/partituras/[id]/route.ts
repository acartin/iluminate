import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { deletePartitura, getPartituraForClient, updatePartitura } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const menu = await getMenu();
  const partitura = await getPartituraForClient(id, menu.tenant.client_id);
  if (!partitura) return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
  return NextResponse.json({ partitura });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const menu = await getMenu();
  const body = await request.json().catch(() => ({}));
  const partitura = await updatePartitura(id, body, menu.tenant.client_id);
  if (!partitura) return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
  return NextResponse.json({ partitura });
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
