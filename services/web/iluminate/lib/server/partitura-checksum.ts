import "server-only";

import { createHash } from "node:crypto";
import type { PartituraDocument } from "@/lib/lighting/partitura-model";

/** Runtime cursor state is not authored content and must not invalidate an artifact. */
export function computeAuthoringSourceChecksum(document: PartituraDocument): `sha256:${string}` {
  const { previewTimeMs: _previewTimeMs, ...source } = document;
  return `sha256:${createHash("sha256").update(JSON.stringify(source)).digest("hex")}`;
}
