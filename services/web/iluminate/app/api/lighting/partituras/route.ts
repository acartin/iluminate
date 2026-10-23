import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { createPartitura, listPartituraSummaries } from "@/lib/server/partituras";
import { jsonResponse, readJsonRequest } from "@/lib/server/compressed-json";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const menu = await getMenu();
  try {
    return jsonResponse(request, { records: await listPartituraSummaries(menu.tenant.client_id) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list partituras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const menu = await getMenu();
  try {
    const body: { projectId?: string; name?: string; duplicateOf?: string } = await readJsonRequest<{ projectId?: string; name?: string; duplicateOf?: string }>(request).catch(() => ({}));
    if (!body.projectId) return NextResponse.json({ message: "projectId is required." }, { status: 400 });
    const partitura = await createPartitura({ projectId: body.projectId, name: body.name, duplicateOf: body.duplicateOf, trustedClientId: menu.tenant.client_id });
    return NextResponse.json({ partitura }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create partitura." }, { status: 500 });
  }
}
