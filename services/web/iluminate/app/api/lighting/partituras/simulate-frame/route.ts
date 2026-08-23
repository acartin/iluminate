import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

type LightingCore = typeof import("../../../../../../../lighting-core/index.js");
type Partitura = import("../../../../../../../lighting-core/index.js").Partitura;

type SimulateFrameRequest = {
  partitura?: Partitura;
  sceneId?: string;
  timeMs?: number;
};

export async function POST(request: Request) {
  const { simulateWs2812bFrame, validatePartitura } = await loadLightingCore();

  let payload: SimulateFrameRequest;
  try {
    payload = (await request.json()) as SimulateFrameRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  if (!payload.partitura) {
    return NextResponse.json({ ok: false, message: "partitura is required." }, { status: 400 });
  }

  const validation = validatePartitura(payload.partitura);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, validation }, { status: 422 });
  }

  const sceneId = payload.sceneId ?? payload.partitura.defaultScene;
  const timeMs = normalizeNonNegativeInteger(payload.timeMs, 0);
  const frame = simulateWs2812bFrame(payload.partitura, sceneId, timeMs);

  return NextResponse.json({
    ok: true,
    preview: {
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
  });
}

async function loadLightingCore(): Promise<LightingCore> {
  const configuredModulePath = process.env.ILUMINATE_LIGHTING_CORE_MODULE;
  const modulePath = configuredModulePath ?? join(process.cwd(), "../../lighting-core/dist/index.js");
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<LightingCore>;
  return runtimeImport(pathToFileURL(modulePath).href);
}

function normalizeNonNegativeInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return Math.floor(numberValue);
}

