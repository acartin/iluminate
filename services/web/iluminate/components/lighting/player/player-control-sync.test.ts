import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerState, PlayerStatus } from "./player-controller";
import { synchronizePlayerPlayback, synchronizePlayerScene } from "./player-control-sync";

function fakeController(state: PlayerState, sceneId = "scene_1") {
  const calls: string[] = [];
  const status: PlayerStatus = { state, sceneId, timeMs: 0, durationMs: 3_000, pixelCount: 1 };
  return {
    calls,
    controller: {
      getStatus: () => status,
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      setScene: (nextSceneId: string) => calls.push(`scene:${nextSceneId}`)
    }
  };
}

describe("player control synchronization", () => {
  it("does not execute playback or scene commands while a selected clip reloads the runtime", () => {
    const { controller, calls } = fakeController("loading");

    synchronizePlayerPlayback(controller, true);
    synchronizePlayerScene(controller, "scene_2");

    assert.deepEqual(calls, []);
  });

  it("applies pending intent after the runtime becomes playable", () => {
    const { controller, calls } = fakeController("ready");

    synchronizePlayerScene(controller, "scene_2");
    synchronizePlayerPlayback(controller, true);

    assert.deepEqual(calls, ["scene:scene_2", "play"]);
  });
});
