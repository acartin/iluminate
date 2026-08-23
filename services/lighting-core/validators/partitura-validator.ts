import {
  LOGICAL_OUTPUTS,
  PARTITURA_SCHEMA_VERSION,
  Partitura,
  PartituraTarget,
  SUPPORTED_CORE_VERSION,
  ValidationIssue,
  ValidationResult
} from "../domain/partituras/types.js";
import { effectCatalog, isSupportedEffect } from "../domain/effects/catalog.js";

const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;

export function validatePartitura(partitura: Partitura): ValidationResult {
  const issues: ValidationIssue[] = [];

  check(partitura.schemaVersion === PARTITURA_SCHEMA_VERSION, issues, {
    code: "schema.unsupported",
    path: "schemaVersion",
    message: `schemaVersion must be ${PARTITURA_SCHEMA_VERSION}.`
  });

  checkId(partitura.projectId, "projectId", issues);
  check(isSemver(partitura.requiredCoreVersion), issues, {
    code: "coreVersion.invalid",
    path: "requiredCoreVersion",
    message: "requiredCoreVersion must use MAJOR.MINOR.PATCH format."
  });
  check(!isVersionGreater(partitura.requiredCoreVersion, SUPPORTED_CORE_VERSION), issues, {
    code: "coreVersion.unsupported",
    path: "requiredCoreVersion",
    message: `requiredCoreVersion ${partitura.requiredCoreVersion} is newer than supported core ${SUPPORTED_CORE_VERSION}.`
  });

  const chainIds = new Set<string>();
  const segmentIds = new Set<string>();
  const zoneIds = new Set<string>();
  const sceneIds = new Set<string>();
  const outputIds = new Set<number>();

  check(partitura.chains.length > 0, issues, {
    code: "chains.empty",
    path: "chains",
    message: "At least one chain is required."
  });

  partitura.chains.forEach((chain, index) => {
    const path = `chains[${index}]`;
    checkUniqueId(chain.id, chainIds, `${path}.id`, issues);
    check(LOGICAL_OUTPUTS.includes(chain.output), issues, {
      code: "chain.output.invalid",
      path: `${path}.output`,
      message: "chain.output must be one of 1, 2 or 3."
    });
    check(!outputIds.has(chain.output), issues, {
      code: "chain.output.duplicate",
      path: `${path}.output`,
      message: `Only one chain can own logical output ${chain.output}.`
    });
    outputIds.add(chain.output);
    check(Number.isInteger(chain.pixelCount) && chain.pixelCount > 0, issues, {
      code: "chain.pixelCount.invalid",
      path: `${path}.pixelCount`,
      message: "chain.pixelCount must be a positive integer."
    });
    check(["forward", "reverse"].includes(chain.direction), issues, {
      code: "chain.direction.invalid",
      path: `${path}.direction`,
      message: "chain.direction must be forward or reverse."
    });
  });

  check(partitura.segments.length > 0, issues, {
    code: "segments.empty",
    path: "segments",
    message: "At least one segment is required."
  });

  partitura.segments.forEach((segment, index) => {
    const path = `segments[${index}]`;
    checkUniqueId(segment.id, segmentIds, `${path}.id`, issues);
    check(chainIds.has(segment.chainId), issues, {
      code: "segment.chain.missing",
      path: `${path}.chainId`,
      message: `Segment ${segment.id} references missing chain ${segment.chainId}.`
    });
    check(Number.isInteger(segment.start) && segment.start >= 0, issues, {
      code: "segment.start.invalid",
      path: `${path}.start`,
      message: "segment.start must be a non-negative integer."
    });
    check(Number.isInteger(segment.length) && segment.length > 0, issues, {
      code: "segment.length.invalid",
      path: `${path}.length`,
      message: "segment.length must be a positive integer."
    });

    const chain = partitura.chains.find((entry) => entry.id === segment.chainId);
    if (chain) {
      check(segment.start + segment.length <= chain.pixelCount, issues, {
        code: "segment.range.out_of_chain",
        path,
        message: `Segment ${segment.id} exceeds chain ${chain.id} pixelCount.`
      });
    }
  });

  validateOverlappingSegments(partitura, issues);

  check(partitura.zones.length > 0, issues, {
    code: "zones.empty",
    path: "zones",
    message: "At least one zone is required."
  });

  partitura.zones.forEach((zone, index) => {
    const path = `zones[${index}]`;
    checkUniqueId(zone.id, zoneIds, `${path}.id`, issues);
    check((zone.segments?.length ?? 0) + (zone.zones?.length ?? 0) > 0, issues, {
      code: "zone.empty",
      path,
      message: `Zone ${zone.id} must include at least one segment or child zone.`
    });
    for (const segmentId of zone.segments ?? []) {
      check(segmentIds.has(segmentId), issues, {
        code: "zone.segment.missing",
        path: `${path}.segments`,
        message: `Zone ${zone.id} references missing segment ${segmentId}.`
      });
    }
  });

  partitura.zones.forEach((zone, index) => {
    const path = `zones[${index}]`;
    for (const childZoneId of zone.zones ?? []) {
      check(zoneIds.has(childZoneId), issues, {
        code: "zone.child.missing",
        path: `${path}.zones`,
        message: `Zone ${zone.id} references missing child zone ${childZoneId}.`
      });
    }
  });
  validateZoneCycles(partitura, issues);

  check(partitura.scenes.length > 0, issues, {
    code: "scenes.empty",
    path: "scenes",
    message: "At least one scene is required."
  });

  partitura.scenes.forEach((scene, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`;
    checkUniqueId(scene.id, sceneIds, `${scenePath}.id`, issues);
    check(Number.isInteger(scene.durationMs) && scene.durationMs > 0, issues, {
      code: "scene.duration.invalid",
      path: `${scenePath}.durationMs`,
      message: "scene.durationMs must be a positive integer."
    });

    const trackIds = new Set<string>();
    scene.tracks.forEach((track, trackIndex) => {
      const trackPath = `${scenePath}.tracks[${trackIndex}]`;
      checkUniqueId(track.id, trackIds, `${trackPath}.id`, issues);
      validateTarget(track.target, trackPath, { chainIds, segmentIds, zoneIds }, issues);

      const clipIds = new Set<string>();
      track.clips.forEach((clip, clipIndex) => {
        const clipPath = `${trackPath}.clips[${clipIndex}]`;
        checkUniqueId(clip.id, clipIds, `${clipPath}.id`, issues);
        check(isSupportedEffect(clip.effect), issues, {
          code: "clip.effect.unsupported",
          path: `${clipPath}.effect`,
          message: `Effect ${clip.effect} is not supported by this core.`
        });
        check(Number.isInteger(clip.startMs) && clip.startMs >= 0, issues, {
          code: "clip.start.invalid",
          path: `${clipPath}.startMs`,
          message: "clip.startMs must be a non-negative integer."
        });
        check(Number.isInteger(clip.durationMs) && clip.durationMs > 0, issues, {
          code: "clip.duration.invalid",
          path: `${clipPath}.durationMs`,
          message: "clip.durationMs must be a positive integer."
        });
        check(clip.startMs + clip.durationMs <= scene.durationMs || scene.loop, issues, {
          code: "clip.range.out_of_scene",
          path: clipPath,
          message: `Clip ${clip.id} exceeds scene ${scene.id} duration.`
        });
        if (clip.target) {
          validateTarget(clip.target, clipPath, { chainIds, segmentIds, zoneIds }, issues);
        }
        validateEffectParams(clip.effect, clip.params, clipPath, issues);
      });
    });
  });

  check(sceneIds.has(partitura.defaultScene), issues, {
    code: "scene.default.missing",
    path: "defaultScene",
    message: `defaultScene ${partitura.defaultScene} does not exist.`
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}

function validateTarget(
  target: PartituraTarget,
  path: string,
  refs: { chainIds: Set<string>; segmentIds: Set<string>; zoneIds: Set<string> },
  issues: ValidationIssue[]
) {
  if (target.type === "installation") return;
  const exists =
    target.type === "chain"
      ? refs.chainIds.has(target.id)
      : target.type === "segment"
        ? refs.segmentIds.has(target.id)
        : refs.zoneIds.has(target.id);
  check(exists, issues, {
    code: "target.missing",
    path: `${path}.target`,
    message: `Target ${target.type}:${target.id} does not exist.`
  });
}

function validateEffectParams(effect: string, params: Record<string, unknown>, path: string, issues: ValidationIssue[]) {
  if (!isSupportedEffect(effect)) return;
  const definition = effectCatalog[effect];

  for (const [name, parameter] of Object.entries(definition.parameters)) {
    const value = params[name];
    check(value !== undefined || !parameter.required, issues, {
      code: "clip.params.required",
      path: `${path}.params.${name}`,
      message: `Effect ${effect} requires parameter ${name}.`
    });
    if (value === undefined) continue;

    if (parameter.type === "color") {
      check(typeof value === "string" && colorPattern.test(value), issues, {
        code: "clip.params.color",
        path: `${path}.params.${name}`,
        message: `Parameter ${name} must be a #RRGGBB color.`
      });
    }
    if (parameter.type === "number") {
      check(typeof value === "number" && Number.isFinite(value), issues, {
        code: "clip.params.number",
        path: `${path}.params.${name}`,
        message: `Parameter ${name} must be a finite number.`
      });
      if (typeof value === "number") {
        check(parameter.min === undefined || value >= parameter.min, issues, {
          code: "clip.params.min",
          path: `${path}.params.${name}`,
          message: `Parameter ${name} must be >= ${parameter.min}.`
        });
        check(parameter.max === undefined || value <= parameter.max, issues, {
          code: "clip.params.max",
          path: `${path}.params.${name}`,
          message: `Parameter ${name} must be <= ${parameter.max}.`
        });
      }
    }
    if (parameter.type === "boolean") {
      check(typeof value === "boolean", issues, {
        code: "clip.params.boolean",
        path: `${path}.params.${name}`,
        message: `Parameter ${name} must be a boolean.`
      });
    }
    if (parameter.type === "string") {
      check(typeof value === "string", issues, {
        code: "clip.params.string",
        path: `${path}.params.${name}`,
        message: `Parameter ${name} must be a string.`
      });
    }
  }
}

function validateOverlappingSegments(partitura: Partitura, issues: ValidationIssue[]) {
  for (const chain of partitura.chains) {
    const segments = partitura.segments
      .filter((segment) => segment.chainId === chain.id)
      .sort((left, right) => left.start - right.start);
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      check(previous.start + previous.length <= current.start, issues, {
        code: "segment.range.overlap",
        path: "segments",
        message: `Segments ${previous.id} and ${current.id} overlap on chain ${chain.id}.`
      });
    }
  }
}

function validateZoneCycles(partitura: Partitura, issues: ValidationIssue[]) {
  const childrenByZone = new Map(partitura.zones.map((zone) => [zone.id, zone.zones ?? []]));

  function visit(zoneId: string, trail: string[]) {
    if (trail.includes(zoneId)) {
      issues.push({
        severity: "error",
        code: "zone.cycle",
        path: "zones",
        message: `Zone hierarchy contains a cycle: ${[...trail, zoneId].join(" -> ")}.`
      });
      return;
    }
    for (const child of childrenByZone.get(zoneId) ?? []) {
      visit(child, [...trail, zoneId]);
    }
  }

  for (const zone of partitura.zones) {
    visit(zone.id, []);
  }
}

function checkUniqueId(id: string, seen: Set<string>, path: string, issues: ValidationIssue[]) {
  checkId(id, path, issues);
  check(!seen.has(id), issues, {
    code: "id.duplicate",
    path,
    message: `Duplicate id ${id}.`
  });
  seen.add(id);
}

function checkId(id: string, path: string, issues: ValidationIssue[]) {
  check(typeof id === "string" && idPattern.test(id), issues, {
    code: "id.invalid",
    path,
    message: "Ids must start with a letter and contain only letters, numbers, underscores or hyphens."
  });
}

function check(condition: boolean, issues: ValidationIssue[], issue: Omit<ValidationIssue, "severity">) {
  if (!condition) {
    issues.push({ severity: "error", ...issue });
  }
}

function isSemver(value: string) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function isVersionGreater(left: string, right: string) {
  if (!isSemver(left) || !isSemver(right)) return false;
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return true;
    if (leftParts[index] < rightParts[index]) return false;
  }
  return false;
}
