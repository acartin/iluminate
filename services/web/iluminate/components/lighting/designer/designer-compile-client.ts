import type { PartituraDocument } from "@/lib/lighting/partitura-model";

type CompileResponse = { id: number; document?: PartituraDocument; error?: string };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (document: PartituraDocument) => void; reject: (error: Error) => void }>();

export function compileDesignerDocument(document: PartituraDocument): Promise<PartituraDocument> {
  if (typeof Worker === "undefined") {
    return import("./designer-compiler").then(({ buildDocumentFromDesigner }) => buildDocumentFromDesigner(document));
  }
  const compileWorker = ensureWorker();
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    compileWorker.postMessage({ id, document });
  });
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./designer-compile-worker.ts", import.meta.url), { type: "module", name: "iluminate-physical-compiler" });
  worker.addEventListener("message", (event: MessageEvent<CompileResponse>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.document) request.resolve(event.data.document);
    else request.reject(new Error(event.data.error ?? "Physical layout compilation failed."));
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Physical layout compiler worker failed.");
    pending.forEach((request) => request.reject(error));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}
