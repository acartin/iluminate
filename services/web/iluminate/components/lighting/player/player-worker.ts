/// <reference lib="webworker" />

import { preparePartituraRuntime, renderFrameInto, type PreparedPartituraRuntime } from "@iluminate/lighting-core";
import type { PlayerWorkerRequest, PlayerWorkerResponse } from "./player-worker-protocol";

let runtime: PreparedPartituraRuntime | null = null;

self.addEventListener("message", (event: MessageEvent<PlayerWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "dispose") {
      runtime = null;
      self.close();
      return;
    }
    if (request.type === "load") {
      runtime = preparePartituraRuntime(request.partitura);
      post({
        type: "ready",
        requestId: request.requestId,
        pixelCount: runtime.pixelCount,
        defaultScene: request.partitura.defaultScene,
        scenes: request.partitura.scenes.map((scene) => ({ id: scene.id, durationMs: scene.durationMs, loop: scene.loop }))
      });
      return;
    }
    if (!runtime) throw new Error("Player runtime is not loaded.");
    const colors = new Uint8Array(request.buffer);
    const frame = renderFrameInto(runtime, request.sceneId, request.timeMs, colors);
    post({
      type: "frame",
      requestId: request.requestId,
      sceneId: frame.sceneId,
      timeMs: frame.timeMs,
      buffer: frame.colors.buffer as ArrayBuffer
    }, [frame.colors.buffer as ArrayBuffer]);
  } catch (error) {
    post({ type: "error", requestId: "requestId" in request ? request.requestId : undefined, message: error instanceof Error ? error.message : "Player worker failed." });
  }
});

function post(message: PlayerWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}
