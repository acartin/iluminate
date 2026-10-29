import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { buildLedStringBom } from "@/lib/lighting/materials-bom";
import { createLedStringBomPdf } from "@/lib/server/bom-pdf";
import { listProjectPartituras } from "@/lib/server/partituras";
import { getProjectForClient } from "@/lib/server/projects";

export const runtime = "nodejs";

function downloadName(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "project"}-led-string-bom.pdf`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, menu] = await Promise.all([params, getMenu()]);
  const project = await getProjectForClient(id, menu.tenant.client_id);
  if (!project) return NextResponse.json({ message: "Project not found." }, { status: 404 });
  const partituras = await listProjectPartituras(project.id);
  const activePartitura = partituras.find((partitura) => partitura.id === project.activePartituraId)
    ?? (partituras.length === 1 ? partituras[0] : undefined);
  if (!activePartitura) return NextResponse.json({ message: "Set an active partitura before exporting the BOM." }, { status: 409 });
  const pdf = createLedStringBomPdf(project.name, activePartitura.name, buildLedStringBom(activePartitura.document));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${downloadName(project.name)}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
