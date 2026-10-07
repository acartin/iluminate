import assert from "node:assert/strict";
import test from "node:test";
import { DOMAINS, GROUPS, PRESETS, PROTECTED_SURFACES } from "./catalog.mjs";
import { createPrompt, summarizeSelection } from "./prompt-engine.mjs";

const allProtected = PROTECTED_SURFACES.map((surface) => surface.id);

test("player contract points to runtime paths and protects unrelated surfaces", () => {
  const prompt = createPrompt({
    objective: "Corrige los efectos que no aparecen en el player.",
    mode: "diagnose_implement",
    allowedDomainIds: ["player_runtime"],
    protectedSurfaceIds: allProtected
  });
  assert.match(prompt, /Player, Worker y frames/);
  assert.match(prompt, /services\/lighting-core\/player\/scene-player\.ts/);
  assert.match(prompt, /\.agent\/EFFECT_TARGETING_MODEL\.md/);
  assert.match(prompt, /No muevas, añadas, elimines ni renombres botones/);
  assert.match(prompt, /No cambies identificadores, parámetros, targets/);
  assert.match(prompt, /No amplíes el alcance sin autorización expresa/);
});

test("review mode explicitly forbids changes", () => {
  const prompt = createPrompt({
    objective: "Revisa la timeline.",
    mode: "review",
    allowedDomainIds: ["timeline_clips"],
    protectedSurfaceIds: allProtected
  });
  assert.match(prompt, /No modifiques archivos/);
});

test("unprotected surface is omitted from explicit guardrails", () => {
  const protectedIds = allProtected.filter((id) => id !== "ui_layout");
  const prompt = createPrompt({
    objective: "Mueve un control autorizado.",
    mode: "implement",
    allowedDomainIds: ["designer_layout"],
    protectedSurfaceIds: protectedIds
  });
  assert.doesNotMatch(prompt, /No muevas, añadas, elimines ni renombres botones/);
  assert.match(prompt, /Studio, barras y Layers/);
});

test("selection summary deduplicates shared paths and context", () => {
  const summary = summarizeSelection(["player_runtime", "optical_renderer"]);
  assert.equal(summary.domains, 2);
  assert.ok(summary.paths >= 5);
  assert.ok(summary.contexts >= 2);
});

test("scene sharing preset opens its cross-service surfaces and routes complete context", () => {
  const preset = PRESETS.find((entry) => entry.id === "sharing");
  const domain = DOMAINS.find((entry) => entry.id === "scene_sharing");
  assert.ok(preset);
  assert.ok(domain);
  assert.deepEqual(preset.domains, ["scene_sharing"]);
  ["api_contract", "database", "infrastructure", "public_experience"].forEach((id) => {
    assert.ok(preset.unprotect.includes(id), "sharing preset must open " + id);
  });
  [
    "services/render-worker/README.md",
    ".agent/DESIGNER_HANDOFF.md",
    ".agent/PUBLIC_SITE_DIRECTION.md",
    ".agent/EXECUTION_MAP.md"
  ].forEach((path) => assert.ok(domain.context.includes(path), "missing sharing context " + path));
  [
    "services/lighting-core/migrations/2026-10-07_create_scene_rendering_and_shares.sql",
    "services/web/iluminate/app/api/lighting/scene-shares",
    "services/web/iluminate/app/internal/render",
    "compose.yml"
  ].forEach((path) => assert.ok(domain.paths.includes(path), "missing sharing path " + path));
  assert.ok(!domain.context.includes("docs/upgrade.doc"), "historical upgrade plan must not be routine sharing context");

  const prompt = createPrompt({
    objective: "Implementa un cambio autorizado de scene sharing.",
    mode: "implement",
    allowedDomainIds: preset.domains,
    protectedSurfaceIds: allProtected.filter((id) => !preset.unprotect.includes(id))
  });
  assert.match(prompt, /services\/web\/iluminate\/app\/internal\/render/);
  assert.match(prompt, /services\/render-worker\/README\.md/);
  assert.doesNotMatch(prompt, /No cambies endpoints, DTOs/);
  assert.doesNotMatch(prompt, /No cambies PostgreSQL, migraciones/);
  assert.doesNotMatch(prompt, /No cambies Docker, Compose/);
  assert.doesNotMatch(prompt, /No cambies contenido, SEO, rutas/);
});

test("catalog identifiers and preset references are internally valid", () => {
  const domainIds = DOMAINS.map((domain) => domain.id);
  const groupIds = new Set(GROUPS.map((group) => group.id));
  const surfaceIds = new Set(PROTECTED_SURFACES.map((surface) => surface.id));
  assert.equal(new Set(domainIds).size, domainIds.length);
  DOMAINS.forEach((domain) => {
    assert.ok(groupIds.has(domain.group), "unknown group for " + domain.id);
    assert.ok(domain.paths.length > 0, "missing paths for " + domain.id);
    assert.ok(domain.context.length > 0, "missing context for " + domain.id);
    assert.ok(domain.validations.length > 0, "missing validations for " + domain.id);
  });
  PRESETS.forEach((preset) => {
    preset.domains.forEach((id) => assert.ok(domainIds.includes(id), "unknown preset domain " + id));
    preset.unprotect.forEach((id) => assert.ok(surfaceIds.has(id), "unknown preset surface " + id));
  });
});
