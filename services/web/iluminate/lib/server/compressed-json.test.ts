import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { readJsonRequest, jsonResponse } from "./compressed-json";

test("readJsonRequest accepts gzip-compressed authoring documents", async () => {
  const value = { document: { projectId: "project_1", payload: "x".repeat(32_000) } };
  const compressed = new CompressionStream("gzip");
  const body = await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(compressed)).arrayBuffer();
  const request = new Request("http://localhost/api/lighting/partituras/1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    body
  });
  assert.deepEqual(await readJsonRequest(request), value);
});

test("jsonResponse compresses large API responses when gzip is accepted", async () => {
  const request = new Request("http://localhost/api/lighting/partituras", { headers: { "Accept-Encoding": "gzip" } });
  const value = { records: [{ id: "1", payload: "x".repeat(32_000) }] };
  const response = jsonResponse(request, value);
  assert.equal(response.headers.get("content-encoding"), "gzip");
  const decoded = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");
  assert.deepEqual(JSON.parse(decoded), value);
});
