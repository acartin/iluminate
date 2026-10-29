import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateLedStripProfileInput } from "./led-strip-profile-input";

const validValues = {
  profileKey: "ws2812b-5v-60",
  name: "WS2812B 60",
  construction: "discrete",
  nativeControlProtocol: "ws281x",
  colorModel: "rgb",
  voltageV: "5",
  cutMode: "free_cut",
  cutSegmentLengthMm: "16.6667",
  addressablePixelsPerCutSegment: "1",
  physicalLedsPerCutSegment: "1",
  physicalLedsPerAddressablePixel: "1",
  addressablePixelsPerMeter: "60",
  physicalLedsPerMeter: "60",
  pcbWidthMm: "10",
  ratedPowerWPerMeter: "18",
  backupDataLine: "false",
  sourceUrl: "https://example.com/spec.pdf"
};

describe("LED strip profile input", () => {
  it("validates catalog values and keeps discrete products on marked cuts", () => {
    const result = validateLedStripProfileInput(validValues);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.cutMode, "marked_segments");
    assert.equal(result.value.ratedPowerWPerMeter, 18);
    assert.equal(result.value.backupDataLine, false);
  });

  it("rejects invalid keys, non-positive electrical values and unsafe source URLs", () => {
    assert.equal(validateLedStripProfileInput({ ...validValues, profileKey: "Bad key" }).ok, false);
    assert.equal(validateLedStripProfileInput({ ...validValues, voltageV: "0" }).ok, false);
    assert.equal(validateLedStripProfileInput({ ...validValues, sourceUrl: "javascript:alert(1)" }).ok, false);
  });
});
