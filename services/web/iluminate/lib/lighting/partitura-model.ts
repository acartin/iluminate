export type SegmentForm = {
  id: string;
  name: string;
  output: number;
  start: number;
  length: number;
  reverse: boolean;
  x: number;
  y: number;
  stepX: number;
  stepY: number;
};

export type ZoneForm = {
  id: string;
  name: string;
  segments: string[];
};

export type DesignerPoint = {
  x: number;
  y: number;
  joint?: boolean;
};

export type DesignerZoneForm = {
  id: string;
  name: string;
  shape: "rect" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerRouteKind = "led_string" | "data_cable";

export type DesignerRouteForm = {
  id: string;
  name: string;
  kind: DesignerRouteKind;
  output: number;
  zoneId: string;
  points: DesignerPoint[];
};

export type DesignerControllerForm = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataOutputs: number;
};

export type DesignerLayerSettings = {
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerLayersForm = {
  reference: DesignerLayerSettings;
  zones: DesignerLayerSettings;
  strings: DesignerLayerSettings;
};

export type DesignerBuildAreaForm = {
  id: string;
  name: string;
  shape: "rect" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerForm = {
  canvasWidthCm: number;
  canvasHeightCm: number;
  addressablePixelsPerMeter: number;
  ledsPerMeter: number;
  ledDensityPerMeter: number;
  snapCm: number;
  rulerUnit: "cm" | "in";
  rulerVisible: boolean;
  sourceSvg: string | null;
  layers: DesignerLayersForm;
  buildAreas: DesignerBuildAreaForm[];
  controller: DesignerControllerForm;
  zones: DesignerZoneForm[];
  routes: DesignerRouteForm[];
};

export type ClipParams = Record<string, string | number | boolean | null | string[] | number[]>;

export type ClipForm = {
  id: string;
  name: string;
  target: string;
  effect: string;
  blend: string;
  startMs: number;
  durationMs: number;
  layer: number;
  params: ClipParams;
};

export type SceneForm = {
  id: string;
  name: string;
  loop: boolean;
  durationMs: number;
  clips: ClipForm[];
};

export type PartituraDocument = {
  projectId: string;
  chain1Pixels: number;
  chain2Pixels: number;
  chain3Pixels: number;
  segments: SegmentForm[];
  zones: ZoneForm[];
  scenes: SceneForm[];
  activeSceneId: string;
  previewTimeMs: number;
  accentColor: string;
  designer?: DesignerForm;
};

export type PersistedPartitura = {
  id: string;
  projectId: string;
  partituraKey: string;
  name: string;
  clientName: string;
  status: "draft" | "validated" | "active" | "archived";
  document: PartituraDocument;
  generatedPartitura?: unknown;
  validationReport?: unknown;
  createdAt: string;
  updatedAt: string;
};

export function createDefaultPartituraDocument(projectId = "web_test_partitura"): PartituraDocument {
  const designer = createDefaultDesigner();
  return {
    projectId,
    chain1Pixels: 100,
    chain2Pixels: 40,
    chain3Pixels: 100,
    segments: [
      { id: "fondo_row_1", name: "Fondo row 1", output: 1, start: 0, length: 25, reverse: false, x: 0, y: 0, stepX: 1, stepY: 0 },
      { id: "fondo_row_2", name: "Fondo row 2", output: 1, start: 25, length: 25, reverse: true, x: 0, y: 1, stepX: 1, stepY: 0 },
      { id: "fondo_row_3", name: "Fondo row 3", output: 1, start: 50, length: 25, reverse: false, x: 0, y: 2, stepX: 1, stepY: 0 },
      { id: "fondo_row_4", name: "Fondo row 4", output: 1, start: 75, length: 25, reverse: true, x: 0, y: 3, stepX: 1, stepY: 0 },
      { id: "estrella_ring", name: "Estrella", output: 2, start: 0, length: 40, reverse: false, x: 0, y: 4, stepX: 1, stepY: 0 },
      { id: "letra_1_segment", name: "Letra 1", output: 3, start: 0, length: 25, reverse: false, x: 0, y: 6, stepX: 1, stepY: 0 },
      { id: "letra_2_segment", name: "Letra 2", output: 3, start: 25, length: 25, reverse: false, x: 28, y: 6, stepX: 1, stepY: 0 },
      { id: "letra_3_segment", name: "Letra 3", output: 3, start: 50, length: 25, reverse: false, x: 56, y: 6, stepX: 1, stepY: 0 },
      { id: "letra_4_segment", name: "Letra 4", output: 3, start: 75, length: 25, reverse: false, x: 84, y: 6, stepX: 1, stepY: 0 }
    ],
    zones: [
      { id: "fondo", name: "Fondo", segments: ["fondo_row_1", "fondo_row_2", "fondo_row_3", "fondo_row_4"] },
      { id: "estrella", name: "Estrella", segments: ["estrella_ring"] },
      { id: "letras", name: "Letras", segments: ["letra_1_segment", "letra_2_segment", "letra_3_segment", "letra_4_segment"] },
      { id: "letra_1", name: "Letra 1", segments: ["letra_1_segment"] },
      { id: "letra_2", name: "Letra 2", segments: ["letra_2_segment"] },
      { id: "letra_3", name: "Letra 3", segments: ["letra_3_segment"] },
      { id: "letra_4", name: "Letra 4", segments: ["letra_4_segment"] },
      { id: "rotulo_completo", name: "Rotulo completo", segments: ["fondo_row_1", "fondo_row_2", "fondo_row_3", "fondo_row_4", "estrella_ring", "letra_1_segment", "letra_2_segment", "letra_3_segment", "letra_4_segment"] }
    ],
    scenes: [
      {
        id: "normal",
        name: "Normal",
        loop: true,
        durationMs: 4000,
        clips: [
          {
            id: "clip_zone_1_solid",
            name: "Fondo flame",
            target: "fondo",
            effect: "flame",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 0,
            params: {
              baseColor: "#FF1A00",
              tipColor: "#FFC43A",
              cooling: 0.24,
              speed: 1.15,
              turbulence: 0.68,
              height: 0.96
            }
          },
          {
            id: "clip_zone_2_chase",
            name: "Estrella azul",
            target: "estrella",
            effect: "solid",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 1,
            params: {
              color: "#0066FF"
            }
          },
          {
            id: "clip_zone_3_pulse",
            name: "Letras secuencia",
            target: "letras",
            effect: "toggle",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 2,
            params: {
              onColor: "#FFF2CC",
              offColor: "#000000",
              periodMs: 900,
              dutyCycle: 0.25,
              groupCount: 4
            }
          }
        ]
      },
      {
        id: "calibration",
        name: "Calibration",
        loop: true,
        durationMs: 10000,
        clips: [
          { id: "cal_red", name: "Red", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: { color: "#FF0000" } },
          { id: "cal_green", name: "Green", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 1000, durationMs: 1000, layer: 0, params: { color: "#00FF00" } },
          { id: "cal_blue", name: "Blue", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 2000, durationMs: 1000, layer: 0, params: { color: "#0000FF" } },
          { id: "cal_white", name: "White", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 3000, durationMs: 1000, layer: 0, params: { color: "#FFFFFF" } },
          { id: "cal_gray_25", name: "Gray 25%", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 4000, durationMs: 1000, layer: 0, params: { color: "#404040" } },
          { id: "cal_gray_50", name: "Gray 50%", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 5000, durationMs: 1000, layer: 0, params: { color: "#808080" } },
          { id: "cal_yellow", name: "Yellow", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 6000, durationMs: 1000, layer: 0, params: { color: "#FFFF00" } },
          { id: "cal_cyan", name: "Cyan", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 7000, durationMs: 1000, layer: 0, params: { color: "#00FFFF" } },
          { id: "cal_magenta", name: "Magenta", target: "rotulo_completo", effect: "solid", blend: "replace", startMs: 8000, durationMs: 1000, layer: 0, params: { color: "#FF00FF" } },
          { id: "cal_off", name: "Off", target: "rotulo_completo", effect: "off", blend: "replace", startMs: 9000, durationMs: 1000, layer: 0, params: {} }
        ]
      }
    ],
    activeSceneId: "calibration",
    previewTimeMs: 1000,
    accentColor: "#FFFFFF",
    designer
  };
}

export function clonePartituraDocument(document: PartituraDocument) {
  return JSON.parse(JSON.stringify(document)) as PartituraDocument;
}

export function normalizeDefaultSignLayout(document: PartituraDocument) {
  const next = clonePartituraDocument(document);
  next.designer = normalizeDesigner(next.designer);
  const segmentsById = new Map(next.segments.map((segment) => [segment.id, segment]));
  const star = segmentsById.get("estrella_ring") ?? segmentsById.get("estrella_segment");
  const secondLetter = segmentsById.get("letra_2_segment");
  const hasLegacyCompressedStar = star && star.x === 8 && star.y === 1 && star.stepX === 0.25;
  const hasLegacyOverlappedLetters = secondLetter && secondLetter.x === 7 && secondLetter.y === 5;

  if (!hasLegacyCompressedStar && !hasLegacyOverlappedLetters) return next;

  applySegmentLayout(segmentsById, "estrella_ring", { x: 0, y: 4, stepX: 1, stepY: 0 });
  applySegmentLayout(segmentsById, "estrella_segment", { x: 0, y: 4, stepX: 1, stepY: 0 });
  applySegmentLayout(segmentsById, "letra_1_segment", { x: 0, y: 6, stepX: 1, stepY: 0 });
  applySegmentLayout(segmentsById, "letra_2_segment", { x: 28, y: 6, stepX: 1, stepY: 0 });
  applySegmentLayout(segmentsById, "letra_3_segment", { x: 56, y: 6, stepX: 1, stepY: 0 });
  applySegmentLayout(segmentsById, "letra_4_segment", { x: 84, y: 6, stepX: 1, stepY: 0 });

  return next;
}

export function createDefaultDesigner(): DesignerForm {
  return {
    canvasWidthCm: 170,
    canvasHeightCm: 40,
    addressablePixelsPerMeter: 60,
    ledsPerMeter: 60,
    ledDensityPerMeter: 60,
    snapCm: 2,
    rulerUnit: "cm",
    rulerVisible: true,
    sourceSvg: null,
    layers: defaultDesignerLayers(),
    buildAreas: [
      { id: "build_area_main", name: "Main Sign Face", shape: "rect", x: 40, y: 0, width: 120, height: 40, visible: true, locked: false, opacity: 1 },
      { id: "build_area_logo", name: "Round Logo Reference", shape: "ellipse", x: 108, y: 2, width: 18, height: 18, visible: true, locked: false, opacity: 0.9 },
      {
        id: "build_area_tag",
        name: "Polygon Reference",
        shape: "polygon",
        x: 42,
        y: 22,
        width: 100,
        height: 14,
        points: [{ x: 42, y: 22 }, { x: 142, y: 22 }, { x: 138, y: 36 }, { x: 46, y: 36 }],
        visible: true,
        locked: false,
        opacity: 0.85
      }
    ],
    controller: {
      id: "controller",
      name: "Controller",
      x: 4,
      y: 4,
      width: 12,
      height: 12,
      dataOutputs: 3
    },
    zones: [
      {
        id: "fondo",
        name: "Fondo",
        shape: "polygon",
        x: 42,
        y: 2,
        width: 60,
        height: 16,
        points: [{ x: 42, y: 2 }, { x: 102, y: 2 }, { x: 100, y: 18 }, { x: 44, y: 18 }],
        visible: true,
        locked: false,
        opacity: 1
      },
      { id: "estrella", name: "Estrella", shape: "ellipse", x: 108, y: 2, width: 18, height: 18, visible: true, locked: false, opacity: 1 },
      { id: "letras", name: "Letras", shape: "rect", x: 42, y: 22, width: 100, height: 14, visible: true, locked: false, opacity: 1 },
      {
        id: "letra_1",
        name: "Letra 1",
        shape: "polygon",
        x: 42,
        y: 24,
        width: 22,
        height: 10,
        points: [{ x: 42, y: 34 }, { x: 46, y: 24 }, { x: 64, y: 24 }, { x: 60, y: 34 }],
        visible: true,
        locked: false,
        opacity: 1
      },
      { id: "letra_2", name: "Letra 2", shape: "rect", x: 68, y: 24, width: 22, height: 10, visible: true, locked: false, opacity: 1 },
      { id: "letra_3", name: "Letra 3", shape: "rect", x: 94, y: 24, width: 22, height: 10, visible: true, locked: false, opacity: 1 },
      { id: "letra_4", name: "Letra 4", shape: "rect", x: 120, y: 24, width: 22, height: 10, visible: true, locked: false, opacity: 1 }
    ],
    routes: [
      { id: "route_fondo", name: "Fondo LED string", kind: "led_string", output: 1, zoneId: "fondo", points: [{ x: 44, y: 4, joint: true }, { x: 100, y: 4 }, { x: 100, y: 8 }, { x: 44, y: 8 }, { x: 44, y: 12 }, { x: 100, y: 12 }] },
      { id: "route_estrella", name: "Estrella LED string", kind: "led_string", output: 2, zoneId: "estrella", points: [{ x: 110, y: 12 }, { x: 124, y: 12 }] },
      { id: "route_letras", name: "Letras LED string", kind: "led_string", output: 3, zoneId: "letras", points: [{ x: 44, y: 30 }, { x: 64, y: 30 }, { x: 70, y: 30 }, { x: 90, y: 30 }, { x: 96, y: 30 }, { x: 116, y: 30 }, { x: 122, y: 30 }, { x: 142, y: 30 }] },
      { id: "data_feed_1", name: "Data cable", kind: "data_cable", output: 1, zoneId: "fondo", points: [{ x: 16, y: 8, joint: true }, { x: 32, y: 8 }, { x: 32, y: 4 }, { x: 44, y: 4, joint: true }] }
    ]
  };
}

function normalizeDesigner(designer?: DesignerForm): DesignerForm {
  const fallback = createDefaultDesigner();
  if (!designer) return fallback;
  return {
    canvasWidthCm: positiveNumber(designer.canvasWidthCm, fallback.canvasWidthCm),
    canvasHeightCm: positiveNumber(designer.canvasHeightCm, fallback.canvasHeightCm),
    addressablePixelsPerMeter: positiveNumber(designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.addressablePixelsPerMeter),
    ledsPerMeter: positiveNumber(designer.ledsPerMeter ?? designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.ledsPerMeter),
    ledDensityPerMeter: positiveNumber(designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.ledDensityPerMeter),
    snapCm: positiveNumber(designer.snapCm, fallback.snapCm),
    rulerUnit: designer.rulerUnit === "in" ? "in" : "cm",
    rulerVisible: typeof designer.rulerVisible === "boolean" ? designer.rulerVisible : fallback.rulerVisible,
    sourceSvg: typeof designer.sourceSvg === "string" ? designer.sourceSvg : null,
    layers: normalizeDesignerLayers(designer.layers, fallback.layers),
    buildAreas: normalizeBuildAreas(designer, fallback.buildAreas),
    controller: normalizeController(designer.controller, fallback.controller),
    zones: Array.isArray(designer.zones) && designer.zones.length ? designer.zones.map(normalizeDesignerZone) : fallback.zones,
    routes: Array.isArray(designer.routes) && designer.routes.length ? designer.routes.map((route) => ({ ...route, kind: route.kind === "data_cable" ? "data_cable" : "led_string" })) : fallback.routes
  };
}

function normalizeDesignerZone(zone: DesignerZoneForm): DesignerZoneForm {
  return {
    ...zone,
    shape: zone.shape === "ellipse" ? "ellipse" : zone.shape === "polygon" ? "polygon" : "rect",
    x: typeof zone.x === "number" && Number.isFinite(zone.x) ? zone.x : 0,
    y: typeof zone.y === "number" && Number.isFinite(zone.y) ? zone.y : 0,
    width: positiveNumber(zone.width, 10),
    height: positiveNumber(zone.height, 10),
    points: normalizeDesignerPoints(zone.points),
    visible: typeof zone.visible === "boolean" ? zone.visible : true,
    locked: typeof zone.locked === "boolean" ? zone.locked : false,
    opacity: clampNumber(typeof zone.opacity === "number" ? zone.opacity : 1, 0.05, 1)
  };
}

function defaultDesignerLayers(): DesignerLayersForm {
  return {
    reference: { visible: true, locked: false, opacity: 0.75 },
    zones: { visible: true, locked: false, opacity: 0.35 },
    strings: { visible: true, locked: false, opacity: 1 }
  };
}

function normalizeDesignerLayers(layers: (Partial<DesignerLayersForm> & { svg?: DesignerLayerSettings }) | undefined, fallback: DesignerLayersForm): DesignerLayersForm {
  const reference = layers?.reference ?? layers?.svg;
  return {
    reference: normalizeDesignerLayer(reference, fallback.reference),
    zones: normalizeDesignerLayer(layers?.zones, fallback.zones),
    strings: normalizeDesignerLayer(layers?.strings, fallback.strings)
  };
}

function normalizeDesignerLayer(layer: DesignerLayerSettings | undefined, fallback: DesignerLayerSettings): DesignerLayerSettings {
  return {
    visible: typeof layer?.visible === "boolean" ? layer.visible : fallback.visible,
    locked: typeof layer?.locked === "boolean" ? layer.locked : fallback.locked,
    opacity: clampNumber(typeof layer?.opacity === "number" ? layer.opacity : fallback.opacity, 0.05, 1)
  };
}

function normalizeBuildAreas(designer: (Partial<DesignerForm> & { buildArea?: Partial<DesignerBuildAreaForm> }) | undefined, fallback: DesignerBuildAreaForm[]): DesignerBuildAreaForm[] {
  const legacyBuildArea = designer?.buildArea;
  const source = Array.isArray(designer?.buildAreas) && designer.buildAreas.length ? designer.buildAreas : legacyBuildArea ? [legacyBuildArea] : fallback;
  return source.map((buildArea, index) => normalizeBuildArea(buildArea, fallback[index] ?? fallback[0], index));
}

function normalizeBuildArea(buildArea: Partial<DesignerBuildAreaForm> | undefined, fallback: DesignerBuildAreaForm, index: number): DesignerBuildAreaForm {
  if (!buildArea) return fallback;
  return {
    id: typeof buildArea.id === "string" && buildArea.id ? buildArea.id : `build_area_${index + 1}`,
    name: typeof buildArea.name === "string" && buildArea.name ? buildArea.name : index === 0 ? "Build Area" : `Build Area ${index + 1}`,
    shape: buildArea.shape === "ellipse" ? "ellipse" : buildArea.shape === "polygon" ? "polygon" : "rect",
    x: typeof buildArea.x === "number" && Number.isFinite(buildArea.x) ? buildArea.x : fallback.x,
    y: typeof buildArea.y === "number" && Number.isFinite(buildArea.y) ? buildArea.y : fallback.y,
    width: positiveNumber(buildArea.width, fallback.width),
    height: positiveNumber(buildArea.height, fallback.height),
    points: normalizeDesignerPoints(buildArea.points),
    visible: typeof buildArea.visible === "boolean" ? buildArea.visible : true,
    locked: typeof buildArea.locked === "boolean" ? buildArea.locked : false,
    opacity: clampNumber(typeof buildArea.opacity === "number" ? buildArea.opacity : 1, 0.05, 1)
  };
}

function normalizeDesignerPoints(points: DesignerPoint[] | undefined) {
  if (!Array.isArray(points) || points.length < 3) return undefined;
  const normalized = points
    .filter((point) => typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
  return normalized.length >= 3 ? normalized : undefined;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function normalizeController(controller: DesignerControllerForm | undefined, fallback: DesignerControllerForm) {
  if (!controller) return fallback;
  return {
    id: "controller",
    name: typeof controller.name === "string" && controller.name.trim() ? controller.name : fallback.name,
    x: typeof controller.x === "number" && Number.isFinite(controller.x) ? controller.x : fallback.x,
    y: typeof controller.y === "number" && Number.isFinite(controller.y) ? controller.y : fallback.y,
    width: positiveNumber(controller.width, fallback.width),
    height: positiveNumber(controller.height, fallback.height),
    dataOutputs: Math.max(1, Math.round(positiveNumber(controller.dataOutputs, fallback.dataOutputs)))
  };
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function applySegmentLayout(
  segmentsById: Map<string, SegmentForm>,
  id: string,
  layout: Pick<SegmentForm, "x" | "y" | "stepX" | "stepY">
) {
  const segment = segmentsById.get(id);
  if (!segment) return;
  segment.x = layout.x;
  segment.y = layout.y;
  segment.stepX = layout.stepX;
  segment.stepY = layout.stepY;
}
