export type SegmentForm = {
  id: string;
  name: string;
  output: number;
  start: number;
  length: number;
  reverse: boolean;
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
    chain1Pixels: 50,
    chain2Pixels: 100,
    chain3Pixels: 200,
    segments: [
      { id: "fondo_segment", name: "Fondo", output: 1, start: 0, length: 50, reverse: false },
      { id: "estrella_segment", name: "Estrella", output: 2, start: 0, length: 100, reverse: false },
      { id: "letra_1_segment", name: "Letra 1", output: 3, start: 0, length: 50, reverse: false },
      { id: "letra_2_segment", name: "Letra 2", output: 3, start: 50, length: 50, reverse: false },
      { id: "letra_3_segment", name: "Letra 3", output: 3, start: 100, length: 50, reverse: false },
      { id: "letra_4_segment", name: "Letra 4", output: 3, start: 150, length: 50, reverse: false }
    ],
    zones: [
      { id: "fondo", name: "Fondo", segments: ["fondo_segment"] },
      { id: "estrella", name: "Estrella", segments: ["estrella_segment"] },
      { id: "letras", name: "Letras", segments: ["letra_1_segment", "letra_2_segment", "letra_3_segment", "letra_4_segment"] },
      { id: "letra_1", name: "Letra 1", segments: ["letra_1_segment"] },
      { id: "letra_2", name: "Letra 2", segments: ["letra_2_segment"] },
      { id: "letra_3", name: "Letra 3", segments: ["letra_3_segment"] },
      { id: "letra_4", name: "Letra 4", segments: ["letra_4_segment"] },
      { id: "rotulo_completo", name: "Rotulo completo", segments: ["fondo_segment", "estrella_segment", "letra_1_segment", "letra_2_segment", "letra_3_segment", "letra_4_segment"] }
    ],
    scenes: [
      {
        id: "normal",
        name: "Normal",
        loop: true,
        durationMs: 4000,
        clips: [
          {
            id: "clip_fondo_verde",
            name: "Fondo verde",
            target: "fondo",
            effect: "solid",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 0,
            params: {
              color: "#00AA44"
            }
          },
          {
            id: "clip_estrella_roja",
            name: "Estrella roja",
            target: "estrella",
            effect: "solid",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 1,
            params: {
              color: "#FF2020"
            }
          },
          {
            id: "clip_letras_secuencia",
            name: "Letras secuencia",
            target: "letras",
            effect: "toggle",
            blend: "replace",
            startMs: 0,
            durationMs: 4000,
            layer: 2,
            params: {
              onColor: "#FFFFFF",
              offColor: "#000000",
              periodMs: 800,
              dutyCycle: 0.25,
              groupCount: 4
            }
          }
        ]
      }
    ],
    activeSceneId: "normal",
    previewTimeMs: 1000,
    accentColor: "#FFFFFF"
  };
}

export function clonePartituraDocument(document: PartituraDocument) {
  return JSON.parse(JSON.stringify(document)) as PartituraDocument;
}
