import { getMenu } from "@/lib/api";
import { jsonResponse } from "@/lib/server/compressed-json";
import { generatePartituraFromDocument } from "@/lib/server/generate-partitura";
import { getPartituraForClient, persistGeneratedPartitura } from "@/lib/server/partituras";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, menu] = await Promise.all([params, getMenu()]);
  const record = await getPartituraForClient(id, menu.tenant.client_id);
  if (!record) return jsonResponse(request, { ok: false, message: "Partitura not found." }, { status: 404 });

  const result = await generatePartituraFromDocument(record.document);
  if (!result.ok || !result.partitura || !result.validation) {
    return jsonResponse(request, result, { status: 422 });
  }
  const persisted = await persistGeneratedPartitura(id, result.partitura, result.validation, menu.tenant.client_id);
  if (!persisted) return jsonResponse(request, { ok: false, message: "Partitura not found." }, { status: 404 });

  return jsonResponse(request, {
    ...result,
    saved: {
      id,
      status: "validated",
      updatedAt: persisted.updatedAt
    }
  });
}
