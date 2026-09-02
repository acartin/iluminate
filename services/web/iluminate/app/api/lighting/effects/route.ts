import { NextResponse } from "next/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const runtime = "nodejs";

type LightingCore = typeof import("../../../../../../lighting-core/index.js");

export async function GET() {
  const { effectCatalog } = await loadLightingCore();
  return NextResponse.json({ effects: effectCatalog });
}

async function loadLightingCore(): Promise<LightingCore> {
  const configuredModulePath = process.env.ILUMINATE_LIGHTING_CORE_MODULE;
  const modulePath = configuredModulePath ?? join(process.cwd(), "../../lighting-core/dist/index.js");
  const runtimeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<LightingCore>;
  return runtimeImport(pathToFileURL(modulePath).href);
}
