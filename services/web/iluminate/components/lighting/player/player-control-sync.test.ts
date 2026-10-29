import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerState, PlayerStatus } from "./player-controller";
import { quantizePlayerTime, synchronizePlayerPlayback, synchronizePlayerScene } from "./player-control-sync";

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
  it("renders the same integer millisecond shown by the timeline", () => {
    assert.equal(quantizePlayerTime(0.49), 0);
    assert.equal(quantizePlayerTime(0.5), 1);
    assert.equal(quantizePlayerTime(871.6), 872);
  });

  it("does not execute playback or scene commands while a selected clip reloads the runtime", () => {
    const { controller, calls } = fakeController("loading");

    synchronizePlayerPlayback(controller, true);
    synchronizePlayerScene(controller, "scene_2", [{ id: "scene_1" }, { id: "scene_2" }]);

    assert.deepEqual(calls, []);
  });

  it("applies pending intent after the runtime becomes playable", () => {
    const { controller, calls } = fakeController("ready");

    synchronizePlayerScene(controller, "scene_2", [{ id: "scene_1" }, { id: "scene_2" }]);
    synchronizePlayerPlayback(controller, true);

    assert.deepEqual(calls, ["scene:scene_2", "play"]);
  });

  it("waits until a newly selected scene exists in the installed runtime", () => {
    const { controller, calls } = fakeController("ready");

    synchronizePlayerScene(controller, "scene_2", [{ id: "scene_1" }]);
    assert.deepEqual(calls, []);

    synchronizePlayerScene(controller, "scene_2", [{ id: "scene_1" }, { id: "scene_2" }]);
    assert.deepEqual(calls, ["scene:scene_2"]);
  });
});
