import { normalizeDefaultSignLayout, type PartituraDocument } from "@/lib/lighting/partitura-model";
import { readJsonRequest, jsonResponse } from "@/lib/server/compressed-json";
import { generatePartituraFromDocument } from "@/lib/server/generate-partitura";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let document: PartituraDocument;
  try { document = normalizeDefaultSignLayout(await readJsonRequest<PartituraDocument>(request)); }
  catch { return jsonResponse(request, { ok: false, message: "Request body must be JSON." }, { status: 400 }); }
  const result = await generatePartituraFromDocument(document);
  return jsonResponse(request, result, { status: result.ok ? 200 : 422 });
}
