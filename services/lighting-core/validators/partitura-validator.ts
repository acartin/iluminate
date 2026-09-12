import { LOGICAL_OUTPUTS, PARTITURA_SCHEMA_VERSION, Partitura, PartituraTarget, SUPPORTED_CORE_VERSION, ValidationIssue, ValidationResult } from "../domain/partituras/types.js";
import { effectCatalog, isSupportedEffect } from "../domain/effects/catalog.js";

const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;

export function validatePartitura(partitura: Partitura): ValidationResult {
  const issues: ValidationIssue[] = [];
  check(partitura.schemaVersion === PARTITURA_SCHEMA_VERSION, issues, "schema.unsupported", "schemaVersion", `schemaVersion must be ${PARTITURA_SCHEMA_VERSION}.`);
  checkId(partitura.projectId, "projectId", issues);
  check(isSemver(partitura.requiredCoreVersion), issues, "coreVersion.invalid", "requiredCoreVersion", "requiredCoreVersion must use MAJOR.MINOR.PATCH format.");
  check(!isVersionGreater(partitura.requiredCoreVersion, SUPPORTED_CORE_VERSION), issues, "coreVersion.unsupported", "requiredCoreVersion", `requiredCoreVersion ${partitura.requiredCoreVersion} is newer than supported core ${SUPPORTED_CORE_VERSION}.`);

  const outputIds = new Set<string>();
  const outputNumbers = new Set<number>();
  const outputsByNumber = new Map<number, Partitura["outputs"][number]>();
  partitura.outputs.forEach((output, index) => {
    const path = `outputs[${index}]`;
    checkUniqueId(output.id, outputIds, `${path}.id`, issues);
    check(LOGICAL_OUTPUTS.includes(output.output), issues, "output.invalid", `${path}.output`, "output must be one of 1, 2 or 3.");
    check(!outputNumbers.has(output.output), issues, "output.duplicate", `${path}.output`, `Only one output may own ${output.output}.`);
    outputNumbers.add(output.output);
    outputsByNumber.set(output.output, output);
    check(Number.isInteger(output.pixelCount) && output.pixelCount >= 0, issues, "output.pixelCount.invalid", `${path}.pixelCount`, "output.pixelCount must be a non-negative integer.");
  });

  check(partitura.pixelMap.length > 0, issues, "pixelMap.empty", "pixelMap", "pixelMap must include physical pixels.");
  const pixelIds = new Set<string>();
  const addresses = new Set<string>();
  const countByOutput = new Map<number, number>();
  partitura.pixelMap.forEach((pixel, index) => {
    const path = `pixelMap[${index}]`;
    checkUniqueId(pixel.id, pixelIds, `${path}.id`, issues);
    const output = outputsByNumber.get(pixel.output);
    check(Boolean(output), issues, "pixelMap.output.missing", `${path}.output`, `Pixel ${pixel.id} references an undeclared output.`);
    check(Number.isInteger(pixel.serialIndex) && pixel.serialIndex >= 0, issues, "pixelMap.serialIndex.invalid", `${path}.serialIndex`, "serialIndex must be a non-negative integer.");
    check(typeof pixel.stringId === "string" && pixel.stringId.length > 0, issues, "pixelMap.string.missing", `${path}.stringId`, "stringId is required.");
    check(Number.isFinite(pixel.routeOffsetCm) && pixel.routeOffsetCm >= 0, issues, "pixelMap.offset.invalid", `${path}.routeOffsetCm`, "routeOffsetCm must be non-negative.");
    check(Number.isFinite(pixel.x) && Number.isFinite(pixel.y), issues, "pixelMap.coordinate.invalid", path, "Pixel coordinates must be finite.");
    check(Number.isFinite(pixel.tangentDeg), issues, "pixelMap.tangent.invalid", `${path}.tangentDeg`, "tangentDeg must be finite.");
    const address = `${pixel.output}:${pixel.serialIndex}`;
    check(!addresses.has(address), issues, "pixelMap.address.duplicate", path, `Pixel address ${address} is duplicated.`);
    addresses.add(address);
    countByOutput.set(pixel.output, (countByOutput.get(pixel.output) ?? 0) + 1);
    if (output) check(pixel.serialIndex < output.pixelCount, issues, "pixelMap.index.out_of_output", `${path}.serialIndex`, `Pixel ${pixel.id} is outside output ${pixel.output}.`);
  });
  partitura.outputs.forEach((output, index) => check((countByOutput.get(output.output) ?? 0) === output.pixelCount, issues, "output.pixelCount.mismatch", `outputs[${index}].pixelCount`, `Output ${output.output} count does not match pixelMap.`));

  const zoneIds = new Set<string>();
  partitura.zones.forEach((zone, index) => {
    const path = `zones[${index}]`;
    checkUniqueId(zone.id, zoneIds, `${path}.id`, issues);
    warn(zone.pixelIds.length > 0, issues, "zone.empty", path, `Zone ${zone.id} selects no pixels.`);
    zone.pixelIds.forEach((pixelId) => check(pixelIds.has(pixelId), issues, "zone.pixel.missing", `${path}.pixelIds`, `Zone ${zone.id} references missing pixel ${pixelId}.`));
  });

  const groupIds = new Set<string>();
  partitura.groups.forEach((group, index) => {
    const path = `groups[${index}]`;
    checkUniqueId(group.id, groupIds, `${path}.id`, issues);
    check(group.members.length > 0, issues, "group.empty", path, `Group ${group.id} has no members.`);
  });
  partitura.groups.forEach((group, index) => group.members.forEach((member) => {
    const exists = member.type === "zone" ? zoneIds.has(member.id) : groupIds.has(member.id);
    check(exists, issues, "group.member.missing", `groups[${index}].members`, `Group ${group.id} references missing ${member.type} ${member.id}.`);
  }));
  validateGroupCycles(partitura, issues);

  const sceneIds = new Set<string>();
  partitura.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`;
    checkUniqueId(scene.id, sceneIds, `${scenePath}.id`, issues);
    check(Number.isInteger(scene.durationMs) && scene.durationMs > 0, issues, "scene.duration.invalid", `${scenePath}.durationMs`, "scene.durationMs must be a positive integer.");
    const trackIds = new Set<string>();
    scene.tracks.forEach((track, trackIndex) => {
      const trackPath = `${scenePath}.tracks[${trackIndex}]`;
      checkUniqueId(track.id, trackIds, `${trackPath}.id`, issues);
      validateTarget(track.target, trackPath, zoneIds, groupIds, issues);
      const clipIds = new Set<string>();
      track.clips.forEach((clip, clipIndex) => {
        const clipPath = `${trackPath}.clips[${clipIndex}]`;
        checkUniqueId(clip.id, clipIds, `${clipPath}.id`, issues);
        check(isSupportedEffect(clip.effect), issues, "clip.effect.unsupported", `${clipPath}.effect`, `Effect ${clip.effect} is not supported by this core.`);
        check(["serial", "local", "global"].includes(clip.coordinateSpace), issues, "clip.coordinateSpace.invalid", `${clipPath}.coordinateSpace`, "coordinateSpace must be serial, local, or global.");
        check(Number.isInteger(clip.startMs) && clip.startMs >= 0, issues, "clip.start.invalid", `${clipPath}.startMs`, "clip.startMs must be non-negative.");
        check(Number.isInteger(clip.durationMs) && clip.durationMs > 0, issues, "clip.duration.invalid", `${clipPath}.durationMs`, "clip.durationMs must be positive.");
        check(clip.startMs + clip.durationMs <= scene.durationMs || scene.loop, issues, "clip.range.out_of_scene", clipPath, `Clip ${clip.id} exceeds scene ${scene.id}.`);
        if (clip.target) validateTarget(clip.target, clipPath, zoneIds, groupIds, issues);
        validateEffectParams(clip.effect, clip.params, clipPath, issues);
      });
    });
  });
  check(sceneIds.has(partitura.defaultScene), issues, "scene.default.missing", "defaultScene", `defaultScene ${partitura.defaultScene} does not exist.`);
  return { ok: !issues.some((issue) => issue.severity === "error"), errors: issues.filter((issue) => issue.severity === "error"), warnings: issues.filter((issue) => issue.severity === "warning") };
}

function validateTarget(target: PartituraTarget, path: string, zoneIds: Set<string>, groupIds: Set<string>, issues: ValidationIssue[]) {
  if (target.type === "installation") return;
  check(target.type === "zone" ? zoneIds.has(target.id) : groupIds.has(target.id), issues, "target.missing", `${path}.target`, `Target ${target.type}:${target.id} does not exist.`);
}

function validateGroupCycles(partitura: Partitura, issues: ValidationIssue[]) {
  const children = new Map(partitura.groups.map((group) => [group.id, group.members.filter((member) => member.type === "group").map((member) => member.id)]));
  const visit = (id: string, trail: string[]) => {
    if (trail.includes(id)) { issues.push({ severity: "error", code: "group.cycle", path: "groups", message: `Group hierarchy contains a cycle: ${[...trail, id].join(" -> ")}.` }); return; }
    (children.get(id) ?? []).forEach((child) => visit(child, [...trail, id]));
  };
  partitura.groups.forEach((group) => visit(group.id, []));
}

function validateEffectParams(effect: string, params: Record<string, unknown>, path: string, issues: ValidationIssue[]) {
  if (!isSupportedEffect(effect)) return;
  for (const [name, parameter] of Object.entries(effectCatalog[effect].parameters)) {
    const value = params[name];
    check(value !== undefined || !parameter.required, issues, "clip.params.required", `${path}.params.${name}`, `Effect ${effect} requires parameter ${name}.`);
    if (value === undefined) continue;
    if (parameter.type === "color") check(typeof value === "string" && colorPattern.test(value), issues, "clip.params.color", `${path}.params.${name}`, `Parameter ${name} must be a #RRGGBB color.`);
    if (["number", "integer", "percent"].includes(parameter.type)) {
      check(typeof value === "number" && Number.isFinite(value), issues, "clip.params.number", `${path}.params.${name}`, `Parameter ${name} must be a finite number.`);
      if (typeof value === "number") {
        if (parameter.type === "integer") check(Number.isInteger(value), issues, "clip.params.integer", `${path}.params.${name}`, `Parameter ${name} must be an integer.`);
        if (parameter.min !== undefined) check(value >= parameter.min, issues, "clip.params.min", `${path}.params.${name}`, `Parameter ${name} must be >= ${parameter.min}.`);
        if (parameter.max !== undefined) check(value <= parameter.max, issues, "clip.params.max", `${path}.params.${name}`, `Parameter ${name} must be <= ${parameter.max}.`);
      }
    }
    if (parameter.type === "boolean") check(typeof value === "boolean", issues, "clip.params.boolean", `${path}.params.${name}`, `Parameter ${name} must be boolean.`);
    if (parameter.type === "string") check(typeof value === "string", issues, "clip.params.string", `${path}.params.${name}`, `Parameter ${name} must be a string.`);
    if (parameter.type === "select") check(typeof value === "string" && Boolean(parameter.options?.some((option) => option.value === value)), issues, "clip.params.select", `${path}.params.${name}`, `Parameter ${name} must be supported.`);
  }
}

function checkUniqueId(id: string, seen: Set<string>, path: string, issues: ValidationIssue[]) { checkId(id, path, issues); check(!seen.has(id), issues, "id.duplicate", path, `Duplicate id ${id}.`); seen.add(id); }
function checkId(id: string, path: string, issues: ValidationIssue[]) { check(typeof id === "string" && idPattern.test(id), issues, "id.invalid", path, "Ids must start with a letter and contain only letters, numbers, underscores or hyphens."); }
function check(condition: boolean, issues: ValidationIssue[], code: string, path: string, message: string) { if (!condition) issues.push({ severity: "error", code, path, message }); }
function warn(condition: boolean, issues: ValidationIssue[], code: string, path: string, message: string) { if (!condition) issues.push({ severity: "warning", code, path, message }); }
function isSemver(value: string) { return /^\d+\.\d+\.\d+$/.test(value); }
function isVersionGreater(left: string, right: string) { if (!isSemver(left) || !isSemver(right)) return false; return left.split(".").map(Number).some((part, index, all) => part !== right.split(".").map(Number)[index] && all.slice(0, index).every((previous, previousIndex) => previous === right.split(".").map(Number)[previousIndex]) && part > right.split(".").map(Number)[index]); }
