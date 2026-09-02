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
    accentColor: "#FFFFFF"
  };
}

export function clonePartituraDocument(document: PartituraDocument) {
  return JSON.parse(JSON.stringify(document)) as PartituraDocument;
}

export function normalizeDefaultSignLayout(document: PartituraDocument) {
  const next = clonePartituraDocument(document);
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
