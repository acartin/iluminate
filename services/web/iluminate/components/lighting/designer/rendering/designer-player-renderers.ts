"use client";

import type { DesignerBuildAreaForm, DesignerChannelForm, DesignerFaceGraphicForm, DesignerFaceGraphicPassMode, DesignerForm, DesignerOpticalTreatment, DesignerPoint, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { designerGeometryAsShape, resolveDesignerDerivedGeometry } from "@/lib/lighting/partitura-model";
import type { CompiledDesignerLayout } from "../designer-compiler";
import { channelBorderPolylines, channelCenterPolyline, channelIsClosed, channelWidthCm, clamp, openChannelOutline, pointInPolygon, pointInsideDesignerShape, shapeOutlinePoints } from "../designer-geometry";
import type { DesignerViewport } from "../types";
import type { DesignerAnimationDiffuser, DesignerAnimationPixel } from "../designer-paper-canvas";

type PixiModule = typeof import("pixi.js");
type PixiApp = InstanceType<PixiModule["Application"]>;
type PixiContainer = InstanceType<PixiModule["Container"]>;
type FrameResource = { destroy: () => void };

const frameResources = new WeakMap<object, FrameResource[]>();

export function registerPixiFrameResource(owner: object, resource: FrameResource) {
  frameResources.set(owner, [...(frameResources.get(owner) ?? []), resource]);
}

export function releasePixiFrameResources(owner: object) {
  const resources = frameResources.get(owner) ?? [];
  frameResources.delete(owner);
  resources.forEach((resource) => resource.destroy());
}

export type DiffuserRenderSettings = {
  diffuserDistanceCm: number;
  intensity: number;
  afterZoneEffectCm: number;
  afterZoneOpacity: number;
  showOutlines: boolean;
};

export const DEFAULT_DIFFUSER_RENDER_SETTINGS: DiffuserRenderSettings = {
  diffuserDistanceCm: 10,
  intensity: 1,
  afterZoneEffectCm: 0,
  afterZoneOpacity: 0.26,
  showOutlines: true
};

export type OpticalRgb = { r: number; g: number; b: number };

/** Front preview is emissive: an unlit diffuser must not add ambient gray. */
export function frontMaterialOffStyle(material: DesignerOpticalTreatment["material"]) {
  return material === "day_night"
    ? { color: 0x171a20, alpha: 0.92 }
    : { color: 0x000000, alpha: 1 };
}

/** Pure reference implementation for the physical Face Graphic contract. */
export function applyFaceGraphicTransmission(color: OpticalRgb, passMode: DesignerFaceGraphicPassMode, filterColor = "#FFFFFF"): OpticalRgb {
  if (passMode === "opaque") return { r: 0, g: 0, b: 0 };
  if (passMode === "clear") return { ...color };
  const filter = hexToRgb(filterColor);
  return {
    r: color.r * filter.r / 255,
    g: color.g * filter.g / 255,
    b: color.b * filter.b / 255
  };
}

export function applyFaceGraphicToOpticalMode(color: OpticalRgb, opticalMode: DesignerOpticalTreatment["mode"], passMode: DesignerFaceGraphicPassMode, filterColor = "#FFFFFF") {
  return opticalMode === "front" ? applyFaceGraphicTransmission(color, passMode, filterColor) : { ...color };
}

/** The first item is visually in front. Outside a defined graphic is opaque. */
export function faceGraphicTransmissionAtPoint(faceGraphics: DesignerFaceGraphicForm[], point: DesignerPoint): { passMode: DesignerFaceGraphicPassMode; filterColor: string } | null {
  if (!faceGraphics.length) return null;
  const region = faceGraphics.find((element) => pointInsideDesignerShape(element, point));
  return region ? { passMode: region.passMode, filterColor: region.filterColor } : { passMode: "opaque", filterColor: "#000000" };
}

/** Reference mapping used by the Face Graphic filter: viewport pixels map to the full transmission texture. */
export function faceGraphicMaskUv(point: DesignerPoint, canvasSize: { width: number; height: number }) {
  return {
    x: point.x / Math.max(1, canvasSize.width),
    y: point.y / Math.max(1, canvasSize.height)
  };
}

/** Resolves every physical Face Graphic region, including live derived profiles. */
export function resolvePhysicalFaceGraphics(designer: DesignerForm): DesignerFaceGraphicForm[] {
  const derived = designer.derivedGeometries.flatMap((operation): DesignerFaceGraphicForm[] => {
    if (operation.targetLayer !== "faceGraphic") return [];
    const resolved = resolveDesignerDerivedGeometry(designer, operation.id);
    if (!resolved.geometry) return [];
    return [{
      id: operation.id,
      geometryId: operation.geometryId,
      name: operation.name,
      ...designerGeometryAsShape(resolved.geometry),
      passMode: operation.passMode ?? "translucent",
      filterColor: operation.filterColor ?? "#FFFFFF",
      // Visibility/opacity are editor aids and do not alter physical transmission.
      visible: true,
      locked: true,
      opacity: 1
    }];
  });
  return [...designer.faceGraphics, ...derived];
}

const STANDARD_WS2812B_VIEW_ANGLE_DEG = 120;

export function renderDirectLedFrame(args: {
  app: PixiApp; pixi: PixiModule; designer: DesignerForm; layout: CompiledDesignerLayout;
  viewport: DesignerViewport; canvasSize: { width: number; height: number };
  selectedZoneId?: string; selectedChannelId?: string; animationPixels: DesignerAnimationPixel[];
  showOutlines?: boolean; colorMode: "day" | "night";
}) {
  renderPixiAnimationFrame({ ...args, presentation: "led_map", settings: { ...DEFAULT_DIFFUSER_RENDER_SETTINGS, showOutlines: args.showOutlines ?? true } });
}

/** The single Animate renderer. All light composition stays on Pixi/WebGL. */
export function renderPixiAnimationFrame({ app, pixi, designer, layout, viewport, canvasSize, selectedZoneId, selectedChannelId, selectedZoneIds, selectedChannelIds, animationPixels, presentation, settings, colorMode }: {
  app: PixiApp; pixi: PixiModule; designer: DesignerForm; layout: CompiledDesignerLayout;
  viewport: DesignerViewport; canvasSize: { width: number; height: number };
  selectedZoneId?: string; selectedChannelId?: string; selectedZoneIds?: string[]; selectedChannelIds?: string[]; animationPixels: DesignerAnimationPixel[];
  presentation: DesignerAnimationDiffuser; settings: DiffuserRenderSettings; colorMode: "day" | "night";
}) {
  app.renderer.resize(canvasSize.width, canvasSize.height);
  clearPixiStage(app);
  const colors = colorMode === "night"
    ? { workspace: 0x020617, document: 0x07111f, documentStroke: 0x334155, zone: 0x64748b, selected: 0x38bdf8, label: 0x94a3b8, ledStroke: 0x1e293b }
    : { workspace: 0xe2e8f0, document: 0xffffff, documentStroke: 0x94a3b8, zone: 0x64748b, selected: 0x0284c7, label: 0x475569, ledStroke: 0x94a3b8 };
  const background = new pixi.Graphics();
  background.rect(0, 0, canvasSize.width, canvasSize.height).fill(colors.workspace);
  drawDocument(background, designer, viewport, canvasSize, colors);
  app.stage.addChild(background);

  const renderedColors = new Map(animationPixels.map((pixel) => [`${pixel.output}:${pixel.serialIndex}`, pixel.color]));
  const pixelsById = new Map(layout.pixelMap.map((pixel) => [pixel.id, pixel]));
  const compiledZones = new Map(layout.zones.map((zone) => [zone.id, zone]));
  const treatments = presentation === "as_built" && designer.layers.lightSources.visible
    ? designer.lightSources.filter((source) => source.visible && source.enabled)
    : [];
  const opticallyRenderedPixels = new Set<string>();
  const directMountedPixels = new Set<string>();
  const rearBuffer = new pixi.Container({ label: "Rear/external optical buffer" });
  const frontBuffer = new pixi.Container({ label: "Front-light optical buffer" });
  app.stage.addChild(rearBuffer);
  const activeZoneIds = selectedZoneIds?.length ? selectedZoneIds : selectedZoneId ? [selectedZoneId] : [];
  const activeChannelIds = selectedChannelIds?.length ? selectedChannelIds : selectedChannelId ? [selectedChannelId] : [];
  orderOpticalTreatmentsForRendering(treatments).forEach((treatment) => {
    const compiledZone = compiledZones.get(treatment.id);
    if (!compiledZone || !treatment.enabled) return;
    const pixels = compiledZone.pixelIds.map((id) => pixelsById.get(id))
      .filter((pixel): pixel is CompiledDesignerLayout["pixelMap"][number] => Boolean(pixel));
    if (treatment.mode === "front" && treatment.material === "none") {
      pixels.forEach((pixel) => directMountedPixels.add(pixel.id));
      return;
    }
    pixels.forEach((pixel) => opticallyRenderedPixels.add(pixel.id));
    renderTreatment({ app, targetContainer: treatment.mode === "front" ? frontBuffer : rearBuffer, pixi, designer, treatment, pixels, renderedColors, viewport, canvasSize, settings });
  });
  if (directMountedPixels.size) {
    drawDirectPixels({ targetContainer: frontBuffer, pixi, designer, pixels: layout.pixelMap.filter((pixel) => directMountedPixels.has(pixel.id)), renderedColors, viewport, canvasSize, selectedZoneIds: activeZoneIds, colors });
  }
  addFilteredFrontBuffer({ app, pixi, designer, frontBuffer, viewport, canvasSize, presentation });
  const directPixels = presentation === "led_map"
    ? layout.pixelMap
    : layout.pixelMap.filter((pixel) => !opticallyRenderedPixels.has(pixel.id) && !directMountedPixels.has(pixel.id));
  drawDirectPixels({ targetContainer: app.stage, pixi, designer, pixels: directPixels, renderedColors, viewport, canvasSize, selectedZoneIds: activeZoneIds, colors });
  if (settings.showOutlines) drawOutlines({ app, pixi, designer, viewport, canvasSize, selectedZoneIds: activeZoneIds, selectedChannelIds: activeChannelIds, colors });
  const count = new pixi.Text({ text: `${layout.pixelMap.length} mapped pixels`, style: { fill: colors.label, fontFamily: "monospace", fontSize: 11 } });
  count.x = 16;
  count.y = canvasSize.height - 20;
  app.stage.addChild(count);
  app.render();
}

export function orderOpticalTreatmentsForRendering(treatments: DesignerOpticalTreatment[]) {
  // Rear-mounted light and its opaque face belong behind any illumination on
  // the front face. Persisted array order must not change the optical stack.
  const renderLayer = (treatment: DesignerOpticalTreatment) => treatment.mode === "front" ? 1 : 0;
  return treatments
    .map((treatment, index) => ({ treatment, index }))
    .sort((left, right) => renderLayer(left.treatment) - renderLayer(right.treatment) || left.index - right.index)
    .map(({ treatment }) => treatment);
}

function clearPixiStage(app: PixiApp) {
  const previous = app.stage.removeChildren();
  // Buffers nest their masks and filtered lights. Detach every cross-reference
  // recursively before destruction, otherwise mode switches can leave Pixi
  // pointing at an already-destroyed mask or render texture.
  const detachRenderReferences = (child: any) => {
    child.mask = null;
    child.filters = null;
    child.children?.forEach(detachRenderReferences);
  };
  previous.forEach(detachRenderReferences);
  previous.forEach((child) => child.destroy({ children: true }));
  releasePixiFrameResources(app);
}

function renderTreatment({ app, targetContainer, pixi, designer, treatment, pixels, renderedColors, viewport, canvasSize, settings }: {
  app: PixiApp; targetContainer: PixiContainer; pixi: PixiModule; designer: DesignerForm; treatment: DesignerOpticalTreatment;
  pixels: CompiledDesignerLayout["pixelMap"]; renderedColors: Map<string, { r: number; g: number; b: number }>;
  viewport: DesignerViewport; canvasSize: { width: number; height: number }; settings: DiffuserRenderSettings;
}) {
  const target = treatment.targetType === "zone" ? designer.zones.find((zone) => zone.id === treatment.targetId) : designer.channels.find((channel) => channel.id === treatment.targetId);
  if (!target) return;
  const light = new pixi.Graphics();
  if (treatment.mode === "wall_wash") drawWallWash(light, pixels, renderedColors, treatment, viewport, canvasSize, settings.intensity);
  else drawEmitterField(light, pixels, renderedColors, treatment, designer, viewport, canvasSize, settings.intensity);
  light.blendMode = treatment.mode === "front" && treatment.material !== "day_night" ? "screen" : "add";
  const frontBlend = clamp((treatment.sourceDistanceCm - 2) / 8, 0, 1);
  const frontOpticalBlur = treatment.mode === "front"
    ? treatment.material === "silicone"
      ? 0.04 + treatment.sourceDistanceCm * 0.06
      : (treatment.material === "milky_white" ? 0.22 : 0.1) * frontBlend + treatment.sourceDistanceCm * 0.035 * frontBlend
    : 0;
  const haloGapFactor = treatment.sourceDistanceCm / (treatment.sourceDistanceCm + 1);
  const blurCm = treatment.mode === "halo"
    ? 0.03 + treatment.softnessCm * haloGapFactor + treatment.sourceDistanceCm * 0.12
    : treatment.mode === "front"
      ? treatment.softnessCm + frontOpticalBlur
      : treatment.softnessCm;
  const blurPx = Math.min(80, Math.max(0, screenUniformLength(blurCm, viewport, canvasSize)));
  if (blurPx > 0.25) {
    const blurFilter = new pixi.BlurFilter({ strength: blurPx, quality: 3, kernelSize: 7 });
    light.filters = [blurFilter];
    registerPixiFrameResource(app, blurFilter);
  }
  const receiverMask = treatment.mode === "front" ? null : createReceiverMask(pixi, designer, treatment, viewport, canvasSize);
  if (receiverMask) {
    targetContainer.addChild(receiverMask);
    light.mask = receiverMask;
  }
  if (treatment.mode === "front") {
    const material = createTargetShape(pixi, target, treatment.targetType, viewport, canvasSize);
    fillTargetShape(material, target, treatment.targetType, viewport, canvasSize, frontMaterialOffStyle(treatment.material));
    targetContainer.addChild(material);
    const sourceMask = createTargetShape(pixi, target, treatment.targetType, viewport, canvasSize);
    fillTargetShape(sourceMask, target, treatment.targetType, viewport, canvasSize, 0xffffff);
    targetContainer.addChild(sourceMask);
    light.mask = sourceMask;
  }
  targetContainer.addChild(light);
  if (treatment.mode === "halo" && treatment.occludeSource) {
    const face = createTargetShape(pixi, target, treatment.targetType, viewport, canvasSize);
    fillTargetShape(face, target, treatment.targetType, viewport, canvasSize, { color: colorNumber(treatment.faceColor), alpha: 0.98 });
    targetContainer.addChild(face);
  }
}

function addFilteredFrontBuffer({ app, pixi, designer, frontBuffer, viewport, canvasSize, presentation }: {
  app: PixiApp; pixi: PixiModule; designer: DesignerForm; frontBuffer: PixiContainer;
  viewport: DesignerViewport; canvasSize: { width: number; height: number }; presentation: DesignerAnimationDiffuser;
}) {
  const physicalFaceGraphics = resolvePhysicalFaceGraphics(designer);
  // LED Map is intentionally raw. With no physical graphic the legacy front
  // rendering remains unchanged.
  if (presentation !== "as_built" || !physicalFaceGraphics.length) {
    app.stage.addChild(frontBuffer);
    return;
  }
  const maskScene = new pixi.Container({ label: "Face Graphic transmission map" });
  const blocked = new pixi.Graphics().rect(0, 0, canvasSize.width, canvasSize.height).fill(0x000000);
  maskScene.addChild(blocked);
  // Persisted order is front-to-back, therefore paint back-to-front so the
  // first item deterministically wins in overlaps.
  [...physicalFaceGraphics].reverse().forEach((element) => {
    const region = new pixi.Graphics();
    const color = element.passMode === "opaque" ? 0x000000 : element.passMode === "clear" ? 0xffffff : colorNumber(element.filterColor);
    fillClosedShape(region, element, viewport, canvasSize, color);
    maskScene.addChild(region);
  });
  const maskTexture = pixi.RenderTexture.create({
    width: canvasSize.width,
    height: canvasSize.height,
    resolution: app.renderer.resolution
  });
  app.renderer.render({ container: maskScene, target: maskTexture, clear: true });
  maskScene.destroy({ children: true });
  const filter = pixi.Filter.from({
    gl: {
      vertex: `
        in vec2 aPosition;
        out vec2 vTextureCoord;
        out vec2 vFaceGraphicCoord;
        uniform vec4 uInputSize;
        uniform vec4 uOutputFrame;
        uniform vec4 uOutputTexture;

        void main(void) {
          vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
          vFaceGraphicCoord = position / uOutputTexture.xy;
          position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
          position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
          gl_Position = vec4(position, 0.0, 1.0);
          vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
        }
      `,
      fragment: `
        in vec2 vTextureCoord;
        in vec2 vFaceGraphicCoord;
        out vec4 finalColor;
        uniform sampler2D uTexture;
        uniform sampler2D uFaceGraphicTexture;

        void main(void) {
          vec4 source = texture(uTexture, vTextureCoord);
          vec3 mask = texture(uFaceGraphicTexture, clamp(vFaceGraphicCoord, vec2(0.0), vec2(1.0))).rgb;
          vec3 straight = source.a > 0.00001 ? source.rgb / source.a : vec3(0.0);
          vec3 transmitted = straight * mask;
          float sourcePeak = max(straight.r, max(straight.g, straight.b));
          float transmittedPeak = max(transmitted.r, max(transmitted.g, transmitted.b));
          float transmission = sourcePeak > 0.00001 ? transmittedPeak / sourcePeak : 0.0;
          float alpha = source.a * transmission;
          finalColor = vec4(transmitted * alpha, alpha);
        }
      `
    },
    resources: {
      uFaceGraphicTexture: maskTexture.source,
      uFaceGraphicSampler: maskTexture.source.style
    },
    antialias: "inherit"
  });
  frontBuffer.filterArea = new pixi.Rectangle(0, 0, canvasSize.width, canvasSize.height);
  frontBuffer.filters = [filter];
  app.stage.addChild(frontBuffer);
  registerPixiFrameResource(app, filter);
  registerPixiFrameResource(app, maskTexture);
}

function drawEmitterField(graphics: any, pixels: CompiledDesignerLayout["pixelMap"], colors: Map<string, { r: number; g: number; b: number }>, treatment: DesignerOpticalTreatment, designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, globalIntensity: number) {
  const pitchCm = 100 / Math.max(1, designer.addressablePixelsPerMeter);
  const distanceBlend = clamp((treatment.sourceDistanceCm - 2) / 8, 0, 1);
  const siliconeDiffuser = treatment.mode === "front" && treatment.material === "silicone";
  const beamAngleDeg = siliconeDiffuser ? treatment.beamAngleDeg : STANDARD_WS2812B_VIEW_ANGLE_DEG;
  const geometricRadius = treatment.sourceDistanceCm * Math.tan(beamAngleDeg * Math.PI / 360) * (siliconeDiffuser || treatment.mode === "halo" ? 1 : 0.18);
  const radiusCm = treatment.mode === "halo"
    ? Math.max(0.08, treatment.spreadCm + geometricRadius)
    : Math.max(pitchCm * 0.32, geometricRadius);
  const radiusPx = Math.max(2, screenUniformLength(radiusCm, viewport, canvasSize));
  pixels.forEach((pixel) => {
    const color = colors.get(`${pixel.output}:${pixel.serialIndex}`);
    if (!color || lightEnergy(color) <= 2) return;
    const point = toScreen(pixel, viewport, canvasSize);
    // A larger wall gap widens and softens a halo, but the same LED energy is
    // distributed over more receiver area. This softened inverse-square term
    // keeps distance useful without making realistic sign gaps go black.
    const haloDistanceFalloff = treatment.mode === "halo" ? 1 / (1 + Math.pow(treatment.sourceDistanceCm / 12, 2)) : 1;
    const materialTransmission = siliconeDiffuser ? treatment.transmissionPct / 100 : 1;
    const opticalGain = (treatment.mode === "front" ? 0.92 - distanceBlend * 0.44 : 0.62) * haloDistanceFalloff * materialTransmission;
    // Saturated red, green and blue must be as optically visible as white at
    // the same channel level. Summing RGB and dividing by white made every
    // single-channel background three times dimmer and left the neutral
    // diffuser surface looking gray.
    const exposure = lightLevel(color) * treatment.intensity * globalIntensity * opticalGain;
    const alpha = clamp(1 - Math.exp(-exposure), 0, 1);
    graphics.circle(point.x, point.y, radiusPx).fill({ color: rgbToNumber(color), alpha });
  });
}

function drawWallWash(graphics: any, pixels: CompiledDesignerLayout["pixelMap"], colors: Map<string, { r: number; g: number; b: number }>, treatment: DesignerOpticalTreatment, viewport: DesignerViewport, canvasSize: { width: number; height: number }, globalIntensity: number) {
  const angle = treatment.directionDeg * Math.PI / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -axis.y, y: axis.x };
  const beamSlope = Math.tan(clamp(treatment.beamAngleDeg, 5, 170) * Math.PI / 360);
  const slices = 7;
  pixels.forEach((pixel) => {
    const color = colors.get(`${pixel.output}:${pixel.serialIndex}`);
    if (!color || lightEnergy(color) <= 2) return;
    const energy = lightLevel(color);
    for (let slice = slices; slice >= 1; slice -= 1) {
      const endCm = treatment.throwCm * slice / slices;
      const startCm = treatment.throwCm * (slice - 1) / slices;
      const startHalf = treatment.spreadCm * 0.2 + startCm * beamSlope;
      const endHalf = treatment.spreadCm * 0.2 + endCm * beamSlope;
      const world = [
        { x: pixel.x + axis.x * startCm + normal.x * startHalf, y: pixel.y + axis.y * startCm + normal.y * startHalf },
        { x: pixel.x + axis.x * endCm + normal.x * endHalf, y: pixel.y + axis.y * endCm + normal.y * endHalf },
        { x: pixel.x + axis.x * endCm - normal.x * endHalf, y: pixel.y + axis.y * endCm - normal.y * endHalf },
        { x: pixel.x + axis.x * startCm - normal.x * startHalf, y: pixel.y + axis.y * startCm - normal.y * startHalf }
      ];
      const falloff = Math.pow(1 - slice / slices * 0.82, treatment.falloff);
      const alpha = clamp(energy * treatment.intensity * globalIntensity * falloff * 0.32, 0, 0.8);
      graphics.poly(world.flatMap((point) => { const screen = toScreen(point, viewport, canvasSize); return [screen.x, screen.y]; })).fill({ color: rgbToNumber(color), alpha });
    }
  });
}

function createReceiverMask(pixi: PixiModule, designer: DesignerForm, treatment: DesignerOpticalTreatment, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  if (treatment.receiverType === "canvas") return null;
  const receiver = treatment.receiverType === "build_area" ? designer.buildAreas.find((area) => area.id === treatment.receiverId) : designer.zones.find((zone) => zone.id === treatment.receiverId);
  if (!receiver) return null;
  const mask = new pixi.Graphics();
  fillClosedShape(mask, receiver, viewport, canvasSize, 0xffffff);
  return mask;
}

function createTargetShape(pixi: PixiModule, target: DesignerZoneForm | DesignerChannelForm, targetType: "zone" | "channel", viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  const graphics = new pixi.Graphics();
  if (targetType === "zone") traceClosedShape(graphics, target as DesignerZoneForm, viewport, canvasSize);
  else traceChannelShape(graphics, target as DesignerChannelForm, viewport, canvasSize);
  return graphics;
}

function fillTargetShape(graphics: any, target: DesignerZoneForm | DesignerChannelForm, targetType: "zone" | "channel", viewport: DesignerViewport, canvasSize: { width: number; height: number }, style: any) {
  if (targetType === "zone") {
    fillClosedShape(graphics, target as DesignerZoneForm, viewport, canvasSize, style);
    return;
  }
  if (!channelIsClosed(target as DesignerChannelForm)) {
    graphics.fill(style);
    return;
  }
  graphics.clear();
  const channel = target as DesignerChannelForm;
  const center = channelCenterPolyline(channel);
  traceScreenPolygon(graphics, center, viewport, canvasSize);
  const fillStyle = typeof style === "number" ? { color: style } : style;
  graphics.stroke({ ...fillStyle, width: Math.max(1, screenUniformLength(channelWidthCm(channel), viewport, canvasSize)) });
}

function traceScreenPolygon(graphics: any, points: DesignerPoint[], viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  const first = points[0] ? toScreen(points[0], viewport, canvasSize) : null;
  if (!first) return;
  graphics.moveTo(first.x, first.y);
  points.slice(1).forEach((point) => {
    const screen = toScreen(point, viewport, canvasSize);
    graphics.lineTo(screen.x, screen.y);
  });
  graphics.closePath();
}

function traceClosedShape(graphics: any, shape: DesignerZoneForm | DesignerBuildAreaForm | DesignerFaceGraphicForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  if (shape.shape === "ellipse") {
    const center = toScreen({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, viewport, canvasSize);
    graphics.ellipse(center.x, center.y, Math.abs(shape.width / 2 * canvasSize.width / viewport.width), Math.abs(shape.height / 2 * canvasSize.height / viewport.height));
    return;
  }
  if (shape.shape === "polygon" && shape.points?.length) {
    if (shape.contours?.length) shape.contours.forEach((contour) => tracePointPath(graphics, contour.points, contour.pathMode, viewport, canvasSize));
    else tracePointPath(graphics, shape.points, shape.pathMode, viewport, canvasSize);
    return;
  }
  const topLeft = toScreen({ x: shape.x, y: shape.y }, viewport, canvasSize);
  const bottomRight = toScreen({ x: shape.x + shape.width, y: shape.y + shape.height }, viewport, canvasSize);
  graphics.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function tracePointPath(graphics: any, points: DesignerPoint[], pathMode: "straight" | "bezier" | undefined, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  if (!points.length) return;
  const first = toScreen(points[0], viewport, canvasSize);
  graphics.moveTo(first.x, first.y);
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const next = toScreen(end, viewport, canvasSize);
    if (pathMode === "bezier" && (start.handleOut || end.handleIn)) {
      const cp1 = toScreen({ x: start.x + (start.handleOut?.x ?? 0), y: start.y + (start.handleOut?.y ?? 0) }, viewport, canvasSize);
      const cp2 = toScreen({ x: end.x + (end.handleIn?.x ?? 0), y: end.y + (end.handleIn?.y ?? 0) }, viewport, canvasSize);
      graphics.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);
    } else graphics.lineTo(next.x, next.y);
  });
  graphics.closePath();
}

/** Fill compound paths without losing letter counters or disjoint islands. */
function fillClosedShape(graphics: any, shape: DesignerZoneForm | DesignerBuildAreaForm | DesignerFaceGraphicForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, style: any) {
  graphics.clear();
  if (shape.shape !== "polygon" || !shape.contours?.length) {
    traceClosedShape(graphics, shape, viewport, canvasSize);
    graphics.fill(style);
    return;
  }
  const contours = shape.contours.map((contour) => ({
    contour,
    outline: shapeOutlinePoints({ shape: "polygon", points: contour.points, pathMode: contour.pathMode })
  })).filter((entry) => entry.outline.length >= 3);
  if (shape.fillRule === "nonzero") {
    contours.forEach(({ contour }) => {
      tracePointPath(graphics, contour.points, contour.pathMode, viewport, canvasSize);
      graphics.fill(style);
    });
    return;
  }
  const nested = contours.map((entry, index) => {
    const sample = entry.outline[0];
    const containers = contours
      .map((candidate, candidateIndex) => candidateIndex !== index && pointInPolygon(sample, candidate.outline) ? candidateIndex : -1)
      .filter((candidateIndex) => candidateIndex >= 0);
    return { ...entry, index, depth: containers.length, containers };
  });
  nested.filter((entry) => entry.depth % 2 === 0).forEach((outer) => {
    tracePointPath(graphics, outer.contour.points, outer.contour.pathMode, viewport, canvasSize);
    graphics.fill(style);
    nested.filter((candidate) => candidate.depth === outer.depth + 1 && candidate.containers.includes(outer.index)).forEach((hole) => {
      tracePointPath(graphics, hole.contour.points, hole.contour.pathMode, viewport, canvasSize);
    });
    if (nested.some((candidate) => candidate.depth === outer.depth + 1 && candidate.containers.includes(outer.index))) graphics.cut();
  });
}

function traceChannelShape(graphics: any, channel: DesignerChannelForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  if (!channelIsClosed(channel)) {
    const outline = openChannelOutline(channel);
    const first = outline[0] ? toScreen(outline[0], viewport, canvasSize) : null;
    if (!first) return;
    graphics.moveTo(first.x, first.y);
    outline.slice(1).forEach((point) => { const screen = toScreen(point, viewport, canvasSize); graphics.lineTo(screen.x, screen.y); });
    graphics.closePath();
    return;
  }
  const borders = channelBorderPolylines(channel);
  // Outlines need both closed borders. Filled channel shapes use a closed,
  // channel-width center stroke so neither the interior nor the closing edge
  // can be lost during triangulation.
  traceScreenPolygon(graphics, borders.left, viewport, canvasSize);
  traceScreenPolygon(graphics, borders.right, viewport, canvasSize);
}

function drawDirectPixels({ targetContainer, pixi, designer, pixels, renderedColors, viewport, canvasSize, selectedZoneIds, colors }: {
  targetContainer: PixiContainer; pixi: PixiModule; designer: DesignerForm; pixels: CompiledDesignerLayout["pixelMap"];
  renderedColors: Map<string, { r: number; g: number; b: number }>; viewport: DesignerViewport;
  canvasSize: { width: number; height: number }; selectedZoneIds: string[]; colors: Record<string, number>;
}) {
  const graphics = new pixi.Graphics();
  const pitchCm = 100 / Math.max(1, designer.addressablePixelsPerMeter);
  const size = Math.max(1.5, Math.min(54, screenUniformLength(Math.min(0.7, pitchCm * 0.42), viewport, canvasSize)));
  pixels.forEach((pixel) => {
    const screen = toScreen(pixel, viewport, canvasSize);
    const rendered = renderedColors.get(`${pixel.output}:${pixel.serialIndex}`);
    const selected = selectedZoneIds.length ? designer.zones.some((zone) => selectedZoneIds.includes(zone.id) && pointInsideDesignerShape(zone, pixel)) : false;
    graphics.rect(screen.x - size / 2, screen.y - size / 2, size, size).fill({ color: rendered ? rgbToNumber(rendered) : selected ? colors.selected : 0x64748b, alpha: rendered ? 1 : 0.72 }).stroke({ color: selected ? 0xdbeafe : colors.ledStroke, alpha: 0.65, width: 0.75 });
  });
  targetContainer.addChild(graphics);
}

function drawOutlines({ app, pixi, designer, viewport, canvasSize, selectedZoneIds, selectedChannelIds, colors }: {
  app: PixiApp; pixi: PixiModule; designer: DesignerForm; viewport: DesignerViewport;
  canvasSize: { width: number; height: number }; selectedZoneIds: string[]; selectedChannelIds: string[]; colors: Record<string, number>;
}) {
  designer.zones.filter((zone) => zone.visible !== false).forEach((zone) => {
    const selected = selectedZoneIds.includes(zone.id);
    const shape = new pixi.Graphics();
    traceClosedShape(shape, zone, viewport, canvasSize);
    shape.stroke({ color: selected ? colors.selected : colors.zone, alpha: selected ? 0.95 : 0.42, width: selected ? 2 : 1 });
    app.stage.addChild(shape);
    const point = toScreen({ x: zone.x + 1, y: zone.y + 2.4 }, viewport, canvasSize);
    const label = new pixi.Text({ text: zone.name, style: { fill: selected ? colors.selected : colors.label, fontFamily: "sans-serif", fontSize: selected ? 13 : 11 } });
    label.x = point.x; label.y = point.y; label.alpha = selected ? 1 : 0.72;
    app.stage.addChild(label);
  });
  designer.channels.filter((channel) => channel.visible !== false).forEach((channel) => {
    const shape = createTargetShape(pixi, channel, "channel", viewport, canvasSize);
    const selected = selectedChannelIds.includes(channel.id);
    shape.stroke({ color: selected ? 0x60a5fa : 0xf59e0b, alpha: selected ? 0.95 : 0.6, width: selected ? 1.8 : 1.2 });
    app.stage.addChild(shape);
  });
}

function drawDocument(graphics: any, designer: DesignerForm, viewport: DesignerViewport, canvasSize: { width: number; height: number }, colors: Record<string, number>) {
  const topLeft = toScreen({ x: 0, y: 0 }, viewport, canvasSize);
  const bottomRight = toScreen({ x: designer.canvasWidthCm, y: designer.canvasHeightCm }, viewport, canvasSize);
  graphics.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y).fill(colors.document).stroke({ color: colors.documentStroke, width: 1.2 });
}

function toScreen(point: DesignerPoint, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  return { x: ((point.x - viewport.x) / viewport.width) * canvasSize.width, y: ((point.y - viewport.y) / viewport.height) * canvasSize.height };
}

function screenUniformLength(cm: number, viewport: DesignerViewport, canvasSize: { width: number; height: number }) {
  return cm * ((canvasSize.width / viewport.width + canvasSize.height / viewport.height) / 2);
}

function colorNumber(color: string) { const parsed = Number.parseInt(color.replace("#", ""), 16); return Number.isFinite(parsed) ? parsed : 0x16181d; }
function hexToRgb(color: string): OpticalRgb {
  const normalized = color.replace("#", "");
  const expanded = normalized.length === 3 ? normalized.split("").map((value) => `${value}${value}`).join("") : normalized;
  const parsed = Number.parseInt(expanded, 16);
  return Number.isFinite(parsed) ? { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 } : { r: 255, g: 255, b: 255 };
}
function rgbToNumber(color: { r: number; g: number; b: number }) { return (clamp(Math.round(color.r), 0, 255) << 16) + (clamp(Math.round(color.g), 0, 255) << 8) + clamp(Math.round(color.b), 0, 255); }
function lightEnergy(color: { r: number; g: number; b: number }) { return Math.max(0, color.r) + Math.max(0, color.g) + Math.max(0, color.b); }
function lightLevel(color: { r: number; g: number; b: number }) { return clamp(Math.max(color.r, color.g, color.b) / 255, 0, 1); }
