import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Partitura, renderSceneFrame, simulateWs2812bFrame, validatePartitura } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const valid = readFixture("partitura-v1-minimal.json");
const invalidOutput = readFixture("partitura-v1-invalid-output.json");
const invalidReferences = readFixture("partitura-v1-invalid-references.json");

assert(validatePartitura(valid).ok, "minimal fixture should validate");
assert(!validatePartitura(invalidOutput).ok, "invalid output fixture should fail");
assert(
  validatePartitura(invalidOutput).errors.some((issue) => issue.code === "chain.output.invalid"),
  "invalid output fixture should report chain.output.invalid"
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

const wsFrame = simulateWs2812bFrame(valid, "normal", 1000);
assert(wsFrame.outputs.length === 3, "WS2812B simulator should produce three logical outputs");
assert(wsFrame.outputs[0].pixels.length === 24, "output 1 should include all pixels");
assert(wsFrame.outputs[0].pixels[0].grb.length === 3, "WS2812B pixels should expose GRB transport order");
assert(wsFrame.estimatedMaxRefreshRateFps > 0, "WS2812B simulator should estimate refresh rate");

console.log("lighting-core fixtures validated");

function readFixture(name: string): Partitura {
  return JSON.parse(readFileSync(join(root, "fixtures", name), "utf8")) as Partitura;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}
