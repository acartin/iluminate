import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Partitura } from "@iluminate/lighting-core";
import { normalizeDefaultSignLayout, type PartituraDocument } from "@/lib/lighting/partitura-model";
import { resolveGeneratedPartituraTarget } from "@/lib/lighting/generated-partitura-target";
import { computeAuthoringSourceChecksum } from "@/lib/server/partitura-checksum";

type LightingCore = typeof import("../../../../lighting-core/index.js");

export type GeneratedPartituraResult = {
  ok: boolean;
  validation?: {
    errors: unknown[];
    warnings: unknown[];
    ok?: boolean;
  };
  partitura?: Partitura;
  message?: string;
};

export async function generatePartituraFromDocument(input: PartituraDocument): Promise<GeneratedPartituraResult> {
  const { generatePartitura, validatePartitura } = await loadLightingCore();
  const document = normalizeDefaultSignLayout(input);
  const layout = document.compiledLayout;
  if (!layout) return { ok: false, message: "Compile the Designer physical layout before generating." };
  if (layout.validation.errors.length) return { ok: false, message: "Designer electrical validation failed.", validation: layout.validation };

  const disabledSourceIds = new Set((document.designer?.lightSources ?? []).filter((source) => !source.enabled).map((source) => source.id));
  const partitura = generatePartitura({
    projectId: normalizeCoreId(document.projectId, "project"),
    sourceChecksum: computeAuthoringSourceChecksum(document),
    defaultScene: document.activeSceneId,
    outputs: layout.outputs,
    pixelMap: layout.pixelMap,
    zones: layout.zones,
    groups: layout.groups,
    scenes: document.scenes.map((scene) => ({
      ...scene,
      tracks: scene.clips
        .filter((clip) => clip.enabled !== false && !disabledSourceIds.has(clip.target))
        .flatMap((clip) => {
          const target = resolveGeneratedPartituraTarget(clip.target, layout);
          if (!target) return [];
          return [{
            id: `track_${clip.id}`,
            name: clip.name,
            target,
            clips: [{
              id: clip.id,
              effect: clip.effect,
              coordinateSpace: clip.coordinateSpace ?? "local",
              startMs: clip.startMs,
              durationMs: clip.durationMs,
              layer: clip.layer,
              blend: clip.blend as "replace" | "add" | "max" | "multiply" | "alpha" | "mask",
              params: clip.params
            }]
          }];
        })
    })),
    metadata: { source: "designer-physical" }
  });
  const validation = validatePartitura(partitura);
  return { ok: validation.ok, validation, partitura };
}

async function loadLightingCore(): Promise<LightingCore> {
  const modulePath = process.env.ILUMINATE_LIGHTING_CORE_MODULE ?? join(process.cwd(), "../../lighting-core/dist/index.js");
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<LightingCore>;
  return runtimeImport(pathToFileURL(modulePath).href);
}

function normalizeCoreId(value: string | undefined, fallback: string) {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9_-]+/g, "_");
  return /^[a-zA-Z]/.test(normalized) ? normalized : `${fallback}_${normalized}`;
}
