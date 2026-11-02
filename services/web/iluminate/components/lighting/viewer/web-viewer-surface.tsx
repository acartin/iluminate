"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Maximize2, PanelBottomClose, PanelBottomOpen, Pause, Play, RotateCcw, Square, ZoomIn, ZoomOut } from "lucide-react";
import type { LoadedPlayerBundle } from "@/lib/lighting/player-bundle-loader";
import { loadPlayerBundle } from "@/lib/lighting/player-bundle-loader";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PlayerController, type PlayerStatus } from "@/components/lighting/player/player-controller";
import { Webgl2PlayerRenderer } from "@/components/lighting/player/gpu/webgl2-player-renderer";
import { DEFAULT_DIFFUSER_RENDER_SETTINGS } from "@/components/lighting/player/optical-model";
import { normalizePlayerViewport } from "@/components/lighting/player/player-viewport";
import { ViewerVariationTimeline } from "@/components/lighting/viewer/viewer-variation-timeline";

type ViewerViewport = LoadedPlayerBundle["visualScene"]["defaultCamera"];

const emptyStatus: PlayerStatus = {
  state: "empty",
  sceneId: "",
  timeMs: 0,
  durationMs: 0,
  pixelCount: 0
};

export function WebViewerSurface({ manifestUrl, title, fillViewport = false }: { manifestUrl: string; title: string; fillViewport?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Webgl2PlayerRenderer | null>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const bundleRef = useRef<LoadedPlayerBundle | null>(null);
  const presentationRef = useRef<"as_built" | "led_map">("as_built");
  const requestedViewportRef = useRef<ViewerViewport | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, pixelRatio: 1 });
  const panRef = useRef<{ clientX: number; clientY: number; viewport: ViewerViewport } | null>(null);
  const variationTimerRef = useRef<number | null>(null);
  const variationLoadIdRef = useRef(0);
  const playbackIntentRef = useRef({ sceneId: "", timeMs: 0, playing: false });
  const [bundle, setBundle] = useState<LoadedPlayerBundle | null>(null);
  const [status, setStatus] = useState<PlayerStatus>(emptyStatus);
  const [presentation, setPresentation] = useState<"as_built" | "led_map">("as_built");
  const [error, setError] = useState<string | null>(null);
  const [tracksVisible, setTracksVisible] = useState(true);
  const [variationResetVersion, setVariationResetVersion] = useState(0);

  if (["ready", "paused", "playing"].includes(status.state)) {
    playbackIntentRef.current = { sceneId: status.sceneId, timeMs: status.timeMs, playing: status.state === "playing" };
  }

  function applyViewport(viewport: ViewerViewport) {
    requestedViewportRef.current = viewport;
    const normalized = normalizePlayerViewport(viewport, sizeRef.current);
    rendererRef.current?.updateViewport(normalized);
    rendererRef.current?.render();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const abort = new AbortController();
    let active = true;
    let renderer = new Webgl2PlayerRenderer();
    renderer.initialize(canvas);
    rendererRef.current = renderer;

    const controller = new PlayerController({
      onFrame: (colors) => {
        const currentRenderer = rendererRef.current;
        if (!currentRenderer) return;
        currentRenderer.updateColors(colors);
        currentRenderer.render();
      },
      onStatus: setStatus
    }, { targetFps: 30 });
    controllerRef.current = controller;

    const configureRenderer = (nextRenderer: Webgl2PlayerRenderer, loaded: LoadedPlayerBundle) => {
      nextRenderer.loadScene({ partitura: loaded.partitura, visualScene: loaded.visualScene });
      nextRenderer.updateViewport(normalizePlayerViewport(requestedViewportRef.current ?? loaded.visualScene.defaultCamera, sizeRef.current));
      nextRenderer.updatePresentation(presentationRef.current);
      nextRenderer.updateOpticalSettings({
        ...DEFAULT_DIFFUSER_RENDER_SETTINGS,
        outlineMode: "none",
      });
      nextRenderer.updateColorMode(loaded.visualScene.presentation.background);
      nextRenderer.updateFaceMaskEnabled(true);
      nextRenderer.resize(sizeRef.current.width, sizeRef.current.height, sizeRef.current.pixelRatio);
      nextRenderer.render();
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width, height, pixelRatio };
      rendererRef.current?.resize(width, height, pixelRatio);
      const viewport = requestedViewportRef.current;
      if (viewport) {
        rendererRef.current?.updateViewport(normalizePlayerViewport(viewport, sizeRef.current));
        rendererRef.current?.render();
      }
    });
    resizeObserver.observe(host);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      controller.setSuspended(!entry.isIntersecting);
    }, { threshold: 0.01 });
    visibilityObserver.observe(host);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      const state = controller.getStatus().state;
      if (state === "ready" || state === "playing" || state === "paused") controller.pause();
      setError("The graphics context was interrupted. Restoring the Viewer…");
    };
    const handleContextRestored = () => {
      const loaded = bundleRef.current;
      if (!loaded) return;
      renderer.destroy();
      renderer = new Webgl2PlayerRenderer();
      renderer.initialize(canvas);
      rendererRef.current = renderer;
      configureRenderer(renderer, loaded);
      controller.seek(controller.getStatus().timeMs);
      setError(null);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    const resolvedManifestUrl = new URL(manifestUrl, window.location.href).toString();
    void loadPlayerBundle(resolvedManifestUrl, abort.signal).then(async (loaded) => {
      if (!active) return;
      bundleRef.current = loaded;
      requestedViewportRef.current = loaded.visualScene.defaultCamera;
      setPresentation(loaded.visualScene.presentation.mode);
      configureRenderer(renderer, loaded);
      await controller.load(loaded.partitura);
      if (!active) return;
      setBundle(loaded);
    }).catch((cause) => {
      if (!active || abort.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Unable to load the Viewer.");
    });

    return () => {
      active = false;
      abort.abort();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      controller.destroy();
      renderer.destroy();
      controllerRef.current = null;
      rendererRef.current = null;
      bundleRef.current = null;
      if (variationTimerRef.current !== null) window.clearTimeout(variationTimerRef.current);
    };
  }, [manifestUrl]);

  useEffect(() => {
    presentationRef.current = presentation;
    rendererRef.current?.updatePresentation(presentation);
    rendererRef.current?.render();
  }, [presentation]);

  function zoom(factor: number, anchor = { x: 0.5, y: 0.5 }) {
    const current = requestedViewportRef.current;
    if (!current) return;
    const nextWidth = Math.max(1, current.width * factor);
    const nextHeight = Math.max(1, current.height * factor);
    applyViewport({
      x: current.x + (current.width - nextWidth) * anchor.x,
      y: current.y + (current.height - nextHeight) * anchor.y,
      width: nextWidth,
      height: nextHeight
    });
  }

  function installVariation(partitura: LoadedPlayerBundle["partitura"]) {
    if (variationTimerRef.current !== null) window.clearTimeout(variationTimerRef.current);
    variationTimerRef.current = window.setTimeout(() => {
      variationTimerRef.current = null;
      const controller = controllerRef.current;
      if (!controller) return;
      const intent = playbackIntentRef.current;
      const loadId = ++variationLoadIdRef.current;
      void controller.load(partitura).then(() => {
        if (loadId !== variationLoadIdRef.current || controllerRef.current !== controller) return;
        if (partitura.scenes.some((scene) => scene.id === intent.sceneId)) controller.setScene(intent.sceneId);
        controller.seek(intent.timeMs);
        if (intent.playing) controller.play();
        setError(null);
      }).catch((cause) => {
        if (loadId !== variationLoadIdRef.current) return;
        setError(cause instanceof Error ? cause.message : "Unable to apply this variation.");
      });
    }, 160);
  }

  const playable = status.state === "ready" || status.state === "paused" || status.state === "playing";
  return (
    <section className={`grid overflow-y-auto rounded-lg border border-border-2 bg-slate-950 shadow-[0_8px_30px_var(--shadow-color)] lg:grid-cols-[minmax(0,1fr)_clamp(300px,24vw,380px)] lg:grid-rows-[minmax(0,1fr)_auto] lg:overflow-hidden ${fillViewport ? "h-full min-h-0" : ""}`}>
      <div className={`flex min-h-0 min-w-0 flex-col lg:col-start-1 lg:row-start-1 ${fillViewport ? "" : ""}`}>
        <div
        ref={hostRef}
        className={`relative w-full overflow-hidden bg-slate-950 ${fillViewport ? "min-h-[240px] flex-1 sm:min-h-[320px] lg:min-h-0" : "aspect-video min-h-[320px]"}`}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          zoom(event.deltaY > 0 ? 1.12 : 0.88, {
            x: (event.clientX - rect.left) / Math.max(1, rect.width),
            y: (event.clientY - rect.top) / Math.max(1, rect.height)
          });
        }}
        onPointerDown={(event) => {
          const viewport = requestedViewportRef.current;
          if (!viewport) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = { clientX: event.clientX, clientY: event.clientY, viewport: { ...viewport } };
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan) return;
          const rect = event.currentTarget.getBoundingClientRect();
          applyViewport({
            ...pan.viewport,
            x: pan.viewport.x - (event.clientX - pan.clientX) / Math.max(1, rect.width) * pan.viewport.width,
            y: pan.viewport.y - (event.clientY - pan.clientY) / Math.max(1, rect.height) * pan.viewport.height
          });
        }}
        onPointerUp={(event) => {
          panRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { panRef.current = null; }}
      >
        <canvas ref={canvasRef} aria-label={`Interactive lighting preview for ${title}`} className="block h-full w-full touch-none cursor-grab active:cursor-grabbing" />
        {!bundle && !error ? (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/80 text-slate-200">
            <div className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading Viewer…</div>
          </div>
        ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-700 bg-slate-900 px-2.5 py-2 text-slate-100 sm:space-y-3 sm:px-4 sm:py-3">
        {error ? <Alert variant="error" title="Viewer unavailable">{error}</Alert> : null}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Button className="max-lg:!h-10" variant="outline" density="compact" disabled={!playable} onClick={() => status.state === "playing" ? controllerRef.current?.pause() : controllerRef.current?.play()}>
            {status.state === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {status.state === "playing" ? "Pause" : "Play"}
          </Button>
          <Button className="max-lg:!h-10" variant="outline" density="compact" disabled={!playable} onClick={() => controllerRef.current?.stop()}><Square className="h-3.5 w-3.5" /> Stop</Button>
          <select
            aria-label="Scene"
            className="h-10 min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-950 px-2 text-sm text-slate-100 sm:max-w-64 sm:flex-none lg:h-8"
            disabled={!playable}
            value={status.sceneId}
            onChange={(event) => controllerRef.current?.setScene(event.target.value)}
          >
            {(bundle?.manifest.scenes ?? []).map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
          </select>
          <Button className="w-10 px-0 max-lg:!h-10 lg:w-8" variant="ghost" density="compact" disabled={!bundle} aria-pressed={tracksVisible} aria-label={tracksVisible ? "Hide tracks" : "Show tracks"} data-active={tracksVisible} onClick={() => setTracksVisible((visible) => !visible)}>
            {tracksVisible ? <PanelBottomClose className="h-4 w-4" /> : <PanelBottomOpen className="h-4 w-4" />}
          </Button>
          <div className="flex w-full items-center justify-end gap-1 sm:ml-auto sm:w-auto">
            <Button className="max-lg:!h-10 max-lg:w-10 max-lg:px-0" variant="ghost" density="compact" title="Zoom out" disabled={!bundle} onClick={() => zoom(1.2)}><ZoomOut className="h-4 w-4" /></Button>
            <Button className="max-lg:!h-10 max-lg:w-10 max-lg:px-0" variant="ghost" density="compact" title="Zoom in" disabled={!bundle} onClick={() => zoom(0.8)}><ZoomIn className="h-4 w-4" /></Button>
            <Button className="max-lg:!h-10 max-lg:w-10 max-lg:px-0" variant="ghost" density="compact" title="Restore original" aria-label="Restore original" disabled={!bundle} onClick={() => setVariationResetVersion((version) => version + 1)}><RotateCcw className="h-4 w-4" /></Button>
            <Button className="max-lg:!h-10 max-lg:w-10 max-lg:px-0" variant="ghost" density="compact" title="Fullscreen" disabled={!bundle} onClick={() => void hostRef.current?.requestFullscreen()}><Maximize2 className="h-4 w-4" /></Button>
          </div>
        </div>
        </div>
      </div>
      {bundle ? <ViewerVariationTimeline
          partitura={bundle.partitura}
          bundleHash={bundle.manifest.bundleHash}
          sceneId={status.sceneId || bundle.partitura.defaultScene}
          timeMs={status.timeMs}
          tracksVisible={tracksVisible}
          resetVersion={variationResetVersion}
          onSeek={(timeMs) => controllerRef.current?.seek(timeMs)}
          onPartituraChange={installVariation}
        /> : null}
    </section>
  );
}
