export type DesignerPointNodeType = "corner" | "straight" | "smooth" | "symmetric";

export type DesignerPoint = {
  x: number;
  y: number;
  joint?: boolean;
  nodeType?: DesignerPointNodeType;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
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
  pathMode?: "straight" | "bezier";
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerGroupForm = {
  id: string;
  name: string;
  members: Array<{ type: "zone" | "group"; id: string }>;
};

export type DesignerRouteKind = "led_string" | "data_cable";

export type DesignerRouteForm = {
  id: string;
  name: string;
  kind: DesignerRouteKind;
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
  artwork: DesignerLayerSettings;
  reference: DesignerLayerSettings;
  zones: DesignerLayerSettings;
  strings: DesignerLayerSettings;
};

export type DesignerArtworkForm = {
  id: string;
  assetId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
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
  pathMode?: "straight" | "bezier";
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
  artwork: DesignerArtworkForm[];
  buildAreas: DesignerBuildAreaForm[];
  controller: DesignerControllerForm;
  zones: DesignerZoneForm[];
  groups: DesignerGroupForm[];
  routes: DesignerRouteForm[];
};

export type ClipParams = Record<string, string | number | boolean | null | string[] | number[]>;

export type ClipForm = {
  id: string;
  name: string;
  target: string;
  coordinateSpace?: "serial" | "local" | "global";
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
  scenes: SceneForm[];
  activeSceneId: string;
  previewTimeMs: number;
  accentColor: string;
  designer?: DesignerForm;
  compiledDesignerSignature?: string;
  compiledLayout?: {
    outputs: Array<{ id: string; name: string; output: 1 | 2 | 3; pixelCount: number }>;
    pixelMap: Array<{ id: string; output: 1 | 2 | 3; serialIndex: number; stringId: string; routeOffsetCm: number; x: number; y: number; tangentDeg: number }>;
    zones: Array<{ id: string; name: string; pixelIds: string[] }>;
    groups: Array<{ id: string; name: string; members: Array<{ type: "zone" | "group"; id: string }> }>;
    validation: { errors: string[]; warnings: string[] };
  };
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
          { id: "cal_red", name: "Red", target: "full_sign", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: { color: "#FF0000" } },
          { id: "cal_green", name: "Green", target: "full_sign", effect: "solid", blend: "replace", startMs: 1000, durationMs: 1000, layer: 0, params: { color: "#00FF00" } },
          { id: "cal_blue", name: "Blue", target: "full_sign", effect: "solid", blend: "replace", startMs: 2000, durationMs: 1000, layer: 0, params: { color: "#0000FF" } },
          { id: "cal_white", name: "White", target: "full_sign", effect: "solid", blend: "replace", startMs: 3000, durationMs: 1000, layer: 0, params: { color: "#FFFFFF" } },
          { id: "cal_gray_25", name: "Gray 25%", target: "full_sign", effect: "solid", blend: "replace", startMs: 4000, durationMs: 1000, layer: 0, params: { color: "#404040" } },
          { id: "cal_gray_50", name: "Gray 50%", target: "full_sign", effect: "solid", blend: "replace", startMs: 5000, durationMs: 1000, layer: 0, params: { color: "#808080" } },
          { id: "cal_yellow", name: "Yellow", target: "full_sign", effect: "solid", blend: "replace", startMs: 6000, durationMs: 1000, layer: 0, params: { color: "#FFFF00" } },
          { id: "cal_cyan", name: "Cyan", target: "full_sign", effect: "solid", blend: "replace", startMs: 7000, durationMs: 1000, layer: 0, params: { color: "#00FFFF" } },
          { id: "cal_magenta", name: "Magenta", target: "full_sign", effect: "solid", blend: "replace", startMs: 8000, durationMs: 1000, layer: 0, params: { color: "#FF00FF" } },
          { id: "cal_off", name: "Off", target: "full_sign", effect: "off", blend: "replace", startMs: 9000, durationMs: 1000, layer: 0, params: {} }
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
  const fallback = createDefaultPartituraDocument(document.projectId);
  const source = clonePartituraDocument(document);
  const designer = normalizeDesigner(source.designer);
  const targetIds = new Set(["full_sign", ...designer.zones.map((zone) => zone.id), ...designer.groups.map((group) => group.id)]);
  // An empty scene list is a valid authoring state while Animate is being composed.
  const scenes = Array.isArray(source.scenes) ? source.scenes : fallback.scenes;

  return {
    projectId: source.projectId || fallback.projectId,
    scenes: scenes.map((scene) => ({
      ...scene,
      clips: (scene.clips ?? []).map((clip) => ({
        ...clip,
        target: targetIds.has(clip.target) ? clip.target : "full_sign",
        coordinateSpace: clip.coordinateSpace ?? "local"
      }))
    })),
    activeSceneId: scenes.some((scene) => scene.id === source.activeSceneId) ? source.activeSceneId : scenes[0]?.id ?? "normal",
    previewTimeMs: typeof source.previewTimeMs === "number" ? source.previewTimeMs : 0,
    accentColor: typeof source.accentColor === "string" ? source.accentColor : "#FFFFFF",
    designer,
    compiledDesignerSignature: typeof source.compiledDesignerSignature === "string" ? source.compiledDesignerSignature : undefined,
    compiledLayout: source.compiledLayout
  };
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
    artwork: [],
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
    groups: [],
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
      { id: "route_fondo", name: "Fondo LED string", kind: "led_string", points: [{ x: 44, y: 4, joint: true }, { x: 100, y: 4 }, { x: 100, y: 8 }, { x: 44, y: 8 }, { x: 44, y: 12 }, { x: 100, y: 12 }] },
      { id: "route_estrella", name: "Estrella LED string", kind: "led_string", points: [{ x: 110, y: 12 }, { x: 124, y: 12 }] },
      { id: "route_letras", name: "Letras LED string", kind: "led_string", points: [{ x: 44, y: 30 }, { x: 64, y: 30 }, { x: 70, y: 30 }, { x: 90, y: 30 }, { x: 96, y: 30 }, { x: 116, y: 30 }, { x: 122, y: 30 }, { x: 142, y: 30 }] },
      { id: "data_feed_1", name: "Data cable", kind: "data_cable", points: [{ x: 16, y: 8, joint: true }, { x: 32, y: 8 }, { x: 32, y: 4 }, { x: 44, y: 4, joint: true }] }
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
    snapCm: nonNegativeNumber(designer.snapCm, fallback.snapCm),
    rulerUnit: designer.rulerUnit === "in" ? "in" : "cm",
    rulerVisible: typeof designer.rulerVisible === "boolean" ? designer.rulerVisible : fallback.rulerVisible,
    sourceSvg: typeof designer.sourceSvg === "string" ? designer.sourceSvg : null,
    layers: normalizeDesignerLayers(designer.layers, fallback.layers),
    artwork: Array.isArray(designer.artwork) ? designer.artwork.map(normalizeDesignerArtwork) : [],
    buildAreas: normalizeBuildAreas(designer, fallback.buildAreas),
    controller: normalizeController(designer.controller, fallback.controller),
    zones: Array.isArray(designer.zones) && designer.zones.length ? designer.zones.map(normalizeDesignerZone) : fallback.zones,
    groups: Array.isArray(designer.groups) ? designer.groups.filter((group) => typeof group.id === "string" && typeof group.name === "string").map((group) => ({ id: group.id, name: group.name, members: Array.isArray(group.members) ? group.members.filter((member) => member?.type === "zone" || member?.type === "group") : [] })) : [],
    routes: Array.isArray(designer.routes) && designer.routes.length ? designer.routes.map((route, index): DesignerRouteForm => ({
      id: typeof route.id === "string" && route.id ? route.id : `route_${index + 1}`,
      name: typeof route.name === "string" && route.name ? route.name : `Route ${index + 1}`,
      kind: route.kind === "data_cable" ? "data_cable" : "led_string",
      points: Array.isArray(route.points) ? route.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({ x: point.x, y: point.y, ...(point.joint ? { joint: true } : {}) })) : []
    })).filter((route) => route.points.length >= 2) : fallback.routes
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
    pathMode: zone.pathMode === "bezier" ? "bezier" : "straight",
    visible: typeof zone.visible === "boolean" ? zone.visible : true,
    locked: typeof zone.locked === "boolean" ? zone.locked : false,
    opacity: clampNumber(typeof zone.opacity === "number" ? zone.opacity : 1, 0.05, 1)
  };
}

function defaultDesignerLayers(): DesignerLayersForm {
  return {
    artwork: { visible: true, locked: false, opacity: 1 },
    reference: { visible: true, locked: false, opacity: 0.75 },
    zones: { visible: true, locked: false, opacity: 0.35 },
    strings: { visible: true, locked: false, opacity: 1 }
  };
}

function normalizeDesignerLayers(layers: (Partial<DesignerLayersForm> & { svg?: DesignerLayerSettings }) | undefined, fallback: DesignerLayersForm): DesignerLayersForm {
  const reference = layers?.reference ?? layers?.svg;
  return {
    artwork: normalizeDesignerLayer(layers?.artwork, fallback.artwork),
    reference: normalizeDesignerLayer(reference, fallback.reference),
    zones: normalizeDesignerLayer(layers?.zones, fallback.zones),
    strings: normalizeDesignerLayer(layers?.strings, fallback.strings)
  };
}

function normalizeDesignerArtwork(artwork: DesignerArtworkForm): DesignerArtworkForm {
  return {
    id: typeof artwork.id === "string" && artwork.id ? artwork.id : typeof artwork.assetId === "string" && artwork.assetId ? `artwork_${artwork.assetId}` : "artwork",
    assetId: typeof artwork.assetId === "string" ? artwork.assetId : "",
    name: typeof artwork.name === "string" && artwork.name ? artwork.name : "Artwork",
    x: typeof artwork.x === "number" && Number.isFinite(artwork.x) ? artwork.x : 0,
    y: typeof artwork.y === "number" && Number.isFinite(artwork.y) ? artwork.y : 0,
    width: positiveNumber(artwork.width, 20),
    height: positiveNumber(artwork.height, 20),
    visible: typeof artwork.visible === "boolean" ? artwork.visible : true,
    locked: typeof artwork.locked === "boolean" ? artwork.locked : false,
    opacity: clampNumber(typeof artwork.opacity === "number" ? artwork.opacity : 1, 0.05, 1)
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
  // An empty array is a valid, user-authored state: it means every build area
  // was deliberately removed. Only fall back for documents that predate the
  // buildAreas field altogether.
  const source = Array.isArray(designer?.buildAreas) ? designer.buildAreas : legacyBuildArea ? [legacyBuildArea] : fallback;
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
    pathMode: buildArea.pathMode === "bezier" ? "bezier" : "straight",
    visible: typeof buildArea.visible === "boolean" ? buildArea.visible : true,
    locked: typeof buildArea.locked === "boolean" ? buildArea.locked : false,
    opacity: clampNumber(typeof buildArea.opacity === "number" ? buildArea.opacity : 1, 0.05, 1)
  };
}

function normalizeDesignerPoints(points: DesignerPoint[] | undefined) {
  if (!Array.isArray(points) || points.length < 3) return undefined;
  const normalized = points
    .filter((point) => typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y))
    .map((point) => ({
      x: point.x,
      y: point.y,
      ...(isDesignerPointNodeType(point.nodeType) ? { nodeType: point.nodeType } : {}),
      ...(isDesignerHandle(point.handleIn) ? { handleIn: { x: point.handleIn.x, y: point.handleIn.y } } : {}),
      ...(isDesignerHandle(point.handleOut) ? { handleOut: { x: point.handleOut.x, y: point.handleOut.y } } : {})
    }));
  return normalized.length >= 3 ? normalized : undefined;
}

function isDesignerPointNodeType(value: unknown): value is DesignerPointNodeType {
  return value === "corner" || value === "straight" || value === "smooth" || value === "symmetric";
}

function isDesignerHandle(handle: DesignerPoint["handleIn"] | undefined): handle is { x: number; y: number } {
  return Boolean(handle && typeof handle.x === "number" && Number.isFinite(handle.x) && typeof handle.y === "number" && Number.isFinite(handle.y));
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

function nonNegativeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
