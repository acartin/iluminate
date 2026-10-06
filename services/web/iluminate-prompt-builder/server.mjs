import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative as relativePath, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8440);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const requestedFile = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const target = normalize(join(root, requestedFile));
  const fromRoot = relativePath(root, target);

  if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(".." + sep) || !existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mime[extname(target)] || "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(target).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log("Iluminate Prompt Builder: http://localhost:" + port);
});
