/// <reference lib="webworker" />

import type { PartituraDocument } from "@/lib/lighting/partitura-model";
import { buildDocumentFromDesigner } from "./designer-compiler";

type CompileRequest = { id: number; document: PartituraDocument };
type CompileResponse = { id: number; document?: PartituraDocument; error?: string };

self.addEventListener("message", (event: MessageEvent<CompileRequest>) => {
  const { id, document } = event.data;
  try {
    const response: CompileResponse = { id, document: buildDocumentFromDesigner(document) };
    self.postMessage(response);
  } catch (error) {
    const response: CompileResponse = { id, error: error instanceof Error ? error.message : "Physical layout compilation failed." };
    self.postMessage(response);
  }
});

export {};
