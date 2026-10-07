"use client";

import { useEffect, useRef, useState } from "react";
import { createFrameBuffer, preparePartituraRuntime, renderFrameInto } from "@iluminate/lighting-core";
import { loadPlayerBundle } from "@/lib/lighting/player-bundle-loader";
import { Webgl2PlayerRenderer } from "./gpu/webgl2-player-renderer";
import { DEFAULT_DIFFUSER_RENDER_SETTINGS } from "./optical-model";

declare global {
  interface Window {
    __ILUMINATE_RENDER__?: {
      scenes: string[];
      render(sceneId: string, timeMs: number): Promise<void>;
    };
  }
}

export function RenderHarness({ bundleUrl, width, height }: { bundleUrl: string; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const abort = new AbortController();
    let renderer: Webgl2PlayerRenderer | null = null;
    void loadPlayerBundle(bundleUrl, abort.signal).then((bundle) => {
      if (abort.signal.aborted) return;
      const runtime = preparePartituraRuntime(bundle.partitura);
      const colors = createFrameBuffer(runtime);
      renderer = new Webgl2PlayerRenderer();
      renderer.initialize(canvas, { capture: true });
      renderer.loadScene({ partitura: bundle.partitura, visualScene: bundle.visualScene });
      renderer.updateViewport(bundle.visualScene.defaultCamera);
      renderer.updatePresentation(bundle.visualScene.presentation.mode);
      renderer.updateOpticalSettings(DEFAULT_DIFFUSER_RENDER_SETTINGS);
      renderer.updateColorMode(bundle.visualScene.presentation.background);
      renderer.resize(width, height, 1);
      window.__ILUMINATE_RENDER__ = {
        scenes: bundle.partitura.scenes.map((scene) => scene.id),
        async render(sceneId, timeMs) {
          const frame = renderFrameInto(runtime, sceneId, timeMs, colors);
          renderer!.updateColors(frame.colors);
          renderer!.render();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      };
      document.documentElement.dataset.renderReady = "true";
    }).catch((cause) => {
      if (abort.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : "Render harness failed.";
      setError(message);
      document.documentElement.dataset.renderError = message;
    });
    return () => {
      abort.abort();
      renderer?.destroy();
      delete window.__ILUMINATE_RENDER__;
      delete document.documentElement.dataset.renderReady;
      delete document.documentElement.dataset.renderError;
    };
  }, [bundleUrl, height, width]);

  return (
    <main style={{ width, height, overflow: "hidden", background: "#020617" }}>
      <canvas ref={canvasRef} width={width} height={height} style={{ display: "block", width, height }} />
      {error ? <pre style={{ position: "fixed", inset: 0, margin: 0, padding: 24, color: "#fecaca", background: "#450a0a" }}>{error}</pre> : null}
    </main>
  );
}
