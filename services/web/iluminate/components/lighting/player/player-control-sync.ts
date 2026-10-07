import type { PlayerController, PlayerState } from "./player-controller";

type PlaybackController = Pick<PlayerController, "getStatus" | "play" | "pause">;
type SceneController = Pick<PlayerController, "getStatus" | "setScene">;

export function playerAcceptsCommands(state: PlayerState) {
  return state === "ready" || state === "playing" || state === "paused";
}

/** Synchronizes React intent without issuing commands during a runtime load. */
export function synchronizePlayerPlayback(controller: PlaybackController, playing: boolean) {
  const state = controller.getStatus().state;
  if (!playerAcceptsCommands(state)) return;
  if (playing && state !== "playing") controller.play();
  if (!playing && state === "playing") controller.pause();
}

export function synchronizePlayerScene(controller: SceneController, sceneId: string) {
  const status = controller.getStatus();
  if (!playerAcceptsCommands(status.state) || status.sceneId === sceneId) return;
  controller.setScene(sceneId);
}
