import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { createPartitura, listPartituras } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function GET() {
  const menu = await getMenu();
  try {
    return NextResponse.json({ records: await listPartituras(menu.tenant.client_id) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list partituras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const menu = await getMenu();
  try {
    const body = (await request.json().catch(() => ({}))) as { projectId?: string; name?: string; duplicateOf?: string };
    if (!body.projectId) return NextResponse.json({ message: "projectId is required." }, { status: 400 });
    const partitura = await createPartitura({ projectId: body.projectId, name: body.name, duplicateOf: body.duplicateOf, trustedClientId: menu.tenant.client_id });
    return NextResponse.json({ partitura }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create partitura." }, { status: 500 });
  }
}
