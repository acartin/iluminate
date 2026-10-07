import {
  PLAYER_BUNDLE_VERSION,
  PLAYER_RUNTIME_VERSION,
  VISUAL_SCENE_VERSION,
  type Partitura,
  type PlayerBundleAsset,
  type PlayerBundleManifestV1,
  type VisualSceneV1
} from "@iluminate/lighting-core";

export type LoadedPlayerBundle = {
  manifest: PlayerBundleManifestV1;
  partitura: Partitura;
  visualScene: VisualSceneV1;
};

export async function loadPlayerBundle(manifestUrl: string, signal?: AbortSignal): Promise<LoadedPlayerBundle> {
  const manifestResponse = await fetch(manifestUrl, { signal, cache: "force-cache" });
  if (!manifestResponse.ok) throw new Error(`Player bundle manifest request failed (${manifestResponse.status}).`);
  const manifest = await manifestResponse.json() as PlayerBundleManifestV1;
  validateManifest(manifest);
  const [partituraBytes, visualBytes] = await Promise.all([
    fetchVerifiedAsset(manifestUrl, manifest.assets.partitura, signal),
    fetchVerifiedAsset(manifestUrl, manifest.assets.visualScene, signal)
  ]);
  const partitura = parseJson<Partitura>(partituraBytes, "partitura");
  const visualScene = parseJson<VisualSceneV1>(visualBytes, "visual scene");
  if (partitura.schemaVersion !== "partitura.v2") throw new Error("Bundle partitura contract is unsupported.");
  if (visualScene.version !== VISUAL_SCENE_VERSION) throw new Error("Bundle visual scene contract is unsupported.");
  if (partitura.sourceChecksum !== manifest.sourceChecksum || visualScene.sourceChecksum !== manifest.sourceChecksum) {
    throw new Error("Bundle source checksums do not agree.");
  }
  return { manifest, partitura, visualScene };
}

function validateManifest(manifest: PlayerBundleManifestV1) {
  if (manifest.version !== PLAYER_BUNDLE_VERSION) throw new Error("Player bundle version is unsupported.");
  if (manifest.requiredRuntimeVersion !== PLAYER_RUNTIME_VERSION) throw new Error("Player runtime version is incompatible.");
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.bundleHash)) throw new Error("Player bundle hash is invalid.");
  if (!manifest.assets?.partitura || !manifest.assets?.visualScene) throw new Error("Player bundle assets are incomplete.");
}

async function fetchVerifiedAsset(manifestUrl: string, asset: PlayerBundleAsset, signal?: AbortSignal) {
  if (asset.path.startsWith("/") || asset.path.includes("..")) throw new Error("Player bundle asset path is unsafe.");
  const response = await fetch(new URL(asset.path, manifestUrl), { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`Player bundle asset ${asset.path} failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.byteSize) throw new Error(`Player bundle asset ${asset.path} has an unexpected size.`);
  const checksum = await sha256(bytes);
  if (checksum !== asset.checksum) throw new Error(`Player bundle asset ${asset.path} failed checksum verification.`);
  return bytes;
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error(`Player bundle ${label} is not valid JSON.`);
  }
}

async function sha256(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
