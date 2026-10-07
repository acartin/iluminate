import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Partitura, createFrameBuffer, preparePartituraRuntime, renderFrameInto, renderSceneFrame, simulateWs2812bFrame, validatePartitura } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const valid = readFixture("partitura-v2-minimal.json");
const invalidOutput = readFixture("partitura-v2-invalid-output.json");
const invalidReferences = readFixture("partitura-v2-invalid-references.json");

assert(validatePartitura(valid).ok, "minimal fixture should validate");
assert(!validatePartitura(invalidOutput).ok, "invalid output fixture should fail");
assert(
  validatePartitura(invalidOutput).errors.some((issue) => issue.code === "output.invalid"),
  "invalid output fixture should report output.invalid"
);
assert(!validatePartitura(invalidReferences).ok, "invalid references fixture should fail");
assert(
  validatePartitura(invalidReferences).errors.some((issue) => issue.code === "target.missing"),
  "invalid references fixture should report target.missing"
);

const frame = renderSceneFrame(valid, "normal", 1000);
assert(frame.pixels.length > 0, "rendered frame should contain pixels");
assert(
  frame.pixels.some((pixel) => pixel.color.r > 0 || pixel.color.g > 0 || pixel.color.b > 0),
  "rendered frame should contain non-black pixels"
);

const chase = structuredClone(valid);
chase.scenes[0].tracks[0].clips[0] = {
  ...chase.scenes[0].tracks[0].clips[0],
  effect: "chase",
  startMs: 0,
  durationMs: 1000,
  params: { color: "#FFFFFF", backgroundColor: "#123456", width: 1, cycles: 1, direction: "forward" }
};
const chaseFrame = renderSceneFrame(chase, "normal", 0);
assert(
  chaseFrame.pixels.some((pixel) => pixel.color.r === 0x12 && pixel.color.g === 0x34 && pixel.color.b === 0x56),
  "linear effect background color should reach inactive pixels unchanged"
);

const wsFrame = simulateWs2812bFrame(valid, "normal", 1000);
assert(wsFrame.outputs.length === 3, "WS2812B simulator should produce all three declared logical outputs");
assert(wsFrame.outputs[0].pixels.length === 3, "output 1 should include all pixels");
assert(wsFrame.outputs[0].pixels[0].grb.length === 3, "WS2812B pixels should expose GRB transport order");
assert(wsFrame.estimatedMaxRefreshRateFps > 0, "WS2812B simulator should estimate refresh rate");

const runtime = preparePartituraRuntime(valid);
const reusable = createFrameBuffer(runtime);
const firstResult = renderFrameInto(runtime, "normal", 250, reusable);
const firstBuffer = firstResult.colors;
const secondResult = renderFrameInto(runtime, "normal", 500, reusable);
const secondBuffer = secondResult.colors;
assert(firstBuffer === reusable && secondBuffer === reusable, "compiled runtime must reuse the caller-owned RGB buffer");
assert(firstResult === secondResult, "compiled runtime must reuse its frame result object");
assert(secondBuffer.length === valid.pixelMap.length * 3, "compiled runtime must emit exactly three bytes per pixel");

const stressStartedAt = performance.now();
for (let frameIndex = 0; frameIndex < 10_000; frameIndex += 1) {
  const stressResult = renderFrameInto(runtime, "normal", frameIndex, reusable);
  assert(stressResult === firstResult && stressResult.colors === reusable, "stress playback must keep stable frame and buffer identities");
}
const stressElapsedMs = performance.now() - stressStartedAt;
assert(stressElapsedMs < 5_000, `10,000-frame core stress loop exceeded 5 seconds (${Math.round(stressElapsedMs)} ms)`);

console.log(`lighting-core fixtures validated; 10,000-frame stress=${Math.round(stressElapsedMs)}ms`);

function readFixture(name: string): Partitura {
  return JSON.parse(readFileSync(join(root, "fixtures", name), "utf8")) as Partitura;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
