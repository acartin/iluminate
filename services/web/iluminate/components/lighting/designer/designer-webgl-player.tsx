"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignerForm } from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "./designer-compiler";
import { clamp, pickAnimationTarget, worldHitTolerance } from "./designer-geometry";
import type { DesignerSelection, DesignerViewport } from "./types";
import type { DesignerAnimationDiffuser, DesignerAnimationPixel } from "./designer-paper-canvas";
import { recordClientDebug } from "@/lib/client-debug";
import {
  DEFAULT_DIFFUSER_RENDER_SETTINGS,
  releasePixiFrameResources,
  renderPixiAnimationFrame,
  type DiffuserRenderSettings
} from "./rendering/designer-player-renderers";

type PixiModule = typeof import("pixi.js");
type PixiApp = InstanceType<PixiModule["Application"]>;
export { DEFAULT_DIFFUSER_RENDER_SETTINGS, type DiffuserRenderSettings } from "./rendering/designer-player-renderers";

export function DesignerWebglPlayer({
  designer,
  layout,
  viewport,
  selectedZoneId,
  selectedChannelId,
  selectedZoneIds,
  selectedChannelIds,
  animationPixels = [],
  animationDiffuser = "as_built",
  diffuserSettings = DEFAULT_DIFFUSER_RENDER_SETTINGS,
  onViewportChange,
  onSelect
}: {
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  viewport: DesignerViewport;
  selectedZoneId?: string;
  selectedChannelId?: string;
  selectedZoneIds?: string[];
  selectedChannelIds?: string[];
  animationPixels?: DesignerAnimationPixel[];
  animationDiffuser?: DesignerAnimationDiffuser;
  diffuserSettings?: DiffuserRenderSettings;
  onViewportChange: (viewport: DesignerViewport) => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PixiApp | null>(null);
  const pixiRef = useRef<PixiModule | null>(null);
  const panRef = useRef<{ clientX: number; clientY: number; viewport: DesignerViewport } | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [colorMode, setColorMode] = useState<"day" | "night">("night");
  const presentationViewport = canvasSize.width > 0 && canvasSize.height > 0
    ? normalizePresentationViewport(viewport, designer, canvasSize.width / canvasSize.height)
    : viewport;

  useEffect(() => {
    const syncColorMode = () => setColorMode(window.document.documentElement.classList.contains("dark") ? "night" : "day");
    syncColorMode();
    const observer = new MutationObserver(syncColorMode);
    observer.observe(window.document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({
        width: Math.max(1, Math.round(entry.contentRect.width)),
        height: Math.max(1, Math.round(entry.contentRect.height))
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (canvasSize.width < 1 || canvasSize.height < 1) return;
    const hasChanged = Math.abs(presentationViewport.x - viewport.x) > 0.001
      || Math.abs(presentationViewport.y - viewport.y) > 0.001
      || Math.abs(presentationViewport.width - viewport.width) > 0.001
      || Math.abs(presentationViewport.height - viewport.height) > 0.001;
    if (hasChanged) onViewportChange(presentationViewport);
  }, [canvasSize.height, canvasSize.width, designer, onViewportChange, viewport]);

  useEffect(() => {
    let cancelled = false;
    let app: PixiApp | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const handleContextLost = () => recordClientDebug("webgl_context_lost", { path: window.location.pathname });
    const handleContextRestored = () => recordClientDebug("webgl_context_restored", { path: window.location.pathname });
    async function start() {
      const host = hostRef.current;
      if (!host) return;
      const pixi = await import("pixi.js");
      if (cancelled) return;
      pixiRef.current = pixi;
      app = new pixi.Application();
      await app.init({
        antialias: true,
        autoDensity: true,
        backgroundAlpha: 0,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        resizeTo: host
      });
      if (cancelled) {
        destroyPixiApplication(app);
        app = null;
        return;
      }
      appRef.current = app;
      canvas = app.canvas;
      canvas.addEventListener("webglcontextlost", handleContextLost);
      canvas.addEventListener("webglcontextrestored", handleContextRestored);
      host.appendChild(canvas);
      setReady(true);
    }
    start();
    return () => {
      cancelled = true;
      setReady(false);
      canvas?.removeEventListener("webglcontextlost", handleContextLost);
      canvas?.removeEventListener("webglcontextrestored", handleContextRestored);
      canvas = null;
      if (appRef.current) {
        destroyPixiApplication(appRef.current);
        appRef.current = null;
        app = null;
      }
      pixiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    const pixi = pixiRef.current;
    if (!ready || !app || !pixi || canvasSize.width < 1 || canvasSize.height < 1) return;
    renderPixiAnimationFrame({
      app,
      pixi,
      designer,
      layout,
      viewport: presentationViewport,
      canvasSize,
      selectedZoneId,
      selectedChannelId,
      selectedZoneIds,
      selectedChannelIds,
      animationPixels,
      presentation: animationDiffuser,
      settings: diffuserSettings,
      colorMode
    });
  }, [animationPixels, animationDiffuser, canvasSize, colorMode, designer, diffuserSettings, layout, presentationViewport, ready, selectedChannelId, selectedChannelIds, selectedZoneId, selectedZoneIds]);

  function screenToWorld(clientX: number, clientY: number) {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { x: presentationViewport.x, y: presentationViewport.y };
    return {
      x: presentationViewport.x + ((clientX - rect.left) / Math.max(1, rect.width)) * presentationViewport.width,
      y: presentationViewport.y + ((clientY - rect.top) / Math.max(1, rect.height)) * presentationViewport.height
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const point = screenToWorld(event.clientX, event.clientY);
    const tolerance = worldHitTolerance(presentationViewport, canvasSize) * 2.25;
    const target = pickAnimationTarget(designer, point, tolerance);
    if (target) {
      onSelect(target, event.shiftKey || event.ctrlKey || event.metaKey);
      return;
    }
    onSelect(null);
    panRef.current = { clientX: event.clientX, clientY: event.clientY, viewport: presentationViewport };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan) return;
    const dx = ((event.clientX - pan.clientX) / Math.max(1, canvasSize.width)) * pan.viewport.width;
    const dy = ((event.clientY - pan.clientY) / Math.max(1, canvasSize.height)) * pan.viewport.height;
    onViewportChange(clampPresentationViewport({ ...pan.viewport, x: pan.viewport.x - dx, y: pan.viewport.y - dy }, designer, canvasSize));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const anchor = screenToWorld(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const nextWidth = Math.max(designer.canvasWidthCm * 0.05, Math.min(designer.canvasWidthCm * 1.12, presentationViewport.width * factor));
    const nextHeight = Math.max(designer.canvasHeightCm * 0.05, Math.min(designer.canvasHeightCm * 1.12, presentationViewport.height * factor));
    const rect = hostRef.current?.getBoundingClientRect();
    const ratioX = rect ? (event.clientX - rect.left) / Math.max(1, rect.width) : 0.5;
    const ratioY = rect ? (event.clientY - rect.top) / Math.max(1, rect.height) : 0.5;
    onViewportChange(clampPresentationViewport({
      x: anchor.x - ratioX * nextWidth,
      y: anchor.y - ratioY * nextHeight,
      width: nextWidth,
      height: nextHeight
    }, designer, canvasSize));
  }

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full cursor-grab overflow-hidden bg-muted active:cursor-grabbing [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
    </div>
  );
}

function destroyPixiApplication(app: PixiApp) {
  releasePixiFrameResources(app);
  // Pixi 8 interprets rendererDestroyOptions=true as both "remove the canvas"
  // and "release every global resource pool". Viewer and Animate can briefly
  // own separate applications, so releasing those shared pools while the
  // other renderer is alive invalidates its managed text/filter textures.
  app.destroy(
    { removeView: true, releaseGlobalResources: false },
    { children: true, context: true }
  );
}

function normalizePresentationViewport(viewport: DesignerViewport, designer: DesignerForm, canvasAspect: number): DesignerViewport {
  const aspect = Math.max(0.1, canvasAspect);
  const widthFromHeight = designer.canvasHeightCm * aspect;
  const heightFromWidth = designer.canvasWidthCm / aspect;
  const fitWidth = Math.max(designer.canvasWidthCm, widthFromHeight) * 1.04;
  const fitHeight = Math.max(designer.canvasHeightCm, heightFromWidth) * 1.04;
  const normalized = normalizeAspect({
    ...viewport,
    width: Math.min(Math.max(viewport.width, designer.canvasWidthCm * 0.05), fitWidth),
    height: Math.min(Math.max(viewport.height, designer.canvasHeightCm * 0.05), fitHeight)
  }, aspect);
  return clampPresentationViewport(normalized, designer, { width: aspect, height: 1 });
}

function clampPresentationViewport(viewport: DesignerViewport, designer: DesignerForm, canvasSize: { width: number; height: number }): DesignerViewport {
  const aspect = Math.max(0.1, canvasSize.width / Math.max(1, canvasSize.height));
  const normalized = normalizeAspect(viewport, aspect);
  const marginX = normalized.width <= designer.canvasWidthCm ? 0 : (normalized.width - designer.canvasWidthCm) / 2;
  const marginY = normalized.height <= designer.canvasHeightCm ? 0 : (normalized.height - designer.canvasHeightCm) / 2;
  const minX = -marginX;
  const maxX = designer.canvasWidthCm - normalized.width + marginX;
  const minY = -marginY;
  const maxY = designer.canvasHeightCm - normalized.height + marginY;
  return {
    ...normalized,
    x: minX > maxX ? (minX + maxX) / 2 : clamp(normalized.x, minX, maxX),
    y: minY > maxY ? (minY + maxY) / 2 : clamp(normalized.y, minY, maxY)
  };
}

function normalizeAspect(viewport: DesignerViewport, canvasAspect: number): DesignerViewport {
  const scale = Math.max(viewport.width / canvasAspect, viewport.height);
  const width = scale * canvasAspect;
  const height = scale;
  return {
    x: viewport.x - (width - viewport.width) / 2,
    y: viewport.y - (height - viewport.height) / 2,
    width,
    height
  };
}
