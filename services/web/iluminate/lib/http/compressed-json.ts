const COMPRESSION_THRESHOLD_BYTES = 16 * 1024;

export async function compressedJsonRequest(value: unknown): Promise<{ body: BodyInit; headers: HeadersInit }> {
  const json = JSON.stringify(value);
  if (json.length < COMPRESSION_THRESHOLD_BYTES || typeof CompressionStream === "undefined") {
    return { body: json, headers: { "Content-Type": "application/json" } };
  }

  const source = new Blob([json], { type: "application/json" }).stream();
  const body = await new Response(source.pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip"
    }
  };
}
