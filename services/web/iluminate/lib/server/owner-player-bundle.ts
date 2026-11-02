import "server-only";

import type { Partitura } from "@iluminate/lighting-core";
import { validatePartitura } from "@iluminate/lighting-core";
import { buildPlayerBundle, type PlayerBundlePrivacy } from "@/lib/lighting/player-bundle-builder";
import type { PersistedPartitura } from "@/lib/lighting/partitura-model";
import { computeAuthoringSourceChecksum } from "@/lib/server/partitura-checksum";

export function buildOwnerPlayerBundle(record: PersistedPartitura, privacy: PlayerBundlePrivacy = "private") {
  const document = record.document;
  const generated = record.generatedPartitura as Partitura | undefined;
  if (!generated) throw new Error("Generate and save partitura.v2 before opening the Viewer.");

  const validation = validatePartitura(generated);
  if (!validation.ok) throw new Error(validation.errors[0]?.message ?? "Generated partitura is invalid.");
  if (!document.designer || !document.compiledLayout) {
    throw new Error("Compile the visual scene before opening the Viewer.");
  }
  if (generated.sourceChecksum !== computeAuthoringSourceChecksum(document)) {
    throw new Error("The generated partitura is stale. Generate and save it again before opening the Viewer.");
  }

  return buildPlayerBundle({
    partitura: generated,
    designer: document.designer,
    layout: document.compiledLayout,
    privacy
  });
}
