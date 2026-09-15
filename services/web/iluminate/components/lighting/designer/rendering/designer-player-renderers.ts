"use client";

import type { DesignerForm, DesignerPoint, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "../designer-compiler";
import { clamp, pointInsideDesignerShape } from "../designer-geometry";
import type { DesignerViewport } from "../types";
import type { DesignerAnimationDiffuser, DesignerAnimationPixel } from "../designer-paper-canvas";

type PixiModule = typeof import("pixi.js");

export type DiffuserRenderSettings = {
  diffuserDistanceCm: number;
  intensity: number;
  afterZoneEffectCm: number;
  afterZoneOpacity: number;
};

export const DEFAULT_DIFFUSER_RENDER_SETTINGS: DiffuserRenderSettings = {
  diffuserDistanceCm: 10,
  intensity: 1,
  afterZoneEffectCm: 0,
  afterZoneOpacity: 0.26
};

const STANDARD_WS2812B_VIEW_ANGLE_DEG = 120;
const DEFAULT_ACRYLIC_THICKNESS_MM = 3;

export function renderDirectLedFrame({
  app,
  pixi,
  designer,
  layout,
  viewport,
  canvasSize,
  selectedZoneId,
  animationPixels,
  colorMode
}: {
  app: InstanceType<PixiModule["Application"]>;
  pixi: PixiModule;
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  viewport: DesignerViewport;
  canvasSize: { width: number; height: number };
  selectedZoneId?: string;
  animationPixels: DesignerAnimationPixel[];
  colorMode: "day" | "night";
}) {
  app.renderer.resize(canvasSize.width, canvasSize.height);
  app.stage.removeChildren().forEach((child) => child.destroy({ children: true }));

  const colors = colorMode === "night"
    ? { workspace: 0x020617, document: 0x090d16, documentStroke: 0x1e293b, grid: 0x334155, zoneFill: 0x64748b, selected: 0x60a5fa, label: 0x94a3b8, ledStroke: 0x1e293b }
    : { workspace: 0xe2e8f0, document: 0xffffff, documentStroke: 0x94a3b8, grid: 0x94a3b8, zoneFill: 0x64748b, selected: 0x2563eb, label: 0x475569, ledStroke: 0x94a3b8 };
  const g = new pixi.Graphics();
  app.stage.addChild(g);

  g.rect(0, 0, canvasSize.width, canvasSize.height).fill({ color: colors.workspace });
  drawDocument(g, designer, viewport, canvasSize, colors, false);
  drawZones(g, pixi, designer, viewport, canvasSize, selectedZoneId, colors, app.stage, false);
  drawPixels(g, designer, layout, viewport, canvasSize, selectedZoneId, animationPixels, colors);

  const text = new pixi.Text({ text: `${layout.pixelMap.length} mapped pixels`, style: { fill: colors.label, fontFamily: "monospace", fontSize: 11 } });
  text.x = 16;
  text.y = canvasSize.height - 20;
  app.stage.addChild(text);
  app.render();
}

export function clearDiffuserFrame(canvas: HTMLCanvasElement, canvasSize: { width: number; height: number }) {
  const context = setupCanvas(canvas, canvasSize);
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

export function renderDiffuserFrame({
  canvas,
  designer,
  layout,
  viewport,
  canvasSize,
  selectedZoneId,
  animationPixels,
  diffuser,
  settings,
  colorMode
}: {
  canvas: HTMLCanvasElement;
  designer: DesignerForm;
  layout: CompiledDesignerLayout;
  viewport: DesignerViewport;
  canvasSize: { width: number; height: number };
  selectedZoneId?: string;
  animationPixels: DesignerAnimationPixel[];
  diffuser: DesignerAnimationDiffuser;
  settings: DiffuserRenderSettings;
  colorMode: "day" | "night";
}) {
  const context = setupCanvas(canvas, canvasSize);
  if (!context) return;
  const palette = colorMode === "night"
    ? { workspace: "#020617", document: "#07111f", documentStroke: "#334155", zoneStroke: "rgba(148, 163, 184, 0.35)", label: "rgba(148, 163, 184, 0.58)" }
    : { workspace: "#e2e8f0", document: "#ffffff", documentStroke: "#94a3b8", zoneStroke: "rgba(100, 116, 139, 0.32)", label: "rgba(71, 85, 105, 0.5)" };

  context.fillStyle = palette.workspace;
  context.fillRect(0, 0, canvasSize.width, canvasSize.height);
  drawCanvasDocument(context, designer, viewport, canvasSize, palette);

  const renderedColors = new Map(animationPixels.map((pixel) => [`${pixel.output}:${pixel.serialIndex}`, pixel.color]));
  const zonesByPixel = buildExclusiveZonesByPixel(designer, layout);
  const pixelsByZone = new Map<string, Array<CompiledDesignerLayout["pixelMap"][number]>>();

  layout.pixelMap.forEach((pixel) => {
    const rendered = renderedColors.get(`${pixel.output}:${pixel.serialIndex}`);
    if (!rendered || lightEnergy(rendered) <= 2) return;
    const zones = zonesByPixel.get(pixel.id) ?? [];
    zones.forEach((zone) => {
      const pixels = pixelsByZone.get(zone.id) ?? [];
      pixels.push(pixel);
      pixelsByZone.set(zone.id, pixels);
    });
  });

  const optical = resolveDiffuserOptics(designer, diffuser, settings);
  const renderIntensity = settings.intensity * 2;
  const emitterRadiusPx = Math.max(2, screenUniformLength(optical.emitterRadiusCm, viewport, canvasSize));
  const blurPx = Math.max(0, screenUniformLength(optical.blurCm, viewport, canvasSize));
  const afterRadiusPx = Math.max(0, screenUniformLength(settings.afterZoneEffectCm, viewport, canvasSize));

  if (afterRadiusPx > 0 && settings.afterZoneOpacity > 0) {
    const haloCanvas = createLayerCanvas(canvasSize);
    const halo = haloCanvas.getContext("2d");
    if (halo) {
      const afterZoneStrength = clamp(settings.afterZoneEffectCm / 6, 0, 1);
      const haloRadiusPx = Math.max(afterRadiusPx * 1.35, emitterRadiusPx * 0.8);
      pixelsByZone.forEach((pixels) => drawCanvasEmitters(halo, pixels, renderedColors, viewport, canvasSize, haloRadiusPx, renderIntensity, 0.9));
      context.save();
      context.globalCompositeOperation = "screen";
      context.filter = `blur(${Math.max(1, afterRadiusPx * 0.45)}px)`;
      context.globalAlpha = clamp(settings.afterZoneOpacity * (0.35 + afterZoneStrength * 0.65) * settings.intensity, 0, 0.7);
      context.drawImage(haloCanvas, 0, 0);
      context.restore();
    }
  }

  designer.zones.forEach((zone) => {
    const zonePixels = pixelsByZone.get(zone.id) ?? [];
    const litLayer = createLayerCanvas(canvasSize);
    const lit = litLayer.getContext("2d");
    if (lit) {
      drawCanvasEmitters(lit, zonePixels, renderedColors, viewport, canvasSize, emitterRadiusPx, renderIntensity * (diffuser === "day_night" ? 1.1 : 1), optical.hotspotAlpha);
    }

    context.save();
    canvasShapePath(context, zone, viewport, canvasSize);
    context.clip();
    paintDiffuserMaterial(context, zone, viewport, canvasSize, diffuser, zonePixels.length ? 1 : 0.16);
    context.globalCompositeOperation = diffuser === "day_night" ? "lighter" : "source-over";
    context.filter = blurPx > 0 ? `blur(${blurPx}px)` : "none";
    context.drawImage(litLayer, 0, 0);
    context.globalAlpha = 1;
    context.filter = "none";
    if (diffuser === "milky_white") {
      context.globalCompositeOperation = "screen";
      context.globalAlpha = 0.08;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }
    context.restore();

    context.save();
    canvasShapePath(context, zone, viewport, canvasSize);
    context.strokeStyle = zone.id === selectedZoneId ? "#38bdf8" : palette.zoneStroke;
    context.lineWidth = zone.id === selectedZoneId ? 1.8 : 1;
    context.stroke();
    const labelPoint = toScreen({ x: zone.x + 1, y: zone.y + 2.4 }, viewport, canvasSize);
    context.fillStyle = zone.id === selectedZoneId ? "#0284c7" : palette.label;
    context.font = `${zone.id === selectedZoneId ? 13 : 11}px sans-serif`;
    context.fillText(zone.name, labelPoint.x, labelPoint.y);
    context.restore();
  });
}

function resolveDiffuserOptics(designer: DesignerForm, diffuser: DesignerAnimationDiffuser, settings: DiffuserRenderSettings) {
  const pitchCm = 100 / Math.max(1, designer.addressablePixelsPerMeter);
  const distanceCm = clamp(settings.diffuserDistanceCm, 0.5, 20);
  const halfAngleRad = (STANDARD_WS2812B_VIEW_ANGLE_DEG / 2) * Math.PI / 180;
  const geometricRadiusCm = distanceCm * Math.tan(halfAngleRad) * 0.18;
  const materialScatterCm = DEFAULT_ACRYLIC_THICKNESS_MM * (diffuser === "milky_white" ? 0.42 : 0.2);
  const blendProgress = smoothstep(3, 10, distanceCm);
  const emitterRadiusCm = Math.max(pitchCm * 0.32, geometricRadiusCm + materialScatterCm);
  const blurCm = (materialScatterCm * 0.35 + distanceCm * 0.045) * blendProgress;
  return {
    emitterRadiusCm,
    blurCm,
    hotspotAlpha: lerp(0.92, 0.48, blendProgress)
  };
}

function toScreen(point: DesignerPoint, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  return {
    x: ((point.x - viewport.x) / viewport.width) * canvasSize.width,
    y: ((point.y - viewport.y) / viewport.height) * canvasSize.height
  };
}

function screenLength(cm: number, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  return cm * Math.min(canvasSize.width / viewport.width, canvasSize.height / viewport.height);
}

function screenUniformLength(cm: number, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  return cm * ((canvasSize.width / viewport.width + canvasSize.height / viewport.height) / 2);
}

function drawDocument(g: any, designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, colors: Record<string, number>, diffused: boolean) {
  const topLeft = toScreen({ x: 0, y: 0 }, viewport, canvasSize);
  const bottomRight = toScreen({ x: designer.canvasWidthCm, y: designer.canvasHeightCm }, viewport, canvasSize);
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  g.rect(topLeft.x, topLeft.y, width, height).fill({ color: colors.document }).stroke({ color: colors.documentStroke, width: 1.2 });
  if (diffused) return;
  const step = Math.max(1, designer.snapCm || 1);
  const majorEvery = step < 5 ? Math.round(10 / step) : 2;
  const startX = Math.max(0, Math.ceil(viewport.x / step) * step);
  const endX = Math.min(designer.canvasWidthCm, viewport.x + viewport.width);
  const startY = Math.max(0, Math.ceil(viewport.y / step) * step);
  const endY = Math.min(designer.canvasHeightCm, viewport.y + viewport.height);
  for (let x = startX; x <= endX; x += step) {
    const point = toScreen({ x, y: 0 }, viewport, canvasSize);
    const major = Math.round(x / step) % majorEvery === 0;
    g.moveTo(point.x, topLeft.y).lineTo(point.x, bottomRight.y).stroke({ color: colors.grid, alpha: major ? 0.34 : 0.13, width: major ? 1 : 0.7 });
  }
  for (let y = startY; y <= endY; y += step) {
    const point = toScreen({ x: 0, y }, viewport, canvasSize);
    const major = Math.round(y / step) % majorEvery === 0;
    g.moveTo(topLeft.x, point.y).lineTo(bottomRight.x, point.y).stroke({ color: colors.grid, alpha: major ? 0.34 : 0.13, width: major ? 1 : 0.7 });
  }
}

function drawZones(g: any, pixi: PixiModule, designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, selectedZoneId: string | undefined, colors: Record<string, number>, stage: any, diffused: boolean) {
  [...designer.zones].reverse().forEach((zone) => {
    const selected = zone.id === selectedZoneId;
    drawClosedShape(g, zone, viewport, canvasSize);
    g.fill({ color: selected ? colors.selected : colors.zoneFill, alpha: diffused ? 0.035 : selected ? 0.22 : 0.1 * designer.layers.zones.opacity });
    g.stroke({ color: selected ? colors.selected : 0x64748b, alpha: diffused ? 0.12 : selected ? 0.95 : 0.45 * designer.layers.zones.opacity, width: selected ? 2 : 1.1 });
    if (diffused) return;
    const labelPoint = toScreen({ x: zone.x + 1, y: zone.y + 2.4 }, viewport, canvasSize);
    const label = new pixi.Text({ text: zone.name, style: { fill: selected ? colors.selected : colors.label, fontFamily: "sans-serif", fontSize: selected ? 13 : 11 } });
    label.alpha = selected ? 1 : 0.72;
    label.x = labelPoint.x;
    label.y = labelPoint.y;
    stage.addChild(label);
  });
}

function drawClosedShape(g: any, shape: DesignerZoneForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  if (shape.shape === "ellipse") {
    const center = toScreen({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, viewport, canvasSize);
    const radiusX = Math.abs(shape.width / 2 * canvasSize.width / viewport.width);
    const radiusY = Math.abs(shape.height / 2 * canvasSize.height / viewport.height);
    g.ellipse(center.x, center.y, radiusX, radiusY);
    return;
  }
  if (shape.shape === "polygon" && shape.points?.length) {
    const first = toScreen(shape.points[0], viewport, canvasSize);
    g.moveTo(first.x, first.y);
    shape.points.forEach((start, index) => {
      const end = shape.points![(index + 1) % shape.points!.length];
      const next = toScreen(end, viewport, canvasSize);
      if (shape.pathMode === "bezier" && (start.handleOut || end.handleIn)) {
        const cp1 = toScreen({ x: start.x + (start.handleOut?.x ?? 0), y: start.y + (start.handleOut?.y ?? 0) }, viewport, canvasSize);
        const cp2 = toScreen({ x: end.x + (end.handleIn?.x ?? 0), y: end.y + (end.handleIn?.y ?? 0) }, viewport, canvasSize);
        g.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
      } else {
        g.lineTo(next.x, next.y);
      }
    });
    g.closePath();
    return;
  }
  const topLeft = toScreen({ x: shape.x, y: shape.y }, viewport, canvasSize);
  const bottomRight = toScreen({ x: shape.x + shape.width, y: shape.y + shape.height }, viewport, canvasSize);
  g.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function drawPixels(
  g: any,
  designer: DesignerForm,
  layout: CompiledDesignerLayout,
  viewport: DesignerViewport,
  canvasSize: { width: number; height: number },
  selectedZoneId: string | undefined,
  animationPixels: DesignerAnimationPixel[],
  colors: Record<string, number>
) {
  const renderedColors = new Map(animationPixels.map((pixel) => [`${pixel.output}:${pixel.serialIndex}`, pixel.color]));
  const pitchCm = 100 / Math.max(1, designer.addressablePixelsPerMeter);
  const packageCm = Math.min(0.7, pitchCm * 0.42);
  const dotSize = Math.max(1.5, Math.min(54, screenLength(packageCm, viewport, canvasSize)));
  layout.pixelMap.forEach((pixel) => {
    const point = toScreen(pixel, viewport, canvasSize);
    const rendered = renderedColors.get(`${pixel.output}:${pixel.serialIndex}`);
    const fillColor = rendered ? rgbToNumber(rendered) : 0x64748b;
    const selected = selectedZoneId ? designer.zones.some((zone) => zone.id === selectedZoneId && pointInsideDesignerShape(zone, pixel)) : false;
    g.rect(point.x - dotSize / 2, point.y - dotSize / 2, dotSize, dotSize)
      .fill({ color: rendered ? fillColor : selected ? colors.selected : 0x64748b, alpha: rendered ? 1 : selected ? 0.86 : 0.7 })
      .stroke({ color: selected ? 0xdbeafe : colors.ledStroke, alpha: selected ? 0.95 : 0.55, width: 0.75 });
  });
}

function setupCanvas(canvas: HTMLCanvasElement, canvasSize: { width: number; height: number }) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvasSize.width * ratio));
  const height = Math.max(1, Math.round(canvasSize.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${canvasSize.width}px`;
  canvas.style.height = `${canvasSize.height}px`;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, canvasSize.width, canvasSize.height);
  context.imageSmoothingEnabled = true;
  return context;
}

function createLayerCanvas(canvasSize: { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(canvasSize.width));
  canvas.height = Math.max(1, Math.round(canvasSize.height));
  return canvas;
}

function drawCanvasDocument(context: CanvasRenderingContext2D, designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, palette: { document: string; documentStroke: string }) {
  const topLeft = toScreen({ x: 0, y: 0 }, viewport, canvasSize);
  const bottomRight = toScreen({ x: designer.canvasWidthCm, y: designer.canvasHeightCm }, viewport, canvasSize);
  context.fillStyle = palette.document;
  context.strokeStyle = palette.documentStroke;
  context.lineWidth = 1.2;
  context.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function buildExclusiveZonesByPixel(designer: DesignerForm, layout: CompiledDesignerLayout) {
  const designerZones = new Map(designer.zones.map((zone) => [zone.id, zone]));
  const assignments = new Map<string, DesignerZoneForm>();
  layout.zones.forEach((compiledZone) => {
    const designerZone = designerZones.get(compiledZone.id);
    if (!designerZone) return;
    compiledZone.pixelIds.forEach((pixelId) => {
      const current = assignments.get(pixelId);
      if (!current || designerShapeArea(designerZone) < designerShapeArea(current)) {
        assignments.set(pixelId, designerZone);
      }
    });
  });
  const zonesByPixel = new Map<string, DesignerZoneForm[]>();
  assignments.forEach((zone, pixelId) => zonesByPixel.set(pixelId, [zone]));
  return zonesByPixel;
}

function drawCanvasEmitters(
  context: CanvasRenderingContext2D,
  pixels: Array<CompiledDesignerLayout["pixelMap"][number]>,
  renderedColors: Map<string, { r: number; g: number; b: number }>,
  viewport: DesignerViewport,
  canvasSize: { width: number; height: number },
  radiusPx: number,
  intensity: number,
  peakAlpha = 0.72
) {
  pixels.forEach((pixel) => {
    const rendered = renderedColors.get(`${pixel.output}:${pixel.serialIndex}`);
    if (!rendered || lightEnergy(rendered) <= 2) return;
    const point = toScreen(pixel, viewport, canvasSize);
    const energy = clamp(lightEnergy(rendered) / 765, 0, 1);
    const alpha = clamp(peakAlpha * energy * intensity, 0, 1);
    const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radiusPx);
    gradient.addColorStop(0, `rgba(${rendered.r}, ${rendered.g}, ${rendered.b}, ${alpha})`);
    gradient.addColorStop(0.28, `rgba(${rendered.r}, ${rendered.g}, ${rendered.b}, ${alpha * 0.78})`);
    gradient.addColorStop(0.68, `rgba(${rendered.r}, ${rendered.g}, ${rendered.b}, ${alpha * 0.28})`);
    gradient.addColorStop(1, `rgba(${rendered.r}, ${rendered.g}, ${rendered.b}, 0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    context.fill();
  });
}

function paintDiffuserMaterial(context: CanvasRenderingContext2D, zone: DesignerZoneForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, diffuser: DesignerAnimationDiffuser, opacity = 1) {
  const topLeft = toScreen({ x: zone.x, y: zone.y }, viewport, canvasSize);
  const bottomRight = toScreen({ x: zone.x + zone.width, y: zone.y + zone.height }, viewport, canvasSize);
  const gradient = context.createLinearGradient(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
  if (diffuser === "day_night") {
    gradient.addColorStop(0, `rgba(12, 14, 18, ${0.94 * opacity})`);
    gradient.addColorStop(1, `rgba(35, 39, 46, ${0.9 * opacity})`);
  } else {
    gradient.addColorStop(0, `rgba(245, 248, 250, ${0.96 * opacity})`);
    gradient.addColorStop(1, `rgba(226, 232, 240, ${0.88 * opacity})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

function designerShapeArea(shape: DesignerZoneForm) {
  if (shape.shape === "ellipse") return Math.PI * Math.abs(shape.width / 2) * Math.abs(shape.height / 2);
  if (shape.shape === "polygon" && shape.points?.length) {
    return Math.max(0.0001, Math.abs(shape.points.reduce((total, point, index) => {
      const next = shape.points![(index + 1) % shape.points!.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0)) / 2);
  }
  return Math.max(0.0001, Math.abs(shape.width * shape.height));
}

function canvasShapePath(context: CanvasRenderingContext2D, shape: DesignerZoneForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  context.beginPath();
  if (shape.shape === "ellipse") {
    const center = toScreen({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, viewport, canvasSize);
    const radiusX = Math.abs(shape.width / 2 * canvasSize.width / viewport.width);
    const radiusY = Math.abs(shape.height / 2 * canvasSize.height / viewport.height);
    context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    return;
  }
  if (shape.shape === "polygon" && shape.points?.length) {
    const first = toScreen(shape.points[0], viewport, canvasSize);
    context.moveTo(first.x, first.y);
    shape.points.forEach((start, index) => {
      const end = shape.points![(index + 1) % shape.points!.length];
      const next = toScreen(end, viewport, canvasSize);
      if (shape.pathMode === "bezier" && (start.handleOut || end.handleIn)) {
        const cp1 = toScreen({ x: start.x + (start.handleOut?.x ?? 0), y: start.y + (start.handleOut?.y ?? 0) }, viewport, canvasSize);
        const cp2 = toScreen({ x: end.x + (end.handleIn?.x ?? 0), y: end.y + (end.handleIn?.y ?? 0) }, viewport, canvasSize);
        context.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
      } else {
        context.lineTo(next.x, next.y);
      }
    });
    context.closePath();
    return;
  }
  const topLeft = toScreen({ x: shape.x, y: shape.y }, viewport, canvasSize);
  const bottomRight = toScreen({ x: shape.x + shape.width, y: shape.y + shape.height }, viewport, canvasSize);
  context.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function rgbToNumber(color: { r: number; g: number; b: number }) {
  return (Math.max(0, Math.min(255, color.r)) << 16) + (Math.max(0, Math.min(255, color.g)) << 8) + Math.max(0, Math.min(255, color.b));
}

function lightEnergy(color: { r: number; g: number; b: number }) {
  return Math.max(0, color.r) + Math.max(0, color.g) + Math.max(0, color.b);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * clamp(amount, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
