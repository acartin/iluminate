import type { Partitura } from "@iluminate/lighting-core";
import type { PlayerSceneMetadata, PlayerWorkerRequest, PlayerWorkerResponse } from "./player-worker-protocol";

export type PlayerState = "empty" | "loading" | "ready" | "playing" | "paused" | "error" | "destroyed";

export type PlayerStatus = {
  state: PlayerState;
  sceneId: string;
  timeMs: number;
  durationMs: number;
  pixelCount: number;
  message?: string;
};

type PlayerControllerCallbacks = {
  onFrame: (colors: Uint8Array, status: PlayerStatus) => void;
  onStatus?: (status: PlayerStatus) => void;
};

export class PlayerController {
  private readonly worker: Worker;
  private readonly callbacks: PlayerControllerCallbacks;
  private readonly targetFrameIntervalMs: number;
  private state: PlayerState = "empty";
  private scenes = new Map<string, PlayerSceneMetadata>();
  private sceneId = "";
  private durationMs = 0;
  private pixelCount = 0;
  private currentTimeMs = 0;
  private playStartedAt = 0;
  private playOffsetMs = 0;
  private lastSampleAt = Number.NEGATIVE_INFINITY;
  private requestId = 0;
  private activeLoadRequestId = 0;
  private inFlight = false;
  private pendingForcedSample: number | null = null;
  private availableBuffer: ArrayBuffer | null = null;
  private frameRequest: number | null = null;
  private externallySuspended = false;
  private pendingLoad: { requestId: number; resolve: () => void; reject: (error: Error) => void } | null = null;
  private lastStatusAt = Number.NEGATIVE_INFINITY;
  private readonly handleVisibilityChange = () => {
    if (document.hidden) this.cancelFrameLoop();
    else if (this.state === "playing") this.scheduleFrameLoop();
  };

  constructor(callbacks: PlayerControllerCallbacks, options: { targetFps?: number } = {}) {
    this.callbacks = callbacks;
    this.targetFrameIntervalMs = 1000 / Math.max(1, options.targetFps ?? 30);
    this.worker = new Worker(new URL("./player-worker.ts", import.meta.url), { type: "module", name: "iluminate-player-runtime" });
    this.worker.addEventListener("message", this.handleWorkerMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  async load(partitura: Partitura) {
    this.assertAlive();
    this.pauseInternal();
    this.pendingLoad?.resolve();
    this.pendingLoad = null;
    this.state = "loading";
    this.emitStatus(true);
    const requestId = ++this.requestId;
    this.activeLoadRequestId = requestId;
    this.pendingForcedSample = null;
    const result = new Promise<void>((resolve, reject) => {
      this.pendingLoad = { requestId, resolve, reject };
    });
    this.post({ type: "load", requestId, partitura });
    return result;
  }

  play() {
    this.assertPlayable();
    if (this.state === "playing") return;
    this.playOffsetMs = this.currentTimeMs;
    this.playStartedAt = performance.now();
    this.state = "playing";
    this.emitStatus(true);
    this.scheduleFrameLoop();
  }

  pause() {
    this.assertPlayable();
    if (this.state === "playing") this.currentTimeMs = this.resolvePlayingTime(performance.now());
    this.pauseInternal();
    this.state = "paused";
    this.emitStatus(true);
    this.sample(this.currentTimeMs, true);
  }

  stop() {
    this.assertPlayable();
    this.pauseInternal();
    this.currentTimeMs = 0;
    this.playOffsetMs = 0;
    this.state = "paused";
    this.emitStatus(true);
    this.sample(0, true);
  }

  seek(timeMs: number) {
    this.assertPlayable();
    this.currentTimeMs = this.normalizeTime(timeMs);
    this.playOffsetMs = this.currentTimeMs;
    if (this.state === "playing") this.playStartedAt = performance.now();
    this.emitStatus(true);
    this.sample(this.currentTimeMs, true);
  }

  setScene(sceneId: string) {
    this.assertPlayable();
    const scene = this.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} is not available in this player.`);
    this.sceneId = sceneId;
    this.durationMs = scene.durationMs;
    this.currentTimeMs = 0;
    this.playOffsetMs = 0;
    if (this.state === "playing") this.playStartedAt = performance.now();
    this.emitStatus(true);
    this.sample(0, true);
  }

  setSuspended(suspended: boolean) {
    this.externallySuspended = suspended;
    if (suspended) this.cancelFrameLoop();
    else if (this.state === "playing") this.scheduleFrameLoop();
  }

  getStatus(): PlayerStatus {
    return {
      state: this.state,
      sceneId: this.sceneId,
      timeMs: Math.round(this.currentTimeMs),
      durationMs: this.durationMs,
      pixelCount: this.pixelCount
    };
  }

  destroy() {
    if (this.state === "destroyed") return;
    this.cancelFrameLoop();
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.worker.removeEventListener("message", this.handleWorkerMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.post({ type: "dispose" });
    this.worker.terminate();
    this.pendingLoad?.reject(new Error("Player was destroyed while loading."));
    this.pendingLoad = null;
    this.availableBuffer = null;
    this.state = "destroyed";
  }

  private readonly handleWorkerMessage = (event: MessageEvent<PlayerWorkerResponse>) => {
    const message = event.data;
    if (message.type === "error") {
      if (message.requestId !== undefined && message.requestId < this.activeLoadRequestId) return;
      const error = new Error(message.message);
      if (this.pendingLoad && message.requestId === this.pendingLoad.requestId) {
        this.pendingLoad.reject(error);
        this.pendingLoad = null;
      }
      this.fail(error);
      return;
    }
    if (message.type === "ready") {
      if (!this.pendingLoad || message.requestId !== this.pendingLoad.requestId) return;
      this.scenes = new Map(message.scenes.map((scene) => [scene.id, scene]));
      this.sceneId = message.defaultScene;
      this.durationMs = this.scenes.get(this.sceneId)?.durationMs ?? 0;
      this.pixelCount = message.pixelCount;
      this.currentTimeMs = 0;
      this.playOffsetMs = 0;
      this.availableBuffer = new ArrayBuffer(message.pixelCount * 3);
      this.state = "ready";
      const pending = this.pendingLoad;
      this.pendingLoad = null;
      pending?.resolve();
      this.emitStatus(true);
      this.sample(0, true);
      return;
    }
    this.inFlight = false;
    if (message.requestId < this.activeLoadRequestId) return;
    this.availableBuffer = message.buffer;
    this.currentTimeMs = message.timeMs;
    const colors = new Uint8Array(message.buffer);
    const status = this.getStatus();
    this.callbacks.onFrame(colors, status);
    this.emitStatus(false);
    if (this.pendingForcedSample !== null) {
      const pendingTime = this.pendingForcedSample;
      this.pendingForcedSample = null;
      this.sample(pendingTime, true);
    }
  };

  private readonly handleWorkerError = (event: ErrorEvent) => {
    this.fail(new Error(event.message || "Player worker crashed."));
  };

  private scheduleFrameLoop() {
    if (this.frameRequest !== null || this.state !== "playing" || document.hidden || this.externallySuspended) return;
    const tick = (now: number) => {
      this.frameRequest = null;
      if (this.state !== "playing" || document.hidden || this.externallySuspended) return;
      const timeMs = this.resolvePlayingTime(now);
      this.currentTimeMs = timeMs;
      if (now - this.lastSampleAt >= this.targetFrameIntervalMs) {
        this.lastSampleAt = now;
        this.sample(timeMs, false);
      }
      const scene = this.scenes.get(this.sceneId);
      if (scene && !scene.loop && timeMs >= scene.durationMs) {
        this.pauseInternal();
        this.state = "paused";
        this.emitStatus(true);
        this.sample(scene.durationMs, true);
        return;
      }
      this.frameRequest = requestAnimationFrame(tick);
    };
    this.frameRequest = requestAnimationFrame(tick);
  }

  private cancelFrameLoop() {
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
  }

  private sample(timeMs: number, force: boolean) {
    if (!force && this.state !== "playing") return;
    if (this.inFlight) {
      if (force) this.pendingForcedSample = timeMs;
      return;
    }
    if (!this.availableBuffer || !this.sceneId) return;
    const buffer = this.availableBuffer;
    this.availableBuffer = null;
    this.inFlight = true;
    const requestId = ++this.requestId;
    this.post({ type: "sample", requestId, sceneId: this.sceneId, timeMs, buffer }, [buffer]);
  }

  private resolvePlayingTime(now: number) {
    return this.normalizeTime(this.playOffsetMs + now - this.playStartedAt);
  }

  private normalizeTime(value: number) {
    const duration = Math.max(1, this.durationMs);
    const scene = this.scenes.get(this.sceneId);
    if (scene?.loop) return ((value % duration) + duration) % duration;
    return Math.min(duration, Math.max(0, value));
  }

  private pauseInternal() {
    this.cancelFrameLoop();
  }

  private fail(error: Error) {
    this.pauseInternal();
    this.inFlight = false;
    this.state = "error";
    this.callbacks.onStatus?.({ ...this.getStatus(), message: error.message });
  }

  private emitStatus(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastStatusAt < 200) return;
    this.lastStatusAt = now;
    this.callbacks.onStatus?.(this.getStatus());
  }

  private post(message: PlayerWorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }

  private assertAlive() {
    if (this.state === "destroyed") throw new Error("Player has been destroyed.");
  }

  private assertPlayable() {
    this.assertAlive();
    if (this.state === "empty" || this.state === "loading" || this.state === "error") {
      throw new Error(`Player cannot execute this command while ${this.state}.`);
    }
  }
}
