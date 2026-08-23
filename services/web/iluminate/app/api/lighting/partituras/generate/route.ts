import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

type LightingCore = typeof import("../../../../../../../lighting-core/index.js");
type EffectId = import("../../../../../../../lighting-core/index.js").EffectId;
type BlendMode = import("../../../../../../../lighting-core/index.js").BlendMode;
type EffectParams = import("../../../../../../../lighting-core/index.js").EffectParams;
type EffectParameterDefinition = import("../../../../../../../lighting-core/index.js").EffectParameterDefinition;

const effectIds: EffectId[] = ["off", "solid", "fade", "pulse", "chase", "toggle"];
const blendModes: BlendMode[] = ["replace", "add", "max", "multiply", "alpha", "mask"];

type GenerateRequest = {
  projectId?: string;
  chain1Pixels?: number;
  chain2Pixels?: number;
  chain3Pixels?: number;
  segments?: SegmentInput[];
  zones?: ZoneInput[];
  scenes?: SceneInput[];
  activeSceneId?: string;
  previewTimeMs?: number;
  accentColor?: string;
};

type SegmentInput = {
  id?: string;
  name?: string;
  output?: number;
  start?: number;
  length?: number;
  reverse?: boolean;
};

type ZoneInput = {
  id?: string;
  name?: string;
  segments?: string[];
};

type ClipInput = {
  id?: string;
  name?: string;
  target?: string;
  effect?: string;
  blend?: string;
  startMs?: number;
  durationMs?: number;
  layer?: number;
  params?: Record<string, unknown>;
};

type SceneInput = {
  id?: string;
  name?: string;
  loop?: boolean;
  durationMs?: number;
  clips?: ClipInput[];
};

export async function POST(request: Request) {
  const { effectCatalog, generatePartitura, simulateWs2812bFrame, validatePartitura } = await loadLightingCore();
  let payload: GenerateRequest;
  try {
    payload = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const chain1Pixels = normalizePositiveInteger(payload.chain1Pixels, 50);
  const chain2Pixels = normalizePositiveInteger(payload.chain2Pixels, 100);
  const chain3Pixels = normalizePositiveInteger(payload.chain3Pixels, 200);
  const chainPixelCounts = { 1: chain1Pixels, 2: chain2Pixels, 3: chain3Pixels };
  const segments = normalizeSegments(payload.segments, chainPixelCounts);
  const zones = normalizeZones(payload.zones, segments.map((segment) => segment.id));
  const zoneIds = zones.map((zone) => zone.id);
  const accentColor = isColor(payload.accentColor) ? payload.accentColor : "#FFCC33";
  const scenes = normalizeScenes(payload.scenes, { effectCatalog, zoneIds, accentColor });
  const activeSceneId = normalizeSceneId(payload.activeSceneId, scenes.map((scene) => scene.id));
  const activeSceneDurationMs = scenes.find((scene) => scene.id === activeSceneId)?.durationMs ?? 4000;
  const activePreviewTimeMs = clampInteger(normalizeNonNegativeInteger(payload.previewTimeMs, 1000), 0, Math.max(0, activeSceneDurationMs - 1));

  const partitura = generatePartitura({
    projectId: normalizeId(payload.projectId ?? "web_test_partitura"),
    defaultScene: activeSceneId,
    chains: [
      {
        id: "chain_1",
        name: "Logical output 1",
        output: 1,
        pixelCount: chain1Pixels,
        segments: segments.filter((segment) => segment.output === 1).map(({ output, ...segment }) => segment)
      },
      {
        id: "chain_2",
        name: "Logical output 2",
        output: 2,
        pixelCount: chain2Pixels,
        segments: segments.filter((segment) => segment.output === 2).map(({ output, ...segment }) => segment)
      },
      {
        id: "chain_3",
        name: "Logical output 3",
        output: 3,
        pixelCount: chain3Pixels,
        segments: segments.filter((segment) => segment.output === 3).map(({ output, ...segment }) => segment)
      }
    ],
    zones,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      loop: scene.loop,
      durationMs: scene.durationMs,
      tracks: scene.clips.map((clip) => ({
          id: `track_${clip.id}`,
          name: clip.name,
          target: { type: "zone", id: clip.target },
          clips: [
            {
              id: clip.id,
              effect: clip.effect,
              startMs: clip.startMs,
              durationMs: clip.durationMs,
              layer: clip.layer,
              blend: clip.blend,
              params: clip.params
            }
          ]
        }))
      })),
    metadata: {
      source: "web-test-generator",
      temporary: true
    }
  });

  const validation = validatePartitura(partitura);
  const frame = validation.ok ? simulateWs2812bFrame(partitura, partitura.defaultScene, activePreviewTimeMs) : null;

  return NextResponse.json({
    ok: validation.ok,
    validation,
    partitura,
    preview: frame
      ? {
          sceneId: frame.sceneId,
          timeMs: frame.timeMs,
          protocol: frame.protocol,
          bitTimeUs: frame.bitTimeUs,
          resetTimeUs: frame.resetTimeUs,
          bitsPerPixel: frame.bitsPerPixel,
          longestOutputTransmitTimeUs: frame.longestOutputTransmitTimeUs,
          estimatedMaxRefreshRateFps: frame.estimatedMaxRefreshRateFps,
          pixelCount: frame.outputs.reduce((total, output) => total + output.pixelCount, 0),
          outputRows: frame.outputs
        }
      : null
  });
}

async function loadLightingCore(): Promise<LightingCore> {
  const configuredModulePath = process.env.ILUMINATE_LIGHTING_CORE_MODULE;
  const modulePath = configuredModulePath ?? join(process.cwd(), "../../lighting-core/dist/index.js");
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<LightingCore>;
  return runtimeImport(pathToFileURL(modulePath).href);
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) return fallback;
  return numberValue;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) return fallback;
  return numberValue;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEffect(value: unknown): EffectId {
  const candidate = String(value) as EffectId;
  return effectIds.includes(candidate) ? candidate : "chase";
}

function normalizeBlend(value: unknown): BlendMode {
  const candidate = String(value) as BlendMode;
  return blendModes.includes(candidate) ? candidate : "max";
}

function normalizeTargetId(value: unknown, zoneIds: string[]) {
  const candidate = String(value);
  return zoneIds.includes(candidate) ? candidate : zoneIds[0] ?? "primary_zone";
}

function normalizeSceneId(value: unknown, sceneIds: string[]) {
  const candidate = String(value);
  return sceneIds.includes(candidate) ? candidate : sceneIds[0] ?? "normal";
}

function normalizeScenes(
  scenes: SceneInput[] | undefined,
  context: {
    effectCatalog: LightingCore["effectCatalog"];
    zoneIds: string[];
    accentColor: string;
  }
) {
  const source: SceneInput[] = scenes?.length ? scenes : [defaultNormalScene(context.zoneIds, context.accentColor)];

  return source.map((scene, index) => {
    const durationMs = normalizePositiveInteger(scene.durationMs, 4000);
    return {
      id: normalizeId(scene.id ?? `scene_${index + 1}`),
      name: String(scene.name ?? scene.id ?? `Scene ${index + 1}`),
      loop: scene.loop !== false,
      durationMs,
      clips: normalizeClips(scene.clips, { ...context, sceneDurationMs: durationMs })
    };
  });
}

function defaultNormalScene(zoneIds: string[], accentColor: string): Required<SceneInput> {
  const fondoTarget = zoneIds.includes("fondo") ? "fondo" : zoneIds[0] ?? "fondo";
  const estrellaTarget = zoneIds.includes("estrella") ? "estrella" : fondoTarget;
  const letraTargets = [1, 2, 3, 4].map((number) => (zoneIds.includes(`letra_${number}`) ? `letra_${number}` : zoneIds.includes("letras") ? "letras" : fondoTarget));

  return {
    id: "normal",
    name: "Normal",
    loop: true,
    durationMs: 4000,
    clips: [
      {
        id: "clip_fondo_verde",
        name: "Fondo verde",
        target: fondoTarget,
        effect: "solid",
        blend: "replace",
        startMs: 0,
        durationMs: 4000,
        layer: 0,
        params: { color: "#00AA44" }
      },
      {
        id: "clip_estrella_roja",
        name: "Estrella roja",
        target: estrellaTarget,
        effect: "solid",
        blend: "replace",
        startMs: 0,
        durationMs: 4000,
        layer: 1,
        params: { color: "#FF2020" }
      },
      {
        id: "clip_letras_secuencia",
        name: "Letras secuencia",
        target: zoneIds.includes("letras") ? "letras" : letraTargets[0],
        effect: "toggle",
        blend: "replace",
        startMs: 0,
        durationMs: 4000,
        layer: 2,
        params: {
          onColor: accentColor,
          offColor: "#000000",
          periodMs: 800,
          dutyCycle: 0.25,
          groupCount: 4
        }
      }
    ]
  };
}

function normalizeClips(
  clips: ClipInput[] | undefined,
  context: {
    effectCatalog: LightingCore["effectCatalog"];
    zoneIds: string[];
    sceneDurationMs: number;
    accentColor: string;
  }
) {
  const source = clips?.length ? clips : [];

  return source.map((clip, index) => {
    const effect = normalizeEffect(clip.effect);
    const target = normalizeTargetId(clip.target, context.zoneIds);
    const startMs = clampInteger(normalizeNonNegativeInteger(clip.startMs, 0), 0, Math.max(0, context.sceneDurationMs - 1));
    const durationMs = clampInteger(
      normalizePositiveInteger(clip.durationMs, context.sceneDurationMs - startMs),
      1,
      Math.max(1, context.sceneDurationMs - startMs)
    );
    const definition = context.effectCatalog[effect];

    return {
      id: normalizeId(clip.id ?? `clip_${index + 1}`),
      name: String(clip.name ?? clip.id ?? `Clip ${index + 1}`),
      target,
      effect,
      startMs,
      durationMs,
      layer: clampInteger(normalizeNonNegativeInteger(clip.layer, index), 0, 99),
      blend: normalizeBlend(clip.blend),
      params: normalizeEffectParams(clip.params ?? {}, definition.parameters, context.accentColor)
    };
  });
}

function normalizeEffectParams(
  params: Record<string, unknown>,
  definitions: Record<string, EffectParameterDefinition>,
  accentColor: string
): EffectParams {
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition]) => {
      const fallback = definition.default ?? (definition.type === "color" ? accentColor : defaultValueForParam(definition));
      return [key, normalizeEffectParam(params[key], definition, fallback)];
    })
  );
}

function normalizeEffectParam(value: unknown, definition: EffectParameterDefinition, fallback: string | number | boolean | null | string[] | number[]) {
  if (definition.type === "color") return isColor(value) ? value : fallback;
  if (definition.type === "integer") {
    const numberValue = normalizePositiveInteger(value, Number(fallback) || 1);
    return Math.round(clampNumber(numberValue, definition.min ?? Number.MIN_SAFE_INTEGER, definition.max ?? Number.MAX_SAFE_INTEGER));
  }
  if (definition.type === "number" || definition.type === "percent") {
    return clampNumber(normalizeNumber(value, Number(fallback) || 0), definition.min ?? Number.NEGATIVE_INFINITY, definition.max ?? Number.POSITIVE_INFINITY);
  }
  if (definition.type === "boolean") return typeof value === "boolean" ? value : Boolean(fallback);
  if (definition.type === "select") {
    const candidate = String(value ?? fallback);
    return definition.options?.some((option) => option.value === candidate) ? candidate : String(fallback ?? "");
  }
  return typeof value === "string" ? value : String(fallback ?? "");
}

function defaultValueForParam(definition: EffectParameterDefinition) {
  if (definition.type === "boolean") return false;
  if (definition.type === "string" || definition.type === "select") return "";
  return 0;
}

function normalizeId(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return /^[a-zA-Z]/.test(normalized) ? normalized : `project_${normalized || "partitura"}`;
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeSegments(segments: SegmentInput[] | undefined, chainPixelCounts: Record<1 | 2 | 3, number>) {
  const letterLength = Math.max(1, Math.floor(chainPixelCounts[3] / 4));
  const defaults: Required<SegmentInput>[] = [
    { id: "fondo_segment", name: "Fondo", output: 1, start: 0, length: chainPixelCounts[1], reverse: false },
    { id: "estrella_segment", name: "Estrella", output: 2, start: 0, length: chainPixelCounts[2], reverse: false },
    { id: "letra_1_segment", name: "Letra 1", output: 3, start: 0, length: letterLength, reverse: false },
    { id: "letra_2_segment", name: "Letra 2", output: 3, start: letterLength, length: letterLength, reverse: false },
    { id: "letra_3_segment", name: "Letra 3", output: 3, start: letterLength * 2, length: letterLength, reverse: false },
    { id: "letra_4_segment", name: "Letra 4", output: 3, start: letterLength * 3, length: chainPixelCounts[3] - letterLength * 3, reverse: false }
  ];
  const source = segments?.length ? segments : defaults;

  return source
    .map((segment, index) => {
      const output = segment.output === 2 || segment.output === 3 ? segment.output : 1;
      const id = normalizeId(segment.id ?? `segment_${index + 1}`);
      return {
        id,
        name: String(segment.name ?? id),
        output,
        start: normalizeNonNegativeInteger(segment.start, 0),
        length: normalizePositiveInteger(segment.length, 1),
        reverse: Boolean(segment.reverse)
      };
    })
    .filter((segment) => segment.length > 0);
}

function normalizeZones(zones: ZoneInput[] | undefined, segmentIds: string[]) {
  const defaults: ZoneInput[] = [
    { id: "fondo", name: "Fondo", segments: segmentIds.filter((id) => id === "fondo_segment") },
    { id: "estrella", name: "Estrella", segments: segmentIds.filter((id) => id === "estrella_segment") },
    { id: "letras", name: "Letras", segments: segmentIds.filter((id) => id.startsWith("letra_")) },
    { id: "letra_1", name: "Letra 1", segments: segmentIds.filter((id) => id === "letra_1_segment") },
    { id: "letra_2", name: "Letra 2", segments: segmentIds.filter((id) => id === "letra_2_segment") },
    { id: "letra_3", name: "Letra 3", segments: segmentIds.filter((id) => id === "letra_3_segment") },
    { id: "letra_4", name: "Letra 4", segments: segmentIds.filter((id) => id === "letra_4_segment") },
    { id: "rotulo_completo", name: "Rotulo completo", segments: segmentIds }
  ];
  const source = zones?.length ? zones : defaults;

  return source.map((zone, index) => {
    const id = normalizeId(zone.id ?? `zone_${index + 1}`);
    const selectedSegments = (zone.segments ?? []).filter((segmentId) => segmentIds.includes(segmentId));
    return {
      id,
      name: String(zone.name ?? id),
      segments: selectedSegments.length ? selectedSegments : [segmentIds[0]].filter(Boolean),
      distribution: "simultaneous" as const
    };
  });
}
