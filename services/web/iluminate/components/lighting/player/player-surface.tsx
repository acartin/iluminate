"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { Partitura } from "@iluminate/lighting-core";
import { recordClientDebug } from "@/lib/client-debug";
import type { DesignerForm } from "@/lib/lighting/partitura-model";
import { clamp, pickAnimationTarget, worldHitTolerance } from "../designer/designer-geometry";
import type { CompiledDesignerLayout } from "../designer/designer-compiler";
import type { DesignerAnimationDiffuser } from "../designer/designer-paper-canvas";
import type { DiffuserRenderSettings } from "./optical-model";
import type { DesignerSelection, DesignerViewport } from "../designer/types";
import { buildVisualScene } from "@/lib/lighting/visual-scene-builder";
import { PlayerController, type PlayerStatus } from "./player-controller";
import { Webgl2PlayerRenderer } from "./gpu/webgl2-player-renderer";
import { normalizePlayerViewport } from "./player-viewport";
import { synchronizePlayerPlayback, synchronizePlayerScene } from "./player-control-sync";

export type PlayerSurfaceHandle = {
  seek(timeMs: number): void;
  stop(): void;
};

type PlayerSurfaceProps = {
  partitura: Partitura;
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  viewport: DesignerViewport;
  activeSceneId: string;
  playing: boolean;
  presentation: DesignerAnimationDiffuser;
  faceMaskEnabled?: boolean;
  settings: DiffuserRenderSettings;
  selection?: DesignerSelection;
  onViewportChange: (viewport: DesignerViewport) => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onStatus?: (status: PlayerStatus) => void;
  className?: string;
};

export const PlayerSurface = forwardRef<PlayerSurfaceHandle, PlayerSurfaceProps>(function PlayerSurface({
  partitura,
  designer,
  layout,
  viewport,
  activeSceneId,
  playing,
  presentation,
  faceMaskEnabled = true,
  settings,
  selection = null,
  onViewportChange,
  onSelect,
  onStatus,
  className = ""
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Webgl2PlayerRenderer | null>(null);
  const controllerRef = useRef<PlayerController | null>(null);
  const visualScene = useMemo(() => buildVisualScene(partitura, designer, layout), [partitura, designer, layout]);
  const sceneRef = useRef({ partitura, visualScene });
  const presentationRef = useRef(presentation);
  const faceMaskEnabledRef = useRef(faceMaskEnabled);
  const settingsRef = useRef(settings);
  const selectionRef = useRef(selection);
  const colorModeRef = useRef<"day" | "night">("night");
  const onStatusRef = useRef(onStatus);
  const loadedRendererSceneRef = useRef<typeof sceneRef.current | null>(null);
  const requestedViewportRef = useRef(viewport);
  const viewportRef = useRef(normalizePlayerViewport(viewport, { width: 1, height: 1 }));
  const desiredPlayingRef = useRef(playing);
  const sizeRef = useRef({ width: 1, height: 1, pixelRatio: 1 });
  const panRef = useRef<{ clientX: number; clientY: number; viewport: DesignerViewport } | null>(null);
  const [status, setStatus] = useState<PlayerStatus>({ state: "empty", sceneId: activeSceneId, timeMs: 0, durationMs: 0, pixelCount: 0 });
  const [colorMode, setColorMode] = useState<"day" | "night">("night");

  sceneRef.current = { partitura, visualScene };
  requestedViewportRef.current = viewport;
  viewportRef.current = normalizePlayerViewport(viewport, sizeRef.current);
  desiredPlayingRef.current = playing;
  presentationRef.current = presentation;
  faceMaskEnabledRef.current = faceMaskEnabled;
  settingsRef.current = settings;
  selectionRef.current = selection;
  colorModeRef.current = colorMode;
  onStatusRef.current = onStatus;

  useImperativeHandle(ref, () => ({
    seek: (timeMs) => controllerRef.current?.seek(timeMs),
    stop: () => controllerRef.current?.stop()
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer = new Webgl2PlayerRenderer();
    renderer.initialize(canvas);
    rendererRef.current = renderer;
    const controller = new PlayerController({
      onFrame: (colors) => {
        const activeRenderer = rendererRef.current;
        if (!activeRenderer) return;
        activeRenderer.updateColors(colors);
        activeRenderer.render();
      },
      onStatus: (nextStatus) => {
        setStatus(nextStatus);
        onStatusRef.current?.(nextStatus);
      }
    }, { targetFps: 30 });
    controllerRef.current = controller;

    const restoreRenderer = () => {
      const scene = sceneRef.current;
      renderer.destroy();
      renderer = new Webgl2PlayerRenderer();
      renderer.initialize(canvas);
      renderer.loadScene(scene);
      loadedRendererSceneRef.current = scene;
      renderer.updateViewport(viewportRef.current);
      renderer.updatePresentation(presentationRef.current);
      renderer.updateFaceMaskEnabled(faceMaskEnabledRef.current);
      renderer.updateOpticalSettings(settingsRef.current);
      renderer.updateSelection(playerOutlineSelection(selectionRef.current));
      renderer.updateColorMode(colorModeRef.current);
      const size = sizeRef.current;
      renderer.resize(size.width, size.height, size.pixelRatio);
      rendererRef.current = renderer;
      controller.seek(controller.getStatus().timeMs);
    };
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      const state = controller.getStatus().state;
      if (state === "ready" || state === "playing" || state === "paused") controller.pause();
      recordClientDebug("webgl_context_lost", { path: window.location.pathname, runtime: "player-v2" });
    };
    const handleContextRestored = () => {
      recordClientDebug("webgl_context_restored", { path: window.location.pathname, runtime: "player-v2" });
      restoreRenderer();
      if (desiredPlayingRef.current) controller.play();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      controller.destroy();
      renderer.destroy();
      controllerRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const syncColorMode = () => setColorMode(document.documentElement.classList.contains("dark") ? "night" : "day");
    syncColorMode();
    const observer = new MutationObserver(syncColorMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width, height, pixelRatio };
      const normalizedViewport = normalizePlayerViewport(requestedViewportRef.current, sizeRef.current);
      viewportRef.current = normalizedViewport;
      rendererRef.current?.updateViewport(normalizedViewport);
      rendererRef.current?.resize(width, height, pixelRatio);
      rendererRef.current?.render();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      controllerRef.current?.setSuspended(!entry.isIntersecting);
    }, { threshold: 0.01 });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const controller = controllerRef.current;
    if (!renderer || !controller) return;
    renderer.loadScene({ partitura, visualScene });
    loadedRendererSceneRef.current = { partitura, visualScene };
    renderer.updateViewport(viewportRef.current);
    renderer.updatePresentation(presentation);
    renderer.updateFaceMaskEnabled(faceMaskEnabled);
    renderer.updateOpticalSettings(settings);
    renderer.updateSelection(playerOutlineSelection(selection));
    renderer.updateColorMode(colorMode);
    const size = sizeRef.current;
    renderer.resize(size.width, size.height, size.pixelRatio);
    let cancelled = false;
    void controller.load(partitura).then(() => {
      if (cancelled) return;
      if (activeSceneId !== partitura.defaultScene) controller.setScene(activeSceneId);
      if (desiredPlayingRef.current) controller.play();
    }).catch((error) => {
      if (!cancelled) recordClientDebug("player_runtime_load_error", { message: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [partitura]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const loaded = loadedRendererSceneRef.current;
    if (loaded?.partitura === partitura && loaded.visualScene === visualScene) return;
    const nextScene = { partitura, visualScene };
    renderer.loadScene(nextScene);
    loadedRendererSceneRef.current = nextScene;
    renderer.updateViewport(viewportRef.current);
    renderer.updatePresentation(presentation);
    renderer.updateFaceMaskEnabled(faceMaskEnabled);
    renderer.updateOpticalSettings(settings);
    renderer.updateSelection(playerOutlineSelection(selection));
    renderer.updateColorMode(colorMode);
    renderer.render();
    const controller = controllerRef.current;
    const controllerState = controller?.getStatus().state;
    if (controller && controllerState !== "empty" && controllerState !== "loading" && controllerState !== "error" && controllerState !== "destroyed") {
      controller.seek(controller.getStatus().timeMs);
    }
  }, [partitura, visualScene]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const normalizedViewport = normalizePlayerViewport(viewport, sizeRef.current);
    viewportRef.current = normalizedViewport;
    renderer.updateViewport(normalizedViewport);
    renderer.render();
  }, [viewport]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.updatePresentation(presentation);
    renderer.updateOpticalSettings(settings);
    renderer.updateColorMode(colorMode);
    renderer.render();
  }, [colorMode, faceMaskEnabled, presentation, settings]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.updateSelection(playerOutlineSelection(selection));
    renderer.render();
  }, [selection]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    synchronizePlayerScene(controller, activeSceneId);
  }, [activeSceneId, status.state]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    synchronizePlayerPlayback(controller, playing);
  }, [playing, status.state]);

  function screenToWorld(clientX: number, clientY: number) {
    const rect = hostRef.current?.getBoundingClientRect();
    const activeViewport = viewportRef.current;
    if (!rect) return { x: activeViewport.x, y: activeViewport.y };
    return {
      x: activeViewport.x + ((clientX - rect.left) / Math.max(1, rect.width)) * activeViewport.width,
      y: activeViewport.y + ((clientY - rect.top) / Math.max(1, rect.height)) * activeViewport.height
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const point = screenToWorld(event.clientX, event.clientY);
    const target = pickAnimationTarget(designer, point, worldHitTolerance(viewportRef.current, sizeRef.current) * 2.25);
    if (target) {
      onSelect(target);
      return;
    }
    onSelect(null);
    panRef.current = { clientX: event.clientX, clientY: event.clientY, viewport: viewportRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan) return;
    const dx = ((event.clientX - pan.clientX) / Math.max(1, sizeRef.current.width)) * pan.viewport.width;
    const dy = ((event.clientY - pan.clientY) / Math.max(1, sizeRef.current.height)) * pan.viewport.height;
    onViewportChange(clampViewport({ ...pan.viewport, x: pan.viewport.x - dx, y: pan.viewport.y - dy }, designer, sizeRef.current));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const activeViewport = viewportRef.current;
    const anchor = screenToWorld(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const rect = hostRef.current?.getBoundingClientRect();
    const ratioX = rect ? (event.clientX - rect.left) / Math.max(1, rect.width) : 0.5;
    const ratioY = rect ? (event.clientY - rect.top) / Math.max(1, rect.height) : 0.5;
    const width = clamp(activeViewport.width * factor, designer.canvasWidthCm * 0.05, designer.canvasWidthCm * 1.5);
    const height = clamp(activeViewport.height * factor, designer.canvasHeightCm * 0.05, designer.canvasHeightCm * 1.5);
    onViewportChange(clampViewport({ x: anchor.x - ratioX * width, y: anchor.y - ratioY * height, width, height }, designer, sizeRef.current));
  }

  return (
    <div
      ref={hostRef}
      className={`relative h-full min-h-0 w-full cursor-grab overflow-hidden bg-muted active:cursor-grabbing ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Iluminate scene player" />
      {status.state === "loading" ? <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/40 text-body-sm text-muted-foreground">Preparing scene…</div> : null}
      {status.state === "error" ? <div className="pointer-events-none absolute inset-0 grid place-items-center bg-red-950/70 p-6 text-center text-body-sm text-red-100">{status.message ?? "Player failed."}</div> : null}
    </div>
  );
});

function playerOutlineSelection(selection: DesignerSelection) {
  return selection?.type === "zone" || selection?.type === "channel"
    ? { type: selection.type, id: selection.id }
    : null;
}

function clampViewport(viewport: DesignerViewport, designer: DesignerForm, size: { width: number; height: number }) {
  const aspect = Math.max(0.1, size.width / Math.max(1, size.height));
  const width = Math.max(designer.canvasWidthCm * 0.05, viewport.width);
  const height = width / aspect;
  const marginX = width <= designer.canvasWidthCm ? 0 : (width - designer.canvasWidthCm) / 2;
  const marginY = height <= designer.canvasHeightCm ? 0 : (height - designer.canvasHeightCm) / 2;
  return {
    x: clamp(viewport.x, -marginX, designer.canvasWidthCm - width + marginX),
    y: clamp(viewport.y, -marginY, designer.canvasHeightCm - height + marginY),
    width,
    height
  };
}
