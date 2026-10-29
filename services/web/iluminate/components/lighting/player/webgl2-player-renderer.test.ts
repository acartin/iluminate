import assert from "node:assert/strict";
import test from "node:test";
import { opticalTreatmentField } from "./gpu/webgl2-player-renderer";

const halo = {
  mode: "halo" as const,
  sourceDistanceCm: 2.8,
  beamAngleDeg: 115,
  spreadCm: 3.2,
  throwCm: 20,
  softnessCm: 0
};

test("halo softness feathers the edge without changing the physical field radius", () => {
  const hard = opticalTreatmentField(halo, 60);
  const soft = opticalTreatmentField({ ...halo, softnessCm: 9.1 }, 60);

  assert.equal(soft.radiusCm, hard.radiusCm);
  assert.equal(hard.softnessRatio, 0);
  assert.ok(soft.softnessRatio > 0);
});

test("halo spread and wall gap still define the physical field radius", () => {
  const baseline = opticalTreatmentField(halo, 60);
  const widerSpread = opticalTreatmentField({ ...halo, spreadCm: 8 }, 60);
  const largerWallGap = opticalTreatmentField({ ...halo, sourceDistanceCm: 6 }, 60);

  assert.ok(widerSpread.radiusCm > baseline.radiusCm);
  assert.ok(largerWallGap.radiusCm > baseline.radiusCm);
});

test("a wider halo field conserves energy instead of burning overlapping areas", () => {
  const compact = opticalTreatmentField({ ...halo, spreadCm: 1 }, 60);
  const wide = opticalTreatmentField({ ...halo, spreadCm: 15.5 }, 60);

  assert.ok(wide.radiusCm > compact.radiusCm);
  assert.ok(wide.energyScale < compact.energyScale);
  assert.ok(Math.abs(wide.radiusCm * wide.energyScale - compact.radiusCm * compact.energyScale) < 0.000001);
});

test("a wider diffused Front beam changes coverage without creating energy", () => {
  const narrow = opticalTreatmentField({ ...halo, mode: "front", sourceDistanceCm: 10, beamAngleDeg: 35 }, 60);
  const wide = opticalTreatmentField({ ...halo, mode: "front", sourceDistanceCm: 10, beamAngleDeg: 115 }, 60);

  assert.ok(wide.radiusCm > narrow.radiusCm);
  assert.ok(wide.energyScale < narrow.energyScale);
  assert.ok(Math.abs(wide.radiusCm * wide.energyScale - narrow.radiusCm * narrow.energyScale) < 0.000001);
});
