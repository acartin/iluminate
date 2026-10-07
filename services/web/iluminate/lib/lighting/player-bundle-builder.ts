import "server-only";

import { createHash } from "node:crypto";
import {
  PLAYER_BUNDLE_VERSION,
  PLAYER_RUNTIME_VERSION,
  type Partitura,
  type PlayerBundleManifestV1,
  type VisualSceneV1
} from "@iluminate/lighting-core";
import type { DesignerForm } from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "@/components/lighting/designer/designer-compiler";
import { buildVisualScene } from "@/lib/lighting/visual-scene-builder";

export type PlayerBundlePrivacy = PlayerBundleManifestV1["privacy"];

export type BuiltPlayerBundle = {
  manifest: PlayerBundleManifestV1;
  visualScene: VisualSceneV1;
  files: ReadonlyMap<string, { mediaType: string; bytes: Uint8Array; checksum: `sha256:${string}` }>;
};

export function buildPlayerBundle(input: {
  partitura: Partitura;
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  privacy: PlayerBundlePrivacy;
}): BuiltPlayerBundle {
  const visualScene = buildVisualScene(input.partitura, input.designer, input.layout);
  const partituraBytes = jsonBytes(input.partitura);
  const visualBytes = jsonBytes(visualScene);
  const partituraChecksum = sha256(partituraBytes);
  const visualChecksum = sha256(visualBytes);
  const bundleHash = sha256(new TextEncoder().encode(`${PLAYER_BUNDLE_VERSION}\n${partituraChecksum}\n${visualChecksum}`));
  const manifest: PlayerBundleManifestV1 = {
    version: PLAYER_BUNDLE_VERSION,
    bundleHash,
    requiredRuntimeVersion: PLAYER_RUNTIME_VERSION,
    sourceChecksum: input.partitura.sourceChecksum,
    privacy: input.privacy,
    defaultScene: input.partitura.defaultScene,
    scenes: input.partitura.scenes.map(({ id, name, durationMs, loop }) => ({ id, name, durationMs, loop })),
    defaultCamera: visualScene.defaultCamera,
    assets: {
      partitura: { path: "partitura.v2.json", mediaType: "application/vnd.iluminate.partitura+json", byteSize: partituraBytes.byteLength, checksum: partituraChecksum },
      visualScene: { path: "visual-scene.v1.bin", mediaType: "application/vnd.iluminate.visual-scene+json", byteSize: visualBytes.byteLength, checksum: visualChecksum },
      textures: []
    }
  };
  const manifestBytes = jsonBytes(manifest);
  return {
    manifest,
    visualScene,
    files: new Map([
      ["manifest.json", { mediaType: "application/vnd.iluminate.player-bundle+json", bytes: manifestBytes, checksum: sha256(manifestBytes) }],
      [manifest.assets.partitura.path, { mediaType: manifest.assets.partitura.mediaType, bytes: partituraBytes, checksum: partituraChecksum }],
      [manifest.assets.visualScene.path, { mediaType: manifest.assets.visualScene.mediaType, bytes: visualBytes, checksum: visualChecksum }]
    ])
  };
}

function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
