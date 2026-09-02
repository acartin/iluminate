import { NextResponse } from "next/server";
import { getGeneratedPartituraByKey } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const partituraKey = decodeURIComponent(key).trim();

  if (!partituraKey) {
    return NextResponse.json({ message: "Partitura key is required." }, { status: 400 });
  }

  try {
    const record = await getGeneratedPartituraByKey(partituraKey);
    if (!record) {
      return NextResponse.json({ message: "Partitura not found." }, { status: 404 });
    }

    if (!record.generatedPartitura) {
      return NextResponse.json({ message: "Partitura has not been generated yet." }, { status: 409 });
    }

    return NextResponse.json(record.generatedPartitura, {
      headers: {
        "Cache-Control": "no-store",
        "X-Iluminate-Partitura-Key": record.partituraKey,
        "X-Iluminate-Partitura-Status": record.status,
        "X-Iluminate-Partitura-Updated-At": record.updatedAt
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load partitura." },
      { status: 500 }
    );
  }
}
