import { NextResponse } from "next/server";
import { createPartitura, listPartituras } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ records: await listPartituras() });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list partituras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectId?: string; name?: string; duplicateOf?: string };
    if (!body.projectId) return NextResponse.json({ message: "projectId is required." }, { status: 400 });
    const partitura = await createPartitura({ projectId: body.projectId, name: body.name, duplicateOf: body.duplicateOf });
    return NextResponse.json({ partitura }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create partitura." }, { status: 500 });
  }
}
