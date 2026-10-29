import { DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS, designerGroupLightTargetId, designerOpticalModeSide, type DesignerCompileIssue, type DesignerCompileIssueTarget, type DesignerForm, type DesignerLightingSide, type DesignerPoint, type DesignerRouteForm, type PartituraDocument } from "@/lib/lighting/partitura-model";
import { channelCenterPolyline, channelIsClosed, channelWidthCm, pointInsideDesignerShape, pointNearShapeStroke, validateDesignerGeometryTopology } from "./geometry/designer-geometry-engine";
import { controllerPortPoint, sameRouteSurface, sameTerminalPoint, sampleRouteLedDots } from "./electrical/designer-electrical-engine";
import { compiledStringIdsForSource, designerCompileSignature } from "./designer-compile-metadata";

export { compiledStringIdsForSource, designerCompileSignature } from "./designer-compile-metadata";

export type CompiledDesignerLayout = {
  outputs: Array<{ id: string; name: string; output: 1 | 2 | 3; pixelCount: number }>;
  pixelMap: Array<{ id: string; output: 1 | 2 | 3; serialIndex: number; stringId: string; routeOffsetCm: number; x: number; y: number; tangentDeg: number }>;
  zones: Array<{ id: string; name: string; pixelIds: string[] }>;
  groups: Array<{ id: string; name: string; members: Array<{ type: "zone" | "group"; id: string }> }>;
  validation: { errors: string[]; warnings: string[]; issues?: DesignerCompileIssue[] };
};

// Pixel centers are the physical source of truth. This fixed 0.5 mm allowance
// only absorbs drawing/boundary imprecision; LED pitch must never enlarge a
// pixel's targeting footprint.
const PIXEL_MEMBERSHIP_TOLERANCE_CM = 0.05;
const CHANNEL_LED_MIN_COVERAGE = 0.9;
const LED_FOOTPRINT_SAMPLE_GRID = 10;
type ReportCompileIssue = (severity: DesignerCompileIssue["severity"], code: string, message: string, targets?: DesignerCompileIssueTarget[]) => void;

/** Compiles the authored physical graph and geometric targets. No logical segments exist. */
export function compileDesignerLayout(designer: DesignerForm): CompiledDesignerLayout {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: DesignerCompileIssue[] = [];
  const reportIssue: ReportCompileIssue = (severity, code, message, targets = []) => {
    (severity === "error" ? errors : warnings).push(message);
    issues.push({ id: `${severity}:${code}:${issues.length}`, severity, message, targets });
  };
  const pixelMap: CompiledDesignerLayout["pixelMap"] = [];
  const serialStarts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const ordered = orderedRoutesByOutput(designer, reportIssue);

  designer.zones.filter((zone) => zone.shape === "polygon").forEach((zone) => {
    const issues = validateDesignerGeometryTopology({
      id: zone.geometryId ?? zone.id,
      kind: "path",
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      points: zone.points,
      contours: zone.contours,
      pathMode: zone.pathMode,
      closed: true,
      fillRule: zone.fillRule
    });
    issues.forEach((issue) => reportIssue("error", `zone-topology:${zone.id}`, `${zone.name}: invalid closed profile (${issue.replaceAll("-", " ")}).`, [{ type: "zone", id: zone.id, label: zone.name }]));
  });

  ordered.forEach(({ output, route }) => {
    if (route.kind !== "led_string") return;
    const dots = sampleRouteLedDots(route, designer.addressablePixelsPerMeter, designer.addressablePixelsPerMeter);
    if (!dots.length) {
      reportIssue("warning", `short-string:${route.id}`, `${route.name} is shorter than one addressable pixel.`, [{ type: "route", id: route.id, label: route.name }]);
      return;
    }
    dots.forEach((dot, routePixelIndex) => {
      const serialIndex = serialStarts[output]++;
      pixelMap.push({ id: `px_${output}_${serialIndex}`, output, serialIndex, stringId: route.id, routeOffsetCm: routePixelIndex * 100 / designer.addressablePixelsPerMeter, x: dot.x, y: dot.y, tangentDeg: dot.angle });
    });
  });

  const routedLedStringIds = new Set(ordered.filter((entry) => entry.route.kind === "led_string").map((entry) => entry.route.id));
  const disconnectedLedStrings = designer.routes.filter((route) => route.kind === "led_string" && !routedLedStringIds.has(route.id));
  if (disconnectedLedStrings.length) {
    reportIssue("warning", "disconnected-strings", `${disconnectedLedStrings.length} LED string${disconnectedLedStrings.length === 1 ? " is" : "s are"} not connected to a controller output and will be ignored: ${disconnectedLedStrings.map((route) => route.name).join(", ")}.`, disconnectedLedStrings.map((route) => ({ type: "route", id: route.id, label: route.name })));
  }
  if (!pixelMap.length) {
    reportIssue("error", "no-mapped-pixels", "No mapped pixels were generated. Connect at least one LED string to a controller output through soldered Data cables.", [{ type: "controller", id: designer.controller.id, label: "Controller" }]);
  }

  const zones = designer.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    pixelIds: pixelMap.filter((pixel) => pixelBelongsToZone(zone, { x: pixel.x, y: pixel.y })).map((pixel) => pixel.id)
  }));
  const channelZones = designer.channels.map((channel) => {
    const sampledCenterline = channelCenterPolyline(channel);
    const centerline = channelIsClosed(channel) && sampledCenterline.length >= 3
      ? [...sampledCenterline, sampledCenterline[0]]
      : sampledCenterline;
    const radiusCm = channelWidthCm(channel) / 2 + PIXEL_MEMBERSHIP_TOLERANCE_CM;
    return {
      id: channel.id,
      name: channel.name,
      pixelIds: pixelMap.filter((pixel) => ledCoverageInsideChannel(pixel, designer.ledPackageSizeMm, centerline, radiusCm) >= CHANNEL_LED_MIN_COVERAGE).map((pixel) => pixel.id)
    };
  });
  const baseTargets = new Map([...zones, ...channelZones].map((zone) => [zone.id, zone]));
  const pixelsById = new Map(pixelMap.map((pixel) => [pixel.id, pixel]));
  const routesById = new Map(designer.routes.map((route) => [route.id, route]));
  const sourceZones = designer.lightSources.map((source) => {
    const expectedSurface = source.mode === "front" ? "front" : "rear";
    const base = baseTargets.get(source.targetId);
    return {
      id: source.id,
      name: source.name,
      pixelIds: (base?.pixelIds ?? []).filter((pixelId) => {
        const pixel = pixelsById.get(pixelId);
        const route = pixel ? routesById.get(pixel.stringId) : null;
        const diffuserMatches = route?.diffuserMapping?.mode !== "restricted"
          || route.diffuserMapping.targets.some((target) => target.type === source.targetType && target.id === source.targetId);
        return Boolean(route && (route.designSurface === "front" ? "front" : "rear") === expectedSurface && diffuserMatches);
      })
    };
  });
  const enabledSourcesById = new Map(designer.lightSources.filter((source) => source.enabled).map((source) => [source.id, source]));
  const sourcesByPixel = new Map<string, DesignerForm["lightSources"]>();
  sourceZones.forEach((sourceZone) => {
    const source = enabledSourcesById.get(sourceZone.id);
    if (!source) return;
    sourceZone.pixelIds.forEach((pixelId) => sourcesByPixel.set(pixelId, [...(sourcesByPixel.get(pixelId) ?? []), source]));
  });
  const overlaps = new Map<string, { route: DesignerRouteForm | null; sources: DesignerForm["lightSources"]; pixelCount: number }>();
  sourcesByPixel.forEach((sources, pixelId) => {
    if (sources.length <= 1) return;
    const pixel = pixelsById.get(pixelId);
    const route = pixel ? routesById.get(pixel.stringId) : null;
    const key = `${route?.id ?? "missing"}:${sources.map((source) => source.id).sort().join("|")}`;
    const current = overlaps.get(key);
    overlaps.set(key, { route: route ?? null, sources, pixelCount: (current?.pixelCount ?? 0) + 1 });
  });
  overlaps.forEach(({ route, sources, pixelCount }, overlapKey) => {
    const sourceTargets = sources.flatMap((source): DesignerCompileIssueTarget[] => {
      const owner = source.targetType === "zone"
        ? designer.zones.find((zone) => zone.id === source.targetId)
        : designer.channels.find((channel) => channel.id === source.targetId);
      return owner ? [{ type: source.targetType, id: owner.id, label: source.name, action: "lighting_setup" }] : [];
    });
    reportIssue("warning", `shared-pixels:${overlapKey}`, `${route?.name ?? "LED string"} has ${pixelCount} physical pixel${pixelCount === 1 ? "" : "s"} mapped to multiple Lighting Setups (${sources.map((source) => source.name).join(", ")}).`, [
      ...(route ? [{ type: "route" as const, id: route.id, label: route.name }] : []),
      ...sourceTargets
    ]);
  });
  const allZones = [...zones, ...channelZones, ...sourceZones];
  allZones.filter((zone) => !zone.pixelIds.length).forEach((zone) => {
    const nativeZone = designer.zones.find((entry) => entry.id === zone.id);
    const channel = designer.channels.find((entry) => entry.id === zone.id);
    const source = designer.lightSources.find((entry) => entry.id === zone.id);
    const sourceOwner = source?.targetType === "zone"
      ? designer.zones.find((entry) => entry.id === source.targetId)
      : source ? designer.channels.find((entry) => entry.id === source.targetId) : null;
    const target: DesignerCompileIssueTarget | undefined = nativeZone
      ? { type: "zone", id: nativeZone.id, label: nativeZone.name }
      : channel
        ? { type: "channel", id: channel.id, label: channel.name }
        : source && sourceOwner
          ? { type: source.targetType, id: sourceOwner.id, label: source.name }
          : undefined;
    reportIssue("warning", `empty-target:${zone.id}`, `${zone.name} contains no mapped pixels.`, target ? [target] : []);
  });
  const globalLightSourceGroups = DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.flatMap((target) => {
    const members = designer.lightSources
      .filter((source) => source.enabled && source.mode === target.mode && (sourceZones.find((zone) => zone.id === source.id)?.pixelIds.length ?? 0) > 0)
      .map((source) => ({ type: "zone" as const, id: source.id }));
    return members.length ? [{ id: target.id, name: target.name, members }] : [];
  });
  const sidedEffectTargetGroups = compileSidedEffectTargetGroups(designer, sourceZones);
  const authoredGroups: CompiledDesignerLayout["groups"] = designer.groups.map((group) => ({
    ...group,
    members: group.members.map((member): { type: "zone" | "group"; id: string } => member.type === "group"
      ? { type: "group", id: member.id }
      : { type: "zone", id: member.id })
  }));
  const groups = [...authoredGroups, ...sidedEffectTargetGroups, ...globalLightSourceGroups];
  if (allZones.length) groups.push({ id: "full_sign", name: "Full sign", members: allZones.map((zone) => ({ type: "zone" as const, id: zone.id })) });
  validateGroups(designer, groups, reportIssue);
  const outputs: CompiledDesignerLayout["outputs"] = ([1, 2, 3] as const).map((output) => ({ id: `output_${output}`, name: `Output ${output}`, output, pixelCount: serialStarts[output] }));
  return { outputs, pixelMap, zones: allZones, groups, validation: { errors, warnings, issues } };
}

function compileSidedEffectTargetGroups(designer: DesignerForm, sourceZones: CompiledDesignerLayout["zones"]) {
  const mappedSourceIds = new Set(sourceZones.filter((zone) => zone.pixelIds.length > 0).map((zone) => zone.id));
  const groupById = new Map(designer.groups.map((group) => [group.id, group]));
  const memo = new Map<string, boolean>();

  function hasMappedSource(groupId: string, side: DesignerLightingSide, trail: string[] = []): boolean {
    const key = `${side}:${groupId}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (trail.includes(groupId)) return false;
    const group = groupById.get(groupId);
    if (!group) return false;
    const found = group.members.some((member) => member.type !== "group"
      ? designer.lightSources.some((source) => source.enabled
        && source.targetType === member.type
        && source.targetId === member.id
        && designerOpticalModeSide(source.mode) === side
        && mappedSourceIds.has(source.id))
      : hasMappedSource(member.id, side, [...trail, groupId]));
    memo.set(key, found);
    return found;
  }

  return designer.groups.flatMap((group) => (["front", "rear"] as const).flatMap((side) => {
    if (!hasMappedSource(group.id, side)) return [];
    const members = group.members.flatMap((member): Array<{ type: "zone" | "group"; id: string }> => {
      if (member.type === "group") {
        return hasMappedSource(member.id, side) ? [{ type: "group", id: designerGroupLightTargetId(member.id, side) }] : [];
      }
      return designer.lightSources
        .filter((source) => source.enabled
          && source.targetType === member.type
          && source.targetId === member.id
          && designerOpticalModeSide(source.mode) === side
          && mappedSourceIds.has(source.id))
        .map((source) => ({ type: "zone" as const, id: source.id }));
    });
    return [{
      id: designerGroupLightTargetId(group.id, side),
      name: `${group.name} · ${side === "front" ? "Front" : "Rear"}`,
      members
    }];
  }));
}

function validateGroups(
  designer: DesignerForm,
  groups: CompiledDesignerLayout["groups"],
  reportIssue: ReportCompileIssue
) {
  const zoneIds = new Set([...designer.zones.map((zone) => zone.id), ...designer.channels.map((channel) => channel.id), ...designer.lightSources.map((source) => source.id)]);
  const groupIds = new Set(groups.map((group) => group.id));
  const membersById = new Map(groups.map((group) => [group.id, group.members]));

  groups.forEach((group) => {
    const seen = new Set<string>();
    group.members.forEach((member) => {
      const known = member.type === "zone" ? zoneIds.has(member.id) : groupIds.has(member.id);
      if (!known) {
        reportIssue("error", `missing-group-member:${group.id}:${member.id}`, `${group.name}: member ${member.id} does not exist.`);
        return;
      }
      const key = `${member.type}:${member.id}`;
      if (seen.has(key)) reportIssue("warning", `duplicate-group-member:${group.id}:${member.id}`, `${group.name}: member ${member.id} is listed more than once.`);
      seen.add(key);
    });
  });

  const state = new Map<string, "visiting" | "done">();
  function visit(groupId: string, path: string[]) {
    if (state.get(groupId) === "done") return;
    if (state.get(groupId) === "visiting") {
      reportIssue("error", `group-cycle:${groupId}`, `Group cycle detected: ${[...path, groupId].join(" -> ")}.`);
      return;
    }
    state.set(groupId, "visiting");
    (membersById.get(groupId) ?? [])
      .filter((member) => member.type === "group" && groupIds.has(member.id))
      .forEach((member) => visit(member.id, [...path, groupId]));
    state.set(groupId, "done");
  }
  groups.forEach((group) => visit(group.id, []));
}

function pixelBelongsToZone(zone: DesignerForm["zones"][number], point: DesignerPoint) {
  return pointInsideDesignerShape(zone, point)
    || pointNearShapeStroke(zone, point, PIXEL_MEMBERSHIP_TOLERANCE_CM);
}

function ledCoverageInsideChannel(
  pixel: CompiledDesignerLayout["pixelMap"][number],
  packageSizeMm: number,
  centerline: DesignerPoint[],
  channelRadiusCm: number
) {
  if (centerline.length < 2) return 0;
  const sideCm = Math.max(0.01, packageSizeMm / 10);
  const angle = pixel.tangentDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sampleCount = LED_FOOTPRINT_SAMPLE_GRID * LED_FOOTPRINT_SAMPLE_GRID;
  let inside = 0;

  for (let row = 0; row < LED_FOOTPRINT_SAMPLE_GRID; row += 1) {
    const localY = ((row + 0.5) / LED_FOOTPRINT_SAMPLE_GRID - 0.5) * sideCm;
    for (let column = 0; column < LED_FOOTPRINT_SAMPLE_GRID; column += 1) {
      const localX = ((column + 0.5) / LED_FOOTPRINT_SAMPLE_GRID - 0.5) * sideCm;
      const point = {
        x: pixel.x + localX * cos - localY * sin,
        y: pixel.y + localX * sin + localY * cos
      };
      if (distanceToPolyline(point, centerline) <= channelRadiusCm) inside += 1;
    }
  }
  return inside / sampleCount;
}

function distanceToPolyline(point: DesignerPoint, points: DesignerPoint[]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
      : 0;
    nearest = Math.min(nearest, Math.hypot(point.x - (start.x + dx * projection), point.y - (start.y + dy * projection)));
  }
  return nearest;
}

/** Retained only as a temporary compile command return shape for the Designer UI. */
export function buildDocumentFromDesigner(document: PartituraDocument): PartituraDocument {
  if (!document.designer) return document;
  const compiledLayout = compileDesignerLayout(document.designer);
  const designer = {
    ...document.designer,
    lightSources: document.designer.lightSources.map((source) => ({
      ...source,
      stringIds: compiledStringIdsForSource(compiledLayout, source.id)
    }))
  };
  return {
    ...document,
    designer,
    compiledDesignerSignature: designerCompileSignature(designer),
    compiledLayout
  };
}

function orderedRoutesByOutput(designer: DesignerForm, reportIssue: ReportCompileIssue): Array<{ output: 1 | 2 | 3; route: DesignerRouteForm }> {
  const result: Array<{ output: 1 | 2 | 3; route: DesignerRouteForm }> = [];
  const visited = new Set<string>();
  let rootedOutputs = 0;
  for (let portIndex = 0; portIndex < designer.controller.dataOutputs; portIndex += 1) {
    const output = (portIndex + 1) as 1 | 2 | 3;
    const port = controllerPortPoint(designer.controller, portIndex, designer.snapCm);
    const roots = designer.routes.filter((route) => route.kind === "data_cable" && terminalMatches(route.points[0], port));
    if (roots.length > 1) reportIssue("error", `multiple-output-starts:${output}`, `Output ${output} has multiple Data cable starts.`, roots.map((route) => ({ type: "route", id: route.id, label: route.name })));
    if (roots.length) rootedOutputs += 1;
    roots.forEach((route) => walk(route, output));
  }
  if (!rootedOutputs && designer.routes.some((route) => route.kind === "led_string")) {
    reportIssue("error", "controller-disconnected", "No controller output has a soldered Data cable. Move a green cable start exactly onto a red controller output terminal until it snaps/solders.", [{ type: "controller", id: designer.controller.id, label: "Controller" }]);
  }
  return result;

  function walk(route: DesignerRouteForm, output: 1 | 2 | 3) {
    if (visited.has(route.id)) return;
    visited.add(route.id);
    result.push({ output, route });
    const end = route.points.at(-1);
    if (!end?.joint) return;
    const next = designer.routes.filter((candidate) => candidate.id !== route.id && !visited.has(candidate.id) && sameRouteSurface(route, candidate) && terminalMatches(candidate.points[0], end));
    if (next.length > 1) reportIssue("error", `route-branch:${route.id}`, `${route.name} branches into ${next.length} routes; an output must be serial.`, [route, ...next].map((entry) => ({ type: "route", id: entry.id, label: entry.name })));
    next.sort((left, right) => left.id.localeCompare(right.id)).forEach((candidate) => walk(candidate, output));
  }
}

function terminalMatches(left: DesignerPoint | undefined, right: DesignerPoint | undefined) {
  return Boolean(left?.joint && right) && sameTerminalPoint(left!, right!);
}
