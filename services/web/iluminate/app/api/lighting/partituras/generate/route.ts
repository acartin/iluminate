import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeDefaultSignLayout, type PartituraDocument } from "@/lib/lighting/partitura-model";

export const runtime = "nodejs";
type LightingCore = typeof import("../../../../../../../lighting-core/index.js");

export async function POST(request: Request) {
  const { generatePartitura, simulateWs2812bFrame, validatePartitura } = await loadLightingCore();
  let document: PartituraDocument;
  try { document = normalizeDefaultSignLayout((await request.json()) as PartituraDocument); } catch { return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 }); }
  const layout = document.compiledLayout;
  if (!layout) return NextResponse.json({ ok: false, message: "Compile the Designer physical layout before generating." }, { status: 422 });
  if (layout.validation.errors.length) return NextResponse.json({ ok: false, message: "Designer electrical validation failed.", validation: layout.validation }, { status: 422 });
  const validTargetIds = new Set([...layout.zones.map((zone) => zone.id), ...layout.groups.map((group) => group.id), "full_sign", "installation"]);
  const partitura = generatePartitura({
    projectId: normalizeCoreId(document.projectId, "project"),
    defaultScene: document.activeSceneId,
    outputs: layout.outputs,
    pixelMap: layout.pixelMap,
    zones: layout.zones,
    groups: layout.groups,
    scenes: document.scenes.map((scene) => ({
      ...scene,
      tracks: scene.clips.map((clip) => ({
        id: `track_${clip.id}`,
        name: clip.name,
        target: clip.target === "installation"
          ? { type: "installation" as const }
          : { type: layout.groups.some((group) => group.id === clip.target) || clip.target === "full_sign" ? "group" as const : "zone" as const, id: validTargetIds.has(clip.target) ? clip.target : "full_sign" },
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
      }))
    })),
    metadata: { source: "designer-physical" }
  });
  const validation = validatePartitura(partitura);
  const activeScene = partitura.scenes.find((scene) => scene.id === partitura.defaultScene);
  const timeMs = Math.min(Math.max(0, document.previewTimeMs), Math.max(0, (activeScene?.durationMs ?? 1) - 1));
  const frame = validation.ok ? simulateWs2812bFrame(partitura, partitura.defaultScene, timeMs) : null;
  return NextResponse.json({ ok: validation.ok, validation, partitura, preview: frame ? { ...frame, pixelCount: frame.outputs.reduce((total, output) => total + output.pixelCount, 0), outputRows: frame.outputs } : null });
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
