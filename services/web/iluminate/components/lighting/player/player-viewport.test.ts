import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePlayerViewport } from "./player-viewport";

function assertClose(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
}

describe("player viewport", () => {
  it("keeps one world unit the same size on both axes at initial render", () => {
    const viewport = normalizePlayerViewport(
      { x: -20, y: -30, width: 250, height: 110 },
      { width: 1434, height: 500 }
    );

    assertClose(viewport.width / 1434, viewport.height / 500);
    assertClose(viewport.x + viewport.width / 2, 105);
    assertClose(viewport.y + viewport.height / 2, 25);
  });

  it("fits the full requested viewport instead of cropping it after a surface resize", () => {
    const requested = { x: 0, y: 0, width: 170, height: 40 };
    const wide = normalizePlayerViewport(requested, { width: 1434, height: 500 });
    const tall = normalizePlayerViewport(requested, { width: 600, height: 500 });

    assert.ok(wide.width >= requested.width && wide.height >= requested.height);
    assert.ok(tall.width >= requested.width && tall.height >= requested.height);
    assertClose(wide.width / 1434, wide.height / 500);
    assertClose(tall.width / 600, tall.height / 500);
  });
});
