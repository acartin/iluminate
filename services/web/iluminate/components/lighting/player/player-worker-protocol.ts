import type { Partitura } from "@iluminate/lighting-core";

export type PlayerSceneMetadata = {
  id: string;
  durationMs: number;
  loop: boolean;
};

export type PlayerWorkerRequest =
  | { type: "load"; requestId: number; partitura: Partitura }
  | { type: "sample"; requestId: number; sceneId: string; timeMs: number; buffer: ArrayBuffer }
  | { type: "dispose" };

export type PlayerWorkerResponse =
  | { type: "ready"; requestId: number; pixelCount: number; defaultScene: string; scenes: PlayerSceneMetadata[] }
  | { type: "frame"; requestId: number; sceneId: string; timeMs: number; buffer: ArrayBuffer }
  | { type: "error"; requestId?: number; message: string };
