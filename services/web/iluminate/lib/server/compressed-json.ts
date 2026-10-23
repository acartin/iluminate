import { gunzipSync, gzipSync } from "node:zlib";

const COMPRESSION_THRESHOLD_BYTES = 16 * 1024;

export async function readJsonRequest<T>(request: Request): Promise<T> {
  const bytes = Buffer.from(await request.arrayBuffer());
  const encoding = request.headers.get("content-encoding")?.toLowerCase();
  const decoded = encoding === "gzip" ? gunzipSync(bytes) : bytes;
  return JSON.parse(decoded.toString("utf8")) as T;
}

export function jsonResponse(request: Request, value: unknown, init: ResponseInit = {}) {
  const json = JSON.stringify(value);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Vary", appendVary(headers.get("Vary"), "Accept-Encoding"));

  if (json.length >= COMPRESSION_THRESHOLD_BYTES && request.headers.get("accept-encoding")?.includes("gzip")) {
    headers.set("Content-Encoding", "gzip");
    return new Response(gzipSync(json), { ...init, headers });
  }
  return new Response(json, { ...init, headers });
}

function appendVary(current: string | null, value: string) {
  const entries = new Set((current ?? "").split(",").map((entry) => entry.trim()).filter(Boolean));
  entries.add(value);
  return Array.from(entries).join(", ");
}
