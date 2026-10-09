import { applyDesignerDerivedOperation } from "./designer-derived-geometry";
import { DEFAULT_DESIGNER_FONT_ID, designerFontResource } from "./designer-font-catalog";

export type DesignerPointNodeType = "corner" | "straight" | "smooth" | "symmetric";

export type DesignerPoint = {
  x: number;
  y: number;
  joint?: boolean;
  nodeType?: DesignerPointNodeType;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
  /** Parametric corner fillet radius in mm, applied on straight/corner nodes. */
  radiusMm?: number;
};

export type DesignerContour = {
  points: DesignerPoint[];
  pathMode: "straight" | "bezier";
  closed: true;
};

export const DESIGNER_SCHEMA_VERSION = 11 as const;
export const DEFAULT_CHANNEL_ROUTER_DIAMETER_MM = 10;

/**
 * Canonical, layer-agnostic vector geometry. Semantic objects reference one of
 * these records; their inline bounds/points remain as a compatibility view for
 * the phase-2 migration and are rebuilt from this source when a document loads.
 */
export type DesignerGeometry = {
  id: string;
  kind: "rect" | "ellipse" | "path";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  /** All closed contours when this is a compound path, including the outer profile. */
  contours?: DesignerContour[];
  pathMode?: "straight" | "bezier";
  closed?: boolean;
  fillRule?: "nonzero" | "evenodd";
};

export type DesignerProjectionLayer = "reference" | "zones" | "faceGraphic";

export type DesignerProjection = {
  id: string;
  name: string;
  geometryId: string;
  sourceGeometryId: string;
  targetLayer: DesignerProjectionLayer;
  linked: true;
  visible: boolean;
};

export type DesignerProjectionIssue = "broken" | "cycle";

export type DesignerDerivedGeometry = {
  id: string;
  name: string;
  geometryId: string;
  sourceGeometryId: string;
  targetLayer: DesignerProjectionLayer;
  operation: "offset" | "fillet";
  distanceMm?: number;
  join?: "round" | "miter" | "bevel";
  miterLimit?: number;
  radiusMm?: number;
  /** Zero-based corner indices across all source contours; omitted means all eligible corners. */
  cornerIndices?: number[];
  /** Physical mask semantics only when targetLayer is Face Graphic. */
  passMode?: DesignerFaceGraphicPassMode;
  filterColor?: string;
  visible: boolean;
};

export type DesignerDerivedGeometryIssue = DesignerProjectionIssue | "collapsed" | "invalid-topology";
export type DesignerGeometryResolutionIssue = DesignerDerivedGeometryIssue;

export type DesignerText = {
  id: string;
  name: string;
  text: string;
  fontId: string;
  fontHash: string;
  fontSizeMm: number;
  trackingMm: number;
  lineHeight: number;
  alignment: "left" | "center" | "right";
  x: number;
  y: number;
  targetLayer: DesignerProjectionLayer;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerZoneForm = {
  id: string;
  geometryId?: string;
  name: string;
  shape: "rect" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  contours?: DesignerContour[];
  fillRule?: "nonzero" | "evenodd";
  pathMode?: "straight" | "bezier";
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerFaceGraphicPassMode = "opaque" | "clear" | "translucent";

/** Front-face vinyl/mask geometry. It has no lighting or electrical behavior. */
export type DesignerFaceGraphicForm = {
  id: string;
  geometryId?: string;
  name: string;
  shape: "rect" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  contours?: DesignerContour[];
  fillRule?: "nonzero" | "evenodd";
  pathMode?: "straight" | "bezier";
  passMode: DesignerFaceGraphicPassMode;
  filterColor: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerGroupForm = {
  id: string;
  name: string;
  members: Array<{ type: "zone" | "group"; id: string }>;
};

export type DesignerChannelCap = "butt" | "round";

/**
 * A neon-flex style channel. It reuses the Bezier trajectory (center line) but
 * carries its own semantics: a configurable width and end treatment. The two
 * parallel borders are derived, never edited on their own. It behaves as a zone
 * for pixel mapping and effects. Its JSON keeps the center path and width, not a
 * generated polygon.
 */
export type DesignerChannelForm = {
  id: string;
  geometryId?: string;
  name: string;
  points: DesignerPoint[];
  pathMode: "straight" | "bezier";
  widthMm: number;
  closed: boolean;
  cap: DesignerChannelCap;
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerOpticalMode = "front" | "halo" | "wall_wash";

export const DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS: ReadonlyArray<{ id: string; mode: DesignerOpticalMode; name: string }> = [
  { id: "full_front", mode: "front", name: "All Front" },
  { id: "full_halo", mode: "halo", name: "All Halo" },
  { id: "full_wall_wash", mode: "wall_wash", name: "All Wall Wash" }
];

export function designerGlobalLightSourceTarget(mode: DesignerOpticalMode) {
  return DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.find((target) => target.mode === mode)!;
}

export function designerGlobalLightSourceMode(targetId: string) {
  return DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.find((target) => target.id === targetId)?.mode ?? null;
}

export type DesignerOpticalMaterial = "none" | "silicone" | "milky_white" | "day_night" | "opaque";
export type DesignerOpticalReceiverType = "canvas" | "build_area" | "zone";

/**
 * Physical light mounts are presentation/fabrication metadata. They consume the
 * compiled pixel map but never change electrical topology or effect targeting.
 */
export type DesignerLightSource = {
  id: string;
  name: string;
  targetType: "zone" | "channel";
  targetId: string;
  stringIds: string[];
  visible: boolean;
  locked: boolean;
  mode: DesignerOpticalMode;
  receiverType: DesignerOpticalReceiverType;
  receiverId?: string;
  material: DesignerOpticalMaterial;
  transmissionPct: number;
  faceColor: string;
  intensity: number;
  sourceDistanceCm: number;
  spreadCm: number;
  softnessCm: number;
  falloff: number;
  directionDeg: number;
  throwCm: number;
  beamAngleDeg: number;
  occludeSource: boolean;
  enabled: boolean;
};

/** @deprecated Read-only compatibility name for pre-Light Sources documents. */
export type DesignerOpticalTreatment = DesignerLightSource;

export type DesignerRouteKind = "led_string" | "data_cable";
export type DesignerRouteSurface = "rear" | "front";

export type DesignerRouteForm = {
  id: string;
  name: string;
  kind: DesignerRouteKind;
  /** Designer-only mounting face used to isolate dense wiring while authoring. */
  designSurface?: DesignerRouteSurface;
  points: DesignerPoint[];
  visible?: boolean;
};

export type DesignerControllerForm = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataOutputs: number;
  visible?: boolean;
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
  faceGraphic: DesignerLayerSettings;
  lightSources: DesignerLayerSettings;
  hardware: DesignerLayerSettings;
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
  geometryId?: string;
  name: string;
  shape: "rect" | "ellipse" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  points?: DesignerPoint[];
  contours?: DesignerContour[];
  fillRule?: "nonzero" | "evenodd";
  pathMode?: "straight" | "bezier";
  visible: boolean;
  locked: boolean;
  opacity: number;
};

export type DesignerWorkLineForm = {
  id: string;
  name: string;
  /** Organizational owner captured at creation; omitted means global. */
  layer?: "artwork" | "zones" | "faceGraphic";
  points: DesignerPoint[];
};

export type DesignerAlignmentMarksForm = {
  enabled: boolean;
  locked: boolean;
  /** Top-left calibration origin in canonical canvas centimeters. */
  originXcm: number;
  originYcm: number;
  /** Exact distance between each orthogonal pair, persisted in millimeters. */
  spacingMm: number;
};

export type DesignerForm = {
  /** Missing on legacy documents; normalization always writes the current version. */
  designerSchemaVersion?: typeof DESIGNER_SCHEMA_VERSION;
  /** Canonical vector source of truth from schema version 2 onward. */
  geometries?: DesignerGeometry[];
  projections: DesignerProjection[];
  derivedGeometries: DesignerDerivedGeometry[];
  texts: DesignerText[];
  canvasWidthCm: number;
  canvasHeightCm: number;
  addressablePixelsPerMeter: number;
  ledsPerMeter: number;
  ledDensityPerMeter: number;
  snapCm: number;
  rulerUnit: "cm" | "in";
  /** Nominal CNC cutter diameter retained as fabrication guidance. */
  fabricationCutterDiameterMm: number;
  /** Preferred display/input unit; the persisted physical value remains millimeters. */
  fabricationCutterUnit: "mm" | "in" | "cm";
  /** Transitional schema-9 Fillet value retained only for saved-document compatibility. */
  filletRadiusMm: number;
  /** Router-bit diameter used as the width of newly traced neon-flex channels. */
  channelRouterDiameterMm: number;
  alignmentMarks: DesignerAlignmentMarksForm;
  rulerVisible: boolean;
  sourceSvg: string | null;
  layers: DesignerLayersForm;
  artwork: DesignerArtworkForm[];
  /** Construction-only open polylines, globally shown or hidden. */
  workLinesVisible: boolean;
  workLines: DesignerWorkLineForm[];
  buildAreas: DesignerBuildAreaForm[];
  controller: DesignerControllerForm;
  zones: DesignerZoneForm[];
  faceGraphics: DesignerFaceGraphicForm[];
  groups: DesignerGroupForm[];
  channels: DesignerChannelForm[];
  lightSources: DesignerLightSource[];
  /** Legacy input field. Normalization migrates it into lightSources. */
  opticalTreatments?: DesignerOpticalTreatment[];
  routes: DesignerRouteForm[];
};

export type ClipParams = Record<string, string | number | boolean | null | string[] | number[]>;

export type ClipForm = {
  id: string;
  name: string;
  enabled?: boolean;
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
  laneCount?: number;
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
        laneCount: 3,
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
        laneCount: 1,
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

/**
 * Creates the clean authoring document used for newly persisted partituras.
 * The richer default document remains available as a demo/test fixture.
 */
export function createNewPartituraDocument(projectId: string): PartituraDocument {
  const designer = createDefaultDesigner();
  return {
    projectId,
    scenes: [
      {
        id: "normal",
        name: "Normal",
        loop: true,
        durationMs: 4000,
        laneCount: 1,
        clips: []
      }
    ],
    activeSceneId: "normal",
    previewTimeMs: 0,
    accentColor: "#FFFFFF",
    designer: canonicalizeDesignerGeometry({
      ...designer,
      artwork: [],
      workLines: [],
      projections: [],
      derivedGeometries: [],
      texts: [],
      buildAreas: [],
      zones: [],
      faceGraphics: [],
      groups: [],
      channels: [],
      lightSources: [],
      routes: []
    })
  };
}

export function clonePartituraDocument(document: PartituraDocument) {
  return JSON.parse(JSON.stringify(document)) as PartituraDocument;
}

/** Builds a clip name/id that does not collide with the clips already in a scene. */
export function createClipIdentity(clips: Array<{ id: string; name: string }>, labelPrefix = "Clip") {
  const usedNames = new Set(clips.map((clip) => clip.name));
  const usedIds = new Set(clips.map((clip) => clip.id));
  let index = clips.length + 1;
  while (usedNames.has(`${labelPrefix} ${index}`)) index += 1;
  const stamp = Date.now();
  let id = `clip_${stamp}_${index}`;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `clip_${stamp}_${index}_${suffix}`;
    suffix += 1;
  }
  return { id, name: `${labelPrefix} ${index}` };
}

/** Uses the last empty track, or returns the next track when all are occupied. */
export function nextEmptyClipLayer(scene: Pick<SceneForm, "laneCount" | "clips">) {
  const declaredLaneCount = typeof scene.laneCount === "number" && Number.isFinite(scene.laneCount)
    ? Math.max(1, Math.round(scene.laneCount))
    : 1;
  const laneCount = Math.max(declaredLaneCount, inferSceneLaneCount(scene.clips));
  const occupied = new Set(scene.clips.map((clip) => Math.max(0, Math.round(clip.layer))));
  for (let layer = laneCount - 1; layer >= 0; layer -= 1) {
    if (!occupied.has(layer)) return layer;
  }
  return laneCount;
}

export function normalizeDefaultSignLayout(document: PartituraDocument) {
  const fallback = createDefaultPartituraDocument(document.projectId);
  const source = clonePartituraDocument(document);
  const designer = normalizeDesigner(source.designer, source.compiledLayout);
  const targetIds = new Set(["full_sign", ...DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.map((target) => target.id), ...designer.lightSources.map((source) => source.id), ...designer.zones.map((zone) => zone.id), ...designer.channels.map((channel) => channel.id), ...designer.groups.map((group) => group.id)]);
  // An empty scene list is a valid authoring state while Animate is being composed.
  const scenes = Array.isArray(source.scenes) ? source.scenes : fallback.scenes;

  return {
    projectId: source.projectId || fallback.projectId,
    scenes: scenes.map((scene) => ({
      ...scene,
      laneCount: Math.max(1, Math.round(positiveNumber(scene.laneCount, inferSceneLaneCount(scene.clips ?? [])))),
      clips: ensureUniqueClipNames(migrateClipsToLightSources(scene.clips ?? [], designer).map((clip) => ({
        ...clip,
        enabled: clip.enabled !== false,
        target: targetIds.has(clip.target) ? clip.target : "full_sign",
        coordinateSpace: "local"
      })))
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
  const designer: DesignerForm = {
    canvasWidthCm: 170,
    canvasHeightCm: 40,
    addressablePixelsPerMeter: 60,
    ledsPerMeter: 60,
    ledDensityPerMeter: 60,
    snapCm: 2,
    rulerUnit: "cm",
    fabricationCutterDiameterMm: 3.175,
    fabricationCutterUnit: "mm",
    filletRadiusMm: 3.175,
    channelRouterDiameterMm: DEFAULT_CHANNEL_ROUTER_DIAMETER_MM,
    alignmentMarks: { enabled: false, locked: false, originXcm: 2, originYcm: 2, spacingMm: 100 },
    rulerVisible: true,
    sourceSvg: null,
    layers: defaultDesignerLayers(),
    artwork: [],
    workLinesVisible: true,
    workLines: [],
    projections: [],
    derivedGeometries: [],
    texts: [],
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
    channels: [],
    lightSources: [],
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
    faceGraphics: [],
    routes: [
      { id: "route_fondo", name: "Fondo LED string", kind: "led_string", designSurface: "rear", points: [{ x: 44, y: 4, joint: true }, { x: 100, y: 4 }, { x: 100, y: 8 }, { x: 44, y: 8 }, { x: 44, y: 12 }, { x: 100, y: 12 }] },
      { id: "route_estrella", name: "Estrella LED string", kind: "led_string", designSurface: "rear", points: [{ x: 110, y: 12 }, { x: 124, y: 12 }] },
      { id: "route_letras", name: "Letras LED string", kind: "led_string", designSurface: "rear", points: [{ x: 44, y: 30 }, { x: 64, y: 30 }, { x: 70, y: 30 }, { x: 90, y: 30 }, { x: 96, y: 30 }, { x: 116, y: 30 }, { x: 122, y: 30 }, { x: 142, y: 30 }] },
      { id: "data_feed_1", name: "Data cable", kind: "data_cable", designSurface: "rear", points: [{ x: 16, y: 8, joint: true }, { x: 32, y: 8 }, { x: 32, y: 4 }, { x: 44, y: 4, joint: true }] }
    ]
  };
  return canonicalizeDesignerGeometry(designer);
}

function normalizeDesigner(designer?: DesignerForm, compiledLayout?: PartituraDocument["compiledLayout"]): DesignerForm {
  const fallback = createDefaultDesigner();
  if (!designer) return fallback;
  // Empty collections are authored state, not a request to restore the demo
  // document. Only documents that predate a field receive its fallback.
  const routes = Array.isArray(designer.routes) ? designer.routes.map((route, index): DesignerRouteForm => ({
    id: typeof route.id === "string" && route.id ? route.id : `route_${index + 1}`,
    name: typeof route.name === "string" && route.name ? route.name : `Route ${index + 1}`,
    kind: route.kind === "data_cable" ? "data_cable" : "led_string",
    designSurface: route.designSurface === "front" ? "front" : "rear",
    visible: route.visible !== false,
    points: Array.isArray(route.points) ? route.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({ x: point.x, y: point.y, ...(point.joint ? { joint: true } : {}) })) : []
  })).filter((route) => route.points.length >= 2) : fallback.routes;
  const rawLightSources = Array.isArray(designer.lightSources) && (designer.lightSources.length > 0 || !Array.isArray(designer.opticalTreatments))
    ? designer.lightSources
    : Array.isArray(designer.opticalTreatments) ? designer.opticalTreatments : [];
  const normalized: DesignerForm = {
    canvasWidthCm: positiveNumber(designer.canvasWidthCm, fallback.canvasWidthCm),
    canvasHeightCm: positiveNumber(designer.canvasHeightCm, fallback.canvasHeightCm),
    addressablePixelsPerMeter: positiveNumber(designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.addressablePixelsPerMeter),
    ledsPerMeter: positiveNumber(designer.ledsPerMeter ?? designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.ledsPerMeter),
    ledDensityPerMeter: positiveNumber(designer.addressablePixelsPerMeter ?? designer.ledDensityPerMeter, fallback.ledDensityPerMeter),
    snapCm: nonNegativeNumber(designer.snapCm, fallback.snapCm),
    rulerUnit: designer.rulerUnit === "in" ? "in" : "cm",
    fabricationCutterDiameterMm: positiveNumber(designer.fabricationCutterDiameterMm, fallback.fabricationCutterDiameterMm),
    fabricationCutterUnit: designer.fabricationCutterUnit === "in" || designer.fabricationCutterUnit === "cm" ? designer.fabricationCutterUnit : "mm",
    filletRadiusMm: positiveNumber(designer.filletRadiusMm, positiveNumber(designer.fabricationCutterDiameterMm, fallback.fabricationCutterDiameterMm) / 2),
    channelRouterDiameterMm: Math.max(3, Math.min(20, positiveNumber(designer.channelRouterDiameterMm, fallback.channelRouterDiameterMm))),
    alignmentMarks: {
      enabled: designer.alignmentMarks?.enabled === true,
      locked: designer.alignmentMarks?.locked === true,
      originXcm: nonNegativeNumber(designer.alignmentMarks?.originXcm, fallback.alignmentMarks.originXcm),
      originYcm: nonNegativeNumber(designer.alignmentMarks?.originYcm, fallback.alignmentMarks.originYcm),
      spacingMm: positiveNumber(designer.alignmentMarks?.spacingMm, fallback.alignmentMarks.spacingMm)
    },
    rulerVisible: typeof designer.rulerVisible === "boolean" ? designer.rulerVisible : fallback.rulerVisible,
    sourceSvg: typeof designer.sourceSvg === "string" ? designer.sourceSvg : null,
    layers: normalizeDesignerLayers(designer.layers, fallback.layers),
    artwork: Array.isArray(designer.artwork) ? designer.artwork.map(normalizeDesignerArtwork) : [],
    workLinesVisible: designer.workLinesVisible !== false,
    workLines: normalizeDesignerWorkLines(designer.workLines),
    projections: normalizeDesignerProjections(designer.projections),
    derivedGeometries: normalizeDesignerDerivedGeometries(designer.derivedGeometries),
    texts: normalizeDesignerTexts(designer.texts),
    buildAreas: normalizeBuildAreas(designer, fallback.buildAreas),
    controller: normalizeController(designer.controller, fallback.controller),
    zones: Array.isArray(designer.zones) ? designer.zones.map(normalizeDesignerZone) : fallback.zones,
    faceGraphics: Array.isArray(designer.faceGraphics) ? designer.faceGraphics.map(normalizeFaceGraphic).filter((entry): entry is DesignerFaceGraphicForm => entry !== null) : [],
    groups: Array.isArray(designer.groups) ? designer.groups.filter((group) => typeof group.id === "string" && typeof group.name === "string").map((group) => ({ id: group.id, name: group.name, members: Array.isArray(group.members) ? group.members.filter((member) => member?.type === "zone" || member?.type === "group") : [] })) : [],
    channels: normalizeDesignerChannels(designer.channels),
    lightSources: normalizeLightSources(rawLightSources, routes, compiledLayout),
    routes
  };
  return hydrateDesignerFromCanonicalGeometry(normalized, designer.geometries);
}

type GeometryOwner = DesignerBuildAreaForm | DesignerZoneForm | DesignerChannelForm | DesignerFaceGraphicForm;

function defaultGeometryId(owner: GeometryOwner, type: "build_area" | "zone" | "channel" | "face_graphic") {
  return `geometry_${type}_${owner.id}`;
}

function geometryFromBuildArea(buildArea: DesignerBuildAreaForm): DesignerGeometry {
  return {
    id: buildArea.geometryId ?? defaultGeometryId(buildArea, "build_area"),
    kind: buildArea.shape === "polygon" ? "path" : buildArea.shape,
    x: buildArea.x,
    y: buildArea.y,
    width: buildArea.width,
    height: buildArea.height,
    ...(buildArea.points ? { points: cloneGeometryPoints(buildArea.points) } : {}),
    ...(buildArea.contours ? { contours: cloneGeometryContours(buildArea.contours) } : {}),
    ...(buildArea.shape === "polygon" ? { pathMode: buildArea.pathMode ?? "straight", closed: true, fillRule: buildArea.fillRule ?? (buildArea.contours ? "evenodd" as const : "nonzero" as const) } : {})
  };
}

function geometryFromZone(zone: DesignerZoneForm): DesignerGeometry {
  return {
    id: zone.geometryId ?? defaultGeometryId(zone, "zone"),
    kind: zone.shape === "polygon" ? "path" : zone.shape,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    ...(zone.points ? { points: cloneGeometryPoints(zone.points) } : {}),
    ...(zone.contours ? { contours: cloneGeometryContours(zone.contours) } : {}),
    ...(zone.shape === "polygon" ? { pathMode: zone.pathMode ?? "straight", closed: true, fillRule: zone.fillRule ?? (zone.contours ? "evenodd" as const : "nonzero" as const) } : {})
  };
}

function geometryFromFaceGraphic(element: DesignerFaceGraphicForm): DesignerGeometry {
  return {
    ...geometryFromZone(element),
    id: element.geometryId ?? defaultGeometryId(element, "face_graphic")
  };
}

function geometryFromChannel(channel: DesignerChannelForm): DesignerGeometry {
  const bounds = designerPointsBounds(channel.points);
  return {
    id: channel.geometryId ?? defaultGeometryId(channel, "channel"),
    kind: "path",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points: cloneGeometryPoints(channel.points),
    pathMode: channel.pathMode,
    closed: channel.closed,
    fillRule: "nonzero"
  };
}

/**
 * Commits the current editable compatibility views into canonical geometry.
 * All Designer mutations pass through this boundary, preventing parallel
 * geometry implementations while the UI is migrated incrementally.
 */
export function canonicalizeDesignerGeometry(designer: DesignerForm): DesignerForm {
  const buildAreas = designer.buildAreas.map((entry) => ({ ...entry, geometryId: entry.geometryId ?? defaultGeometryId(entry, "build_area") }));
  const zones = designer.zones.map((entry) => ({ ...entry, geometryId: entry.geometryId ?? defaultGeometryId(entry, "zone") }));
  const faceGraphics = designer.faceGraphics.map((entry) => ({ ...entry, geometryId: entry.geometryId ?? defaultGeometryId(entry, "face_graphic") }));
  const channels = designer.channels.map((entry) => ({ ...entry, geometryId: entry.geometryId ?? defaultGeometryId(entry, "channel") }));
  const authored = [
    ...buildAreas.map(geometryFromBuildArea),
    ...zones.map(geometryFromZone),
    ...faceGraphics.map(geometryFromFaceGraphic),
    ...channels.map(geometryFromChannel)
  ];
  return {
    ...designer,
    designerSchemaVersion: DESIGNER_SCHEMA_VERSION,
    geometries: authored,
    buildAreas,
    zones,
    faceGraphics,
    channels
  };
}

export function resolveDesignerProjectionGeometry(designer: DesignerForm, projectionId: string): { geometry: DesignerGeometry | null; issue: DesignerGeometryResolutionIssue | null; warnings: string[] } {
  const projection = designer.projections.find((entry) => entry.id === projectionId);
  return projection ? resolveDesignerGeometryReference(designer, projection.geometryId) : { geometry: null, issue: "broken", warnings: [] };
}

export function resolveDesignerDerivedGeometry(designer: DesignerForm, derivedId: string): { geometry: DesignerGeometry | null; issue: DesignerGeometryResolutionIssue | null; warnings: string[] } {
  const derived = designer.derivedGeometries.find((entry) => entry.id === derivedId);
  return derived ? resolveDesignerGeometryReference(designer, derived.geometryId) : { geometry: null, issue: "broken", warnings: [] };
}

export function resolveDesignerGeometryReference(designer: DesignerForm, geometryId: string): { geometry: DesignerGeometry | null; issue: DesignerGeometryResolutionIssue | null; warnings: string[] } {
  const geometries = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
  const projectionsByGeometry = new Map(designer.projections.map((projection) => [projection.geometryId, projection]));
  const derivedByGeometry = new Map(designer.derivedGeometries.map((operation) => [operation.geometryId, operation]));
  const visiting = new Set<string>();

  function resolve(id: string): { geometry: DesignerGeometry | null; issue: DesignerGeometryResolutionIssue | null; warnings: string[] } {
    const direct = geometries.get(id);
    if (direct) return { geometry: { ...direct, points: direct.points ? cloneGeometryPoints(direct.points) : undefined, contours: direct.contours ? cloneGeometryContours(direct.contours) : undefined }, issue: null, warnings: [] };
    if (visiting.has(id)) return { geometry: null, issue: "cycle", warnings: [] };
    visiting.add(id);
    const projection = projectionsByGeometry.get(id);
    if (projection) {
      const source = resolve(projection.sourceGeometryId);
      visiting.delete(id);
      return source.geometry ? { ...source, geometry: { ...source.geometry, id: projection.geometryId } } : source;
    }
    const derived = derivedByGeometry.get(id);
    if (derived) {
      const source = resolve(derived.sourceGeometryId);
      if (!source.geometry) { visiting.delete(id); return source; }
      const result = applyDesignerDerivedOperation(source.geometry, derived, derived.geometryId);
      visiting.delete(id);
      return { geometry: result.geometry, issue: result.issue, warnings: [...source.warnings, ...result.warnings] };
    }
    visiting.delete(id);
    return { geometry: null, issue: "broken", warnings: [] };
  }

  return resolve(geometryId);
}

export function wouldCreateDesignerProjectionCycle(designer: DesignerForm, projectionId: string, sourceGeometryId: string) {
  const projection = designer.projections.find((entry) => entry.id === projectionId);
  if (!projection) return false;
  const next = {
    ...designer,
    projections: designer.projections.map((entry) => entry.id === projectionId ? { ...entry, sourceGeometryId } : entry)
  };
  return resolveDesignerProjectionGeometry(next, projectionId).issue === "cycle";
}

export function wouldCreateDesignerDerivedGeometryCycle(designer: DesignerForm, derivedId: string, sourceGeometryId: string) {
  const operation = designer.derivedGeometries.find((entry) => entry.id === derivedId);
  if (!operation) return false;
  const next = { ...designer, derivedGeometries: designer.derivedGeometries.map((entry) => entry.id === derivedId ? { ...entry, sourceGeometryId } : entry) };
  return resolveDesignerDerivedGeometry(next, derivedId).issue === "cycle";
}

export function designerGeometryAsShape(geometry: DesignerGeometry) {
  return {
    shape: geometry.kind === "path" ? "polygon" as const : geometry.kind,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    points: geometry.points ? cloneGeometryPoints(geometry.points) : undefined,
    contours: geometry.contours ? cloneGeometryContours(geometry.contours) : undefined,
    pathMode: geometry.pathMode ?? "straight" as const,
    fillRule: geometry.fillRule ?? "nonzero" as const
  };
}

function hydrateDesignerFromCanonicalGeometry(designer: DesignerForm, rawGeometries: DesignerGeometry[] | undefined): DesignerForm {
  if (!Array.isArray(rawGeometries) || rawGeometries.length === 0) return canonicalizeDesignerGeometry(designer);
  const normalizedGeometries = rawGeometries.map(normalizeDesignerGeometry).filter((geometry): geometry is DesignerGeometry => geometry !== null);
  const byId = new Map(normalizedGeometries.map((geometry) => [geometry.id, geometry]));
  const buildAreas = designer.buildAreas.map((entry) => {
    const geometryId = entry.geometryId ?? defaultGeometryId(entry, "build_area");
    const geometry = byId.get(geometryId);
    if (!geometry || (geometry.kind === "path" && geometry.closed === false)) return { ...entry, geometryId };
    return applyGeometryToBuildArea({ ...entry, geometryId }, geometry);
  });
  const zones = designer.zones.map((entry) => {
    const geometryId = entry.geometryId ?? defaultGeometryId(entry, "zone");
    return applyGeometryToZone({ ...entry, geometryId }, byId.get(geometryId));
  });
  const faceGraphics = designer.faceGraphics.map((entry) => {
    const geometryId = entry.geometryId ?? defaultGeometryId(entry, "face_graphic");
    return applyGeometryToFaceGraphic({ ...entry, geometryId }, byId.get(geometryId));
  });
  const channels = designer.channels.map((entry) => {
    const geometryId = entry.geometryId ?? defaultGeometryId(entry, "channel");
    return applyGeometryToChannel({ ...entry, geometryId }, byId.get(geometryId));
  });
  return canonicalizeDesignerGeometry({ ...designer, geometries: normalizedGeometries, buildAreas, zones, faceGraphics, channels });
}

function normalizeDesignerGeometry(value: DesignerGeometry): DesignerGeometry | null {
  if (!value || typeof value.id !== "string" || !value.id) return null;
  const kind = value.kind === "ellipse" ? "ellipse" : value.kind === "path" ? "path" : "rect";
  const contours = kind === "path" && Array.isArray(value.contours)
    ? value.contours.map(normalizeDesignerContour).filter((contour): contour is DesignerContour => contour !== null)
    : [];
  const points = kind === "path" ? (contours[0]?.points ?? normalizeChannelPoints(value.points)) : undefined;
  if (kind === "path" && (!points || points.length < 2)) return null;
  const boundsPoints = contours.length ? contours.flatMap((contour) => contour.points) : points;
  const bounds = boundsPoints?.length ? designerPointsBounds(boundsPoints) : { x: finiteNumber(value.x, 0), y: finiteNumber(value.y, 0), width: positiveNumber(value.width, 1), height: positiveNumber(value.height, 1) };
  return {
    id: value.id,
    kind,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    ...(points ? { points } : {}),
    ...(contours.length > 1 ? { contours } : {}),
    ...(kind === "path" ? { pathMode: value.pathMode === "bezier" ? "bezier" as const : "straight" as const, closed: value.closed !== false, fillRule: value.fillRule === "evenodd" ? "evenodd" as const : "nonzero" as const } : {})
  };
}

function applyGeometryToBuildArea(entry: DesignerBuildAreaForm, geometry?: DesignerGeometry): DesignerBuildAreaForm {
  if (!geometry) return entry;
  return {
    ...entry,
    shape: geometry.kind === "path" ? "polygon" : geometry.kind,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    points: geometry.kind === "path" ? cloneGeometryPoints(geometry.points ?? []) : undefined,
    contours: geometry.kind === "path" && geometry.contours ? cloneGeometryContours(geometry.contours) : undefined,
    pathMode: geometry.kind === "path" ? geometry.pathMode ?? "straight" : undefined,
    fillRule: geometry.kind === "path" ? geometry.fillRule ?? "nonzero" : undefined
  };
}

function applyGeometryToZone(entry: DesignerZoneForm, geometry?: DesignerGeometry): DesignerZoneForm {
  return applyGeometryToBuildArea(entry, geometry) as DesignerZoneForm;
}

function applyGeometryToFaceGraphic(entry: DesignerFaceGraphicForm, geometry?: DesignerGeometry): DesignerFaceGraphicForm {
  return applyGeometryToBuildArea(entry, geometry) as DesignerFaceGraphicForm;
}

function applyGeometryToChannel(entry: DesignerChannelForm, geometry?: DesignerGeometry): DesignerChannelForm {
  if (!geometry || geometry.kind !== "path" || !geometry.points?.length) return entry;
  return { ...entry, points: cloneGeometryPoints(geometry.points), pathMode: geometry.pathMode ?? "straight", closed: geometry.closed !== false };
}

function cloneGeometryPoints(points: DesignerPoint[]) {
  return points.map((point) => ({
    x: point.x,
    y: point.y,
    ...(isDesignerPointNodeType(point.nodeType) ? { nodeType: point.nodeType } : {}),
    ...(isDesignerHandle(point.handleIn) ? { handleIn: { ...point.handleIn } } : {}),
    ...(isDesignerHandle(point.handleOut) ? { handleOut: { ...point.handleOut } } : {}),
    ...(isDesignerRadius(point.radiusMm) ? { radiusMm: point.radiusMm } : {})
  }));
}

function cloneGeometryContours(contours: DesignerContour[]) {
  return contours.map((contour) => ({
    points: cloneGeometryPoints(contour.points),
    pathMode: contour.pathMode,
    closed: true as const
  }));
}

function normalizeDesignerContour(value: DesignerContour): DesignerContour | null {
  const points = normalizeChannelPoints(value?.points);
  if (points.length < 3) return null;
  return { points, pathMode: value.pathMode === "bezier" ? "bezier" : "straight", closed: true };
}

function designerPointsBounds(points: DesignerPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(0.001, Math.max(...xs) - x), height: Math.max(0.001, Math.max(...ys) - y) };
}

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function createDefaultLightSource(targetType: "zone" | "channel", targetId: string, mode: DesignerOpticalMode = "front"): DesignerLightSource {
  return {
    id: `source_${targetType}_${targetId}_${mode}`,
    name: `${targetId} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`,
    targetType,
    targetId,
    stringIds: [],
    visible: true,
    locked: false,
    mode,
    receiverType: "canvas",
    material: mode === "front" ? "none" : mode === "halo" ? "opaque" : "none",
    transmissionPct: 100,
    faceColor: "#16181d",
    intensity: 1,
    sourceDistanceCm: mode === "halo" ? 4 : 8,
    spreadCm: mode === "halo" ? 5 : 3,
    softnessCm: mode === "front" ? 0 : 2,
    falloff: 1.4,
    directionDeg: 90,
    throwCm: 18,
    beamAngleDeg: 55,
    occludeSource: mode === "halo",
    enabled: true
  };
}

export const createDefaultOpticalTreatment = createDefaultLightSource;

function normalizeLightSources(sources: DesignerLightSource[], routes: DesignerRouteForm[], compiledLayout?: PartituraDocument["compiledLayout"]): DesignerLightSource[] {
  const ledStringIds = routes.filter((route) => route.kind === "led_string").map((route) => route.id);
  const validStringIds = new Set(ledStringIds);
  const pixelsById = new Map((compiledLayout?.pixelMap ?? []).map((pixel) => [pixel.id, pixel]));
  const compiledTargets = new Map((compiledLayout?.zones ?? []).map((zone) => [zone.id, zone]));
  return sources
    .filter((treatment) => treatment && typeof treatment.targetId === "string" && treatment.targetId)
    .map((treatment) => {
      const legacyMode = treatment.mode as DesignerOpticalMode | "direct" | "face_diffuser";
      const mode: DesignerOpticalMode = legacyMode === "halo" || legacyMode === "wall_wash" ? legacyMode : "front";
      const fallback = createDefaultLightSource(treatment.targetType === "channel" ? "channel" : "zone", treatment.targetId, mode);
      const receiverType: DesignerOpticalReceiverType = treatment.receiverType === "build_area" || treatment.receiverType === "zone" ? treatment.receiverType : "canvas";
      const material: DesignerOpticalMaterial = legacyMode === "face_diffuser" && treatment.material === "none"
        ? "milky_white"
        : treatment.material === "silicone" || treatment.material === "milky_white" || treatment.material === "day_night" || treatment.material === "opaque" ? treatment.material : "none";
      const inferredStringIds = compiledTargets.get(treatment.targetId)?.pixelIds
        .map((pixelId) => pixelsById.get(pixelId)?.stringId)
        .filter((stringId): stringId is string => Boolean(stringId && validStringIds.has(stringId))) ?? [];
      const authoredStringIds = Array.isArray(treatment.stringIds) ? treatment.stringIds.filter((id) => validStringIds.has(id)) : [];
      return {
        ...fallback,
        id: typeof treatment.id === "string" && treatment.id ? treatment.id : fallback.id,
        name: typeof treatment.name === "string" && treatment.name ? treatment.name : fallback.name,
        stringIds: Array.from(new Set(authoredStringIds.length ? authoredStringIds : inferredStringIds.length ? inferredStringIds : ledStringIds)),
        visible: treatment.visible !== false,
        locked: treatment.locked === true,
        mode,
        receiverType,
        ...(receiverType !== "canvas" && typeof treatment.receiverId === "string" && treatment.receiverId ? { receiverId: treatment.receiverId } : {}),
        material,
        transmissionPct: Number.isFinite(treatment.transmissionPct) ? clampNumber(treatment.transmissionPct, 1, 100) : fallback.transmissionPct,
        faceColor: typeof treatment.faceColor === "string" && /^#[0-9a-f]{6}$/i.test(treatment.faceColor) ? treatment.faceColor : fallback.faceColor,
        intensity: clampNumber(treatment.intensity, 0, 3),
        sourceDistanceCm: clampNumber(treatment.sourceDistanceCm, 0, 30),
        spreadCm: clampNumber(treatment.spreadCm, 0, 30),
        softnessCm: clampNumber(treatment.softnessCm, 0, 20),
        falloff: clampNumber(treatment.falloff, 0.25, 4),
        directionDeg: clampNumber(treatment.directionDeg, -360, 360),
        throwCm: clampNumber(treatment.throwCm, 1, 200),
        beamAngleDeg: clampNumber(treatment.beamAngleDeg, 5, 170),
        occludeSource: typeof treatment.occludeSource === "boolean" ? treatment.occludeSource : fallback.occludeSource,
        enabled: typeof treatment.enabled === "boolean" ? treatment.enabled : true
      };
    });
}

function migrateClipsToLightSources(clips: ClipForm[], designer: DesignerForm) {
  return clips.flatMap((clip) => {
    if (designer.lightSources.some((source) => source.id === clip.target)) return [{ ...clip }];
    const sources = designer.lightSources.filter((source) => source.targetId === clip.target && source.enabled);
    if (!sources.length) return [{ ...clip }];
    return sources.map((source, index) => ({
      ...clip,
      id: index === 0 ? clip.id : `${clip.id}__${source.id}`,
      name: index === 0 ? clip.name : `${clip.name} · ${source.mode === "front" ? "Front" : source.mode === "halo" ? "Halo" : "Wall Wash"}`,
      target: source.id
    }));
  });
}

function normalizeDesignerZone(zone: DesignerZoneForm): DesignerZoneForm {
  const contours = normalizeDesignerContours(zone.contours);
  return {
    ...zone,
    shape: zone.shape === "ellipse" ? "ellipse" : zone.shape === "polygon" ? "polygon" : "rect",
    x: typeof zone.x === "number" && Number.isFinite(zone.x) ? zone.x : 0,
    y: typeof zone.y === "number" && Number.isFinite(zone.y) ? zone.y : 0,
    width: positiveNumber(zone.width, 10),
    height: positiveNumber(zone.height, 10),
    points: normalizeDesignerPoints(zone.points),
    contours,
    fillRule: contours ? "evenodd" : zone.fillRule === "evenodd" ? "evenodd" : "nonzero",
    pathMode: zone.pathMode === "bezier" ? "bezier" : "straight",
    visible: typeof zone.visible === "boolean" ? zone.visible : true,
    locked: typeof zone.locked === "boolean" ? zone.locked : false,
    opacity: clampNumber(typeof zone.opacity === "number" ? zone.opacity : 1, 0.05, 1)
  };
}

function normalizeFaceGraphic(element: DesignerFaceGraphicForm): DesignerFaceGraphicForm | null {
  if (!element || typeof element.id !== "string" || !element.id) return null;
  const normalized = normalizeDesignerZone(element);
  return {
    ...normalized,
    passMode: element.passMode === "opaque" || element.passMode === "clear" ? element.passMode : "translucent",
    filterColor: typeof element.filterColor === "string" && /^#[0-9a-f]{6}$/i.test(element.filterColor) ? element.filterColor.toUpperCase() : "#FFFFFF"
  };
}

function normalizeDesignerChannels(channels: DesignerChannelForm[] | undefined): DesignerChannelForm[] {
  if (!Array.isArray(channels)) return [];
  return channels
    .filter((channel) => channel && typeof channel.id === "string" && typeof channel.name === "string")
    .map((channel): DesignerChannelForm => {
      // Documents created before `closed` became an independent topology flag
      // encoded closure as cap="closed". Read that legacy value, but never
      // write it back into the normalized document.
      const legacyCap = channel.cap as DesignerChannelForm["cap"] | "closed";
      return {
        id: channel.id,
        ...(typeof channel.geometryId === "string" && channel.geometryId ? { geometryId: channel.geometryId } : {}),
        name: channel.name,
        points: normalizeChannelPoints(channel.points),
        pathMode: channel.pathMode === "bezier" ? "bezier" : "straight",
        widthMm: clampNumber(typeof channel.widthMm === "number" && Number.isFinite(channel.widthMm) ? channel.widthMm : 10, 3, 20),
        closed: typeof channel.closed === "boolean" ? channel.closed : legacyCap === "closed",
        cap: legacyCap === "round" ? "round" : "butt",
        visible: typeof channel.visible === "boolean" ? channel.visible : true,
        locked: typeof channel.locked === "boolean" ? channel.locked : false,
        opacity: clampNumber(typeof channel.opacity === "number" ? channel.opacity : 1, 0.05, 1)
      };
    })
    .filter((channel) => channel.points.length >= 2);
}

function normalizeDesignerProjections(projections: DesignerProjection[] | undefined): DesignerProjection[] {
  if (!Array.isArray(projections)) return [];
  const usedIds = new Set<string>();
  const usedGeometryIds = new Set<string>();
  return projections.flatMap((projection, index) => {
    if (!projection || typeof projection.sourceGeometryId !== "string" || !projection.sourceGeometryId) return [];
    const id = typeof projection.id === "string" && projection.id ? projection.id : `projection_${index + 1}`;
    if (usedIds.has(id)) return [];
    usedIds.add(id);
    const requestedGeometryId = typeof projection.geometryId === "string" && projection.geometryId ? projection.geometryId : `geometry_projection_${id}`;
    const geometryId = usedGeometryIds.has(requestedGeometryId) ? `geometry_projection_${id}` : requestedGeometryId;
    usedGeometryIds.add(geometryId);
    return [{
      id,
      name: typeof projection.name === "string" && projection.name ? projection.name : `Projection ${index + 1}`,
      geometryId,
      sourceGeometryId: projection.sourceGeometryId,
      targetLayer: projection.targetLayer === "reference" || projection.targetLayer === "zones" ? projection.targetLayer : "faceGraphic",
      linked: true as const,
      visible: projection.visible !== false
    }];
  });
}

function normalizeDesignerDerivedGeometries(operations: DesignerDerivedGeometry[] | undefined): DesignerDerivedGeometry[] {
  if (!Array.isArray(operations)) return [];
  const usedIds = new Set<string>();
  const usedGeometryIds = new Set<string>();
  return operations.flatMap((operation, index) => {
    if (!operation || typeof operation.sourceGeometryId !== "string" || !operation.sourceGeometryId) return [];
    const id = typeof operation.id === "string" && operation.id ? operation.id : `derived_${index + 1}`;
    if (usedIds.has(id)) return [];
    usedIds.add(id);
    const requestedGeometryId = typeof operation.geometryId === "string" && operation.geometryId ? operation.geometryId : `geometry_derived_${id}`;
    const geometryId = usedGeometryIds.has(requestedGeometryId) ? `geometry_derived_${id}` : requestedGeometryId;
    usedGeometryIds.add(geometryId);
    const isOffset = operation.operation === "offset";
    const targetLayer = operation.targetLayer === "reference" || operation.targetLayer === "zones" ? operation.targetLayer : "faceGraphic";
    return [{
      id,
      name: typeof operation.name === "string" && operation.name ? operation.name : `${isOffset ? "Offset" : "Fillet"} ${index + 1}`,
      geometryId,
      sourceGeometryId: operation.sourceGeometryId,
      targetLayer,
      operation: isOffset ? "offset" as const : "fillet" as const,
      ...(isOffset ? {
        distanceMm: finiteNumber(operation.distanceMm, 1),
        join: operation.join === "miter" || operation.join === "bevel" ? operation.join : "round" as const,
        miterLimit: Math.max(1, finiteNumber(operation.miterLimit, 4))
      } : {
        radiusMm: Math.max(0, finiteNumber(operation.radiusMm, 2)),
        ...(Array.isArray(operation.cornerIndices) ? { cornerIndices: Array.from(new Set(operation.cornerIndices.filter((value) => Number.isInteger(value) && value >= 0))) } : {})
      }),
      ...(targetLayer === "faceGraphic" ? {
        passMode: operation.passMode === "opaque" || operation.passMode === "clear" ? operation.passMode : "translucent" as const,
        filterColor: typeof operation.filterColor === "string" && /^#[0-9a-f]{6}$/i.test(operation.filterColor) ? operation.filterColor.toUpperCase() : "#FFFFFF"
      } : {}),
      visible: operation.visible !== false
    }];
  });
}

function normalizeDesignerTexts(texts: DesignerText[] | undefined): DesignerText[] {
  if (!Array.isArray(texts)) return [];
  const usedIds = new Set<string>();
  return texts.flatMap((entry, index) => {
    if (!entry) return [];
    const id = typeof entry.id === "string" && entry.id ? entry.id : `text_${index + 1}`;
    if (usedIds.has(id)) return [];
    usedIds.add(id);
    const requestedFont = designerFontResource(typeof entry.fontId === "string" ? entry.fontId : "");
    const font = requestedFont ?? designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    return [{
      id,
      name: typeof entry.name === "string" && entry.name ? entry.name : `Text ${index + 1}`,
      text: typeof entry.text === "string" ? entry.text : "Text",
      fontId: font.id,
      fontHash: requestedFont && typeof entry.fontHash === "string" && entry.fontHash ? entry.fontHash : font.hash,
      fontSizeMm: Math.max(1, finiteNumber(entry.fontSizeMm, 30)),
      trackingMm: finiteNumber(entry.trackingMm, 0),
      lineHeight: Math.max(0.5, finiteNumber(entry.lineHeight, 1.2)),
      alignment: entry.alignment === "center" || entry.alignment === "right" ? entry.alignment : "left" as const,
      x: finiteNumber(entry.x, 0),
      y: finiteNumber(entry.y, 0),
      targetLayer: entry.targetLayer === "zones" || entry.targetLayer === "faceGraphic" ? entry.targetLayer : "reference" as const,
      visible: entry.visible !== false,
      locked: entry.locked === true,
      opacity: clampNumber(finiteNumber(entry.opacity, 1), 0.05, 1)
    }];
  });
}

function normalizeChannelPoints(points: DesignerPoint[] | undefined): DesignerPoint[] {
  if (!Array.isArray(points)) return [];
  return points
    .filter((point) => typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y))
    .map((point) => ({
      x: point.x,
      y: point.y,
      ...(isDesignerPointNodeType(point.nodeType) ? { nodeType: point.nodeType } : {}),
      ...(isDesignerHandle(point.handleIn) ? { handleIn: { x: point.handleIn.x, y: point.handleIn.y } } : {}),
      ...(isDesignerHandle(point.handleOut) ? { handleOut: { x: point.handleOut.x, y: point.handleOut.y } } : {}),
      ...(isDesignerRadius(point.radiusMm) ? { radiusMm: point.radiusMm } : {})
    }));
}

function defaultDesignerLayers(): DesignerLayersForm {
  return {
    artwork: { visible: true, locked: false, opacity: 1 },
    reference: { visible: true, locked: false, opacity: 0.75 },
    zones: { visible: true, locked: false, opacity: 0.35 },
    faceGraphic: { visible: true, locked: false, opacity: 0.72 },
    lightSources: { visible: true, locked: false, opacity: 1 },
    hardware: { visible: true, locked: false, opacity: 1 },
    strings: { visible: true, locked: false, opacity: 1 }
  };
}

function normalizeDesignerLayers(layers: (Partial<DesignerLayersForm> & { svg?: DesignerLayerSettings }) | undefined, fallback: DesignerLayersForm): DesignerLayersForm {
  const reference = layers?.reference ?? layers?.svg;
  return {
    artwork: normalizeDesignerLayer(layers?.artwork, fallback.artwork),
    reference: normalizeDesignerLayer(reference, fallback.reference),
    zones: normalizeDesignerLayer(layers?.zones, fallback.zones),
    faceGraphic: normalizeDesignerLayer(layers?.faceGraphic, fallback.faceGraphic),
    lightSources: normalizeDesignerLayer(layers?.lightSources, fallback.lightSources),
    hardware: normalizeDesignerLayer(layers?.hardware, fallback.hardware),
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

function normalizeDesignerWorkLines(workLines: DesignerWorkLineForm[] | undefined): DesignerWorkLineForm[] {
  if (!Array.isArray(workLines)) return [];
  return workLines.flatMap((line, index) => {
    const points = Array.isArray(line?.points)
      ? line.points.filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)).map((point) => ({ x: point.x, y: point.y }))
      : [];
    if (points.length < 2) return [];
    const layer = line.layer === "artwork" || line.layer === "zones" || line.layer === "faceGraphic" ? line.layer : undefined;
    return [{
      id: typeof line.id === "string" && line.id ? line.id : `work_line_${index + 1}`,
      name: typeof line.name === "string" && line.name ? line.name : `Work line ${index + 1}`,
      ...(layer ? { layer } : {}),
      points
    }];
  });
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
  const contours = normalizeDesignerContours(buildArea.contours);
  return {
    id: typeof buildArea.id === "string" && buildArea.id ? buildArea.id : `build_area_${index + 1}`,
    ...(typeof buildArea.geometryId === "string" && buildArea.geometryId ? { geometryId: buildArea.geometryId } : {}),
    name: typeof buildArea.name === "string" && buildArea.name ? buildArea.name : index === 0 ? "Build Area" : `Build Area ${index + 1}`,
    shape: buildArea.shape === "ellipse" ? "ellipse" : buildArea.shape === "polygon" ? "polygon" : "rect",
    x: typeof buildArea.x === "number" && Number.isFinite(buildArea.x) ? buildArea.x : fallback.x,
    y: typeof buildArea.y === "number" && Number.isFinite(buildArea.y) ? buildArea.y : fallback.y,
    width: positiveNumber(buildArea.width, fallback.width),
    height: positiveNumber(buildArea.height, fallback.height),
    points: normalizeDesignerPoints(buildArea.points),
    contours,
    fillRule: contours ? "evenodd" : buildArea.fillRule === "evenodd" ? "evenodd" : "nonzero",
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
      ...(isDesignerHandle(point.handleOut) ? { handleOut: { x: point.handleOut.x, y: point.handleOut.y } } : {}),
      ...(isDesignerRadius(point.radiusMm) ? { radiusMm: point.radiusMm } : {})
    }));
  return normalized.length >= 3 ? normalized : undefined;
}

function normalizeDesignerContours(contours: DesignerContour[] | undefined) {
  if (!Array.isArray(contours)) return undefined;
  const normalized = contours.map(normalizeDesignerContour).filter((contour): contour is DesignerContour => contour !== null);
  return normalized.length > 1 ? normalized : undefined;
}

function isDesignerRadius(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
    dataOutputs: Math.max(1, Math.round(positiveNumber(controller.dataOutputs, fallback.dataOutputs))),
    visible: typeof controller.visible === "boolean" ? controller.visible : true
  };
}

function positiveNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function inferSceneLaneCount(clips: ClipForm[]) {
  return Math.max(1, ...clips.map((clip) => Math.max(0, Math.round(clip.layer)) + 1));
}

/** Keeps clip names distinguishable within a scene by suffixing repeated names. */
function ensureUniqueClipNames(clips: ClipForm[]) {
  const used = new Set<string>();
  return clips.map((clip) => {
    const name = typeof clip.name === "string" && clip.name ? clip.name : "Clip";
    if (!used.has(name)) {
      used.add(name);
      return clip.name === name ? clip : { ...clip, name };
    }
    let suffix = 2;
    while (used.has(`${name} ${suffix}`)) suffix += 1;
    const next = `${name} ${suffix}`;
    used.add(next);
    return { ...clip, name: next };
  });
}

function nonNegativeNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
