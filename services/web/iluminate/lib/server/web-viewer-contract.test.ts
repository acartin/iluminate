import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sha256Hex } from "@/lib/crypto/sha256";
import type { Partitura } from "@iluminate/lighting-core";
import { materializeViewerPartitura, viewerClipKey } from "@/components/lighting/viewer/viewer-variation-model";

const surfaceSource = readFileSync(new URL("../../components/lighting/viewer/web-viewer-surface.tsx", import.meta.url), "utf8");
const ownerSource = readFileSync(new URL("../../components/lighting/viewer/owner-web-viewer.tsx", import.meta.url), "utf8");
const ownerBundleSource = readFileSync(new URL("./owner-player-bundle.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../../components/lighting/partitura-workspace.tsx", import.meta.url), "utf8");
const standalonePageSource = readFileSync(new URL("../../app/viewer/[slug]/page.tsx", import.meta.url), "utf8");
const standaloneAssetSource = readFileSync(new URL("../../app/api/viewer/[slug]/bundle/[asset]/route.ts", import.meta.url), "utf8");
const variationTimelineSource = readFileSync(new URL("../../components/lighting/viewer/viewer-variation-timeline.tsx", import.meta.url), "utf8");
const shareMenuSource = readFileSync(new URL("../../components/lighting/viewer/viewer-share-menu.tsx", import.meta.url), "utf8");
const viewerResponsiveSource = readFileSync(new URL("../../components/lighting/viewer/viewer-responsive.module.css", import.meta.url), "utf8");

describe("standalone Web Viewer boundary", () => {
  it("reuses the canonical bundle loader, controller and WebGL2 renderer", () => {
    assert.match(surfaceSource, /loadPlayerBundle/);
    assert.match(surfaceSource, /new PlayerController/);
    assert.match(surfaceSource, /new Webgl2PlayerRenderer/);
    assert.match(surfaceSource, /outlineMode:\s*["']none["']/);
  });

  it("does not pull authoring state into the bundle-first surface", () => {
    assert.doesNotMatch(surfaceSource, /DesignerForm/);
    assert.doesNotMatch(surfaceSource, /compiledLayout/);
    assert.doesNotMatch(surfaceSource, /buildVisualScene/);
    assert.doesNotMatch(surfaceSource, /partitura-workspace/);
  });

  it("keeps share management on the owner page", () => {
    assert.match(ownerSource, /\/api\/lighting\/partituras\/\$\{encodeURIComponent\(partituraId\)\}\/shares/);
    assert.match(ownerSource, /\/api\/lighting\/scene-shares\/\$\{encodeURIComponent\(publication\.shareId\)\}/);
    assert.match(ownerSource, /Revoke link/);
  });

  it("requires one persisted runtime materialization instead of generating inside the Viewer", () => {
    assert.match(ownerBundleSource, /record\.generatedPartitura/);
    assert.match(ownerBundleSource, /Generate and save partitura\.v2/);
    assert.doesNotMatch(ownerBundleSource, /generatePartituraFromDocument/);
  });

  it("materializes before navigating from Animate and removes its former fullscreen Viewer", () => {
    assert.match(workspaceSource, /await generateAndSaveAnimation\(\)/);
    assert.match(workspaceSource, /\/viewer-links/);
    assert.match(workspaceSource, /router\.push\(`\/viewer\//);
    assert.doesNotMatch(workspaceSource, /animationViewerOpen/);
    assert.doesNotMatch(workspaceSource, /title="Share scene"/);
  });

  it("serves the possession URL without dashboard shell or session lookup", () => {
    assert.match(standalonePageSource, /WebViewerSurface/);
    assert.doesNotMatch(standalonePageSource, /AppShell|getMenu/);
    assert.match(standaloneAssetSource, /getStandaloneViewerLink/);
    assert.doesNotMatch(standaloneAssetSource, /getMenu|permissionsByRole/);
  });

  it("resolves relative manifest URLs against the standalone page origin", () => {
    assert.match(surfaceSource, /new URL\(manifestUrl, window\.location\.href\)/);
  });

  it("verifies bundle checksums when Web Crypto is unavailable over local HTTP", async () => {
    assert.equal(
      await sha256Hex(new TextEncoder().encode("abc"), null),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("uses viewport-filling responsive layout only on the standalone page", () => {
    assert.match(standalonePageSource, /h-dvh/);
    assert.match(standalonePageSource, /fillViewport/);
    assert.match(surfaceSource, /sm:max-w-64/);
  });

  it("keeps Viewer track variations local, reversible and independently collapsible", () => {
    assert.match(surfaceSource, /ViewerVariationTimeline/);
    assert.match(surfaceSource, /tracksVisible/);
    assert.match(surfaceSource, /Hide tracks/);
    assert.match(variationTimelineSource, /localStorage/);
    assert.match(variationTimelineSource, /bundleHash/);
    assert.doesNotMatch(variationTimelineSource, /Changes stay in this browser/);
    assert.doesNotMatch(variationTimelineSource, /PartituraDocument|DesignerAnimateTimeline|\/generate|method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
  });

  it("uses a draggable timeline playhead and shares only the current possession URL", () => {
    assert.doesNotMatch(surfaceSource, /Playback position|As built|LED map|Reset view/);
    assert.match(surfaceSource, /PanelBottomClose/);
    assert.match(variationTimelineSource, /beginPlayheadDrag/);
    assert.match(variationTimelineSource, /rounded-full bg-red-500/);
    assert.match(shareMenuSource, /window\.location\.href/);
    assert.match(shareMenuSource, /navigator\.share/);
    assert.match(shareMenuSource, /mailto:|wa\.me|facebook\.com|twitter\.com|linkedin\.com/);
    assert.doesNotMatch(shareMenuSource, /fetch\(|XMLHttpRequest|method:\s*["'](?:POST|PATCH|PUT|DELETE)/);
  });

  it("links the public Viewer brand to iluminate.space", () => {
    assert.match(standalonePageSource, /href="https:\/\/iluminate\.space"/);
    assert.match(standalonePageSource, /src="\/iluminate-space-icon\.svg"/);
    assert.match(standalonePageSource, /tracking-\[-0\.075em\][^>]*>iluminate</);
    assert.doesNotMatch(standalonePageSource, /src="\/icon\.svg"/);
  });

  it("uses a fit-to-width contextual editor below desktop without changing the desktop breakpoint", () => {
    assert.match(variationTimelineSource, /w-full min-w-0/);
    assert.match(variationTimelineSource, /lg:min-w-\[760px\]/);
    assert.match(variationTimelineSource, /--viewer-track-gutter:64px/);
    assert.match(variationTimelineSource, /min-width: 1024px/);
    assert.match(variationTimelineSource, /Close clip inspector/);
    assert.doesNotMatch(variationTimelineSource, />Variations</);
    assert.doesNotMatch(variationTimelineSource, /> Original</);
    assert.match(surfaceSource, /title="Restore original"/);
    assert.match(surfaceSource, /resetVersion=\{variationResetVersion\}/);
    assert.match(variationTimelineSource, /clip\.name \|\| \(track\.clips\.length === 1 \? track\.name : "Clip"\)/);
    assert.doesNotMatch(variationTimelineSource, /clip\.name \|\| effects\[clip\.effect\]/);
    assert.doesNotMatch(variationTimelineSource, /hidden min-w-0 flex-1 truncate px-1 sm:block/);
    assert.match(viewerResponsiveSource, /max-width: 1023px/);
    assert.match(viewerResponsiveSource, /orientation: landscape/);
    assert.match(viewerResponsiveSource, /position: fixed/);
    assert.match(viewerResponsiveSource, /safe-area-inset-bottom/);
  });

  it("materializes Viewer overrides without changing the immutable source or clip target", () => {
    const partitura = {
      schemaVersion: "partitura.v2",
      projectId: "viewer_variation",
      sourceChecksum: `sha256:${"0".repeat(64)}`,
      requiredCoreVersion: "1.0.0",
      defaultScene: "scene",
      outputs: [], pixelMap: [], zones: [], groups: [],
      scenes: [{ id: "scene", name: "Scene", loop: true, durationMs: 2000, tracks: [{
        id: "track", name: "Track", target: { type: "installation" }, clips: [
          { id: "clip_a", effect: "solid", coordinateSpace: "local", startMs: 0, durationMs: 1000, layer: 0, blend: "replace", params: { color: "#ffffff" } },
          { id: "clip_b", effect: "solid", target: { type: "installation" }, coordinateSpace: "local", startMs: 1000, durationMs: 1000, layer: 0, blend: "replace", params: { color: "#ffffff" } }
        ]
      }] }]
    } as Partitura;
    const changed = materializeViewerPartitura(partitura, {
      [viewerClipKey("scene", "track", "clip_a")]: { effect: "pulse", startMs: 250, params: { color: "#ff0000" } },
      [viewerClipKey("scene", "track", "clip_b")]: { removed: true }
    });

    assert.equal(partitura.scenes[0].tracks[0].clips.length, 2);
    assert.equal(partitura.scenes[0].tracks[0].clips[0].effect, "solid");
    assert.equal(changed.scenes[0].tracks[0].clips.length, 1);
    assert.equal(changed.scenes[0].tracks[0].clips[0].effect, "pulse");
    assert.equal(changed.scenes[0].tracks[0].clips[0].startMs, 250);
    assert.equal(changed.scenes[0].tracks[0].clips[0].target, undefined);
  });
});
