import { DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS, type DesignerForm, type DesignerPoint, type DesignerRouteForm, type PartituraDocument } from "@/lib/lighting/partitura-model";
import { channelContainsPoint, channelWidthCm, pointInsideDesignerShape, pointNearShapeStroke, validateDesignerGeometryTopology } from "./geometry/designer-geometry-engine";
import { controllerPortPoint, sameTerminalPoint, sampleRouteLedDots } from "./electrical/designer-electrical-engine";

export type CompiledDesignerLayout = {
  outputs: Array<{ id: string; name: string; output: 1 | 2 | 3; pixelCount: number }>;
  pixelMap: Array<{ id: string; output: 1 | 2 | 3; serialIndex: number; stringId: string; routeOffsetCm: number; x: number; y: number; tangentDeg: number }>;
  zones: Array<{ id: string; name: string; pixelIds: string[] }>;
  groups: Array<{ id: string; name: string; members: Array<{ type: "zone" | "group"; id: string }> }>;
  validation: { errors: string[]; warnings: string[] };
};

/** Stable signature of the authored data that changes electrical or targeting semantics. */
export function designerCompileSignature(designer: DesignerForm) {
  return JSON.stringify({
    controller: designer.controller,
    routes: designer.routes.map(({ id, name, kind, points }) => ({ id, name, kind, points })),
    zones: designer.zones.map(({ id, name, shape, x, y, width, height, points, contours, pathMode, fillRule }) => ({ id, name, shape, x, y, width, height, points, contours, pathMode, fillRule })),
    channels: designer.channels.map(({ id, name, points, pathMode, widthMm, closed, cap }) => ({ id, name, points, pathMode, widthMm, closed, cap })),
    lightSources: designer.lightSources.map(({ id, name, targetType, targetId, stringIds, mode, enabled }) => ({ id, name, targetType, targetId, stringIds, mode, enabled })),
    groups: designer.groups,
    addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
    snapCm: designer.snapCm
  });
}

/** Compiles the authored physical graph and geometric targets. No logical segments exist. */
export function compileDesignerLayout(designer: DesignerForm): CompiledDesignerLayout {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pixelMap: CompiledDesignerLayout["pixelMap"] = [];
  const serialStarts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const ordered = orderedRoutesByOutput(designer, errors, warnings);

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
    issues.forEach((issue) => errors.push(`${zone.name}: invalid closed profile (${issue.replaceAll("-", " ")}).`));
  });

  ordered.forEach(({ output, route }) => {
    if (route.kind !== "led_string") return;
    const dots = sampleRouteLedDots(route, designer.addressablePixelsPerMeter, designer.addressablePixelsPerMeter);
    if (!dots.length) {
      warnings.push(`${route.name} is shorter than one addressable pixel.`);
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
    warnings.push(`${disconnectedLedStrings.length} LED string${disconnectedLedStrings.length === 1 ? "" : "s"} are not connected to a controller output and will be ignored: ${disconnectedLedStrings.map((route) => route.name).join(", ")}.`);
  }
  if (!pixelMap.length) {
    errors.push("No mapped pixels were generated. At least one LED string must be connected to a controller output through a soldered data path.");
  }

  const pixelFootprintRadiusCm = Math.max(0.25, Math.min(1.25, 100 / Math.max(1, designer.addressablePixelsPerMeter) * 0.55));
  const zones = designer.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    pixelIds: pixelMap.filter((pixel) => pixelTouchesZone(zone, { x: pixel.x, y: pixel.y }, pixelFootprintRadiusCm)).map((pixel) => pixel.id)
  }));
  const channelZones = designer.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    pixelIds: pixelMap.filter((pixel) => channelContainsPoint(channel, { x: pixel.x, y: pixel.y }, pixelFootprintRadiusCm)).map((pixel) => pixel.id)
  }));
  const baseTargets = new Map([...zones, ...channelZones].map((zone) => [zone.id, zone]));
  const pixelsById = new Map(pixelMap.map((pixel) => [pixel.id, pixel]));
  const sourceZones = designer.lightSources.map((source) => {
    const stringIds = new Set(source.stringIds);
    const base = baseTargets.get(source.targetId);
    return {
      id: source.id,
      name: source.name,
      pixelIds: (base?.pixelIds ?? []).filter((pixelId) => {
        const pixel = pixelsById.get(pixelId);
        return Boolean(pixel && stringIds.has(pixel.stringId));
      })
    };
  });
  const sourcesByString = new Map<string, string[]>();
  designer.lightSources.forEach((source) => source.stringIds.forEach((stringId) => {
    sourcesByString.set(stringId, [...(sourcesByString.get(stringId) ?? []), source.name]);
  }));
  sourcesByString.forEach((sourceNames, stringId) => {
    if (sourceNames.length > 1) warnings.push(`${stringId} is assigned to multiple light sources (${sourceNames.join(", ")}); those sources address the same physical pixels until separate LED strings are assigned.`);
  });
  const allZones = [...zones, ...channelZones, ...sourceZones];
  allZones.filter((zone) => !zone.pixelIds.length).forEach((zone) => warnings.push(`${zone.name} contains no mapped pixels.`));
  designer.channels.forEach((channel) => {
    const halfWidthCm = channelWidthCm(channel) / 2;
    channel.points.forEach((point, index) => {
      const radiusCm = (point.radiusMm ?? 0) / 10;
      if (radiusCm > 0 && radiusCm < halfWidthCm) {
        warnings.push(`${channel.name}: fillet at node ${index + 1} (${point.radiusMm} mm) is smaller than half the channel width (${(halfWidthCm * 10).toFixed(1)} mm); the inner edge may pinch.`);
      }
    });
  });
  const globalLightSourceGroups = DESIGNER_GLOBAL_LIGHT_SOURCE_TARGETS.flatMap((target) => {
    const members = designer.lightSources
      .filter((source) => source.enabled && source.stringIds.length > 0 && source.mode === target.mode)
      .map((source) => ({ type: "zone" as const, id: source.id }));
    return members.length ? [{ id: target.id, name: target.name, members }] : [];
  });
  const groups = [...designer.groups, ...globalLightSourceGroups];
  if (allZones.length) groups.push({ id: "full_sign", name: "Full sign", members: allZones.map((zone) => ({ type: "zone" as const, id: zone.id })) });
  validateGroups(designer, groups, errors, warnings);
  const outputs: CompiledDesignerLayout["outputs"] = ([1, 2, 3] as const).map((output) => ({ id: `output_${output}`, name: `Output ${output}`, output, pixelCount: serialStarts[output] }));
  return { outputs, pixelMap, zones: allZones, groups, validation: { errors, warnings } };
}

function validateGroups(
  designer: DesignerForm,
  groups: CompiledDesignerLayout["groups"],
  errors: string[],
  warnings: string[]
) {
  const zoneIds = new Set([...designer.zones.map((zone) => zone.id), ...designer.channels.map((channel) => channel.id), ...designer.lightSources.map((source) => source.id)]);
  const groupIds = new Set(groups.map((group) => group.id));
  const membersById = new Map(groups.map((group) => [group.id, group.members]));

  groups.forEach((group) => {
    const seen = new Set<string>();
    group.members.forEach((member) => {
      const known = member.type === "zone" ? zoneIds.has(member.id) : groupIds.has(member.id);
      if (!known) {
        errors.push(`${group.name}: member ${member.id} does not exist.`);
        return;
      }
      const key = `${member.type}:${member.id}`;
      if (seen.has(key)) warnings.push(`${group.name}: member ${member.id} is listed more than once.`);
      seen.add(key);
    });
  });

  const state = new Map<string, "visiting" | "done">();
  function visit(groupId: string, path: string[]) {
    if (state.get(groupId) === "done") return;
    if (state.get(groupId) === "visiting") {
      errors.push(`Group cycle detected: ${[...path, groupId].join(" -> ")}.`);
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

function pixelTouchesZone(zone: DesignerForm["zones"][number], point: DesignerPoint, radiusCm: number) {
  if (pointInsideDesignerShape(zone, point)) return true;
  if (pointNearShapeStroke(zone, point, radiusCm)) return true;
  const diagonal = radiusCm * 0.7071;
  const samples = [
    { x: point.x - radiusCm, y: point.y },
    { x: point.x + radiusCm, y: point.y },
    { x: point.x, y: point.y - radiusCm },
    { x: point.x, y: point.y + radiusCm },
    { x: point.x - diagonal, y: point.y - diagonal },
    { x: point.x + diagonal, y: point.y - diagonal },
    { x: point.x + diagonal, y: point.y + diagonal },
    { x: point.x - diagonal, y: point.y + diagonal }
  ];
  return samples.some((sample) => pointInsideDesignerShape(zone, sample));
}

/** Retained only as a temporary compile command return shape for the Designer UI. */
export function buildDocumentFromDesigner(document: PartituraDocument): PartituraDocument {
  if (!document.designer) return document;
  return {
    ...document,
    compiledDesignerSignature: designerCompileSignature(document.designer),
    compiledLayout: compileDesignerLayout(document.designer)
  };
}

function orderedRoutesByOutput(designer: DesignerForm, errors: string[], warnings: string[]): Array<{ output: 1 | 2 | 3; route: DesignerRouteForm }> {
  const result: Array<{ output: 1 | 2 | 3; route: DesignerRouteForm }> = [];
  const visited = new Set<string>();
  let rootedOutputs = 0;
  for (let portIndex = 0; portIndex < designer.controller.dataOutputs; portIndex += 1) {
    const output = (portIndex + 1) as 1 | 2 | 3;
    const port = controllerPortPoint(designer.controller, portIndex, designer.snapCm);
    const roots = designer.routes.filter((route) => route.kind === "data_cable" && terminalMatches(route.points[0], port));
    if (roots.length > 1) errors.push(`Output ${output} has multiple data-cable starts.`);
    if (roots.length) rootedOutputs += 1;
    roots.forEach((route) => walk(route, output));
  }
  if (!rootedOutputs && designer.routes.some((route) => route.kind === "led_string")) {
    errors.push("No controller output has a soldered data cable. Move a green cable start exactly onto a red controller output terminal until it snaps/solders.");
  }
  return result;

  function walk(route: DesignerRouteForm, output: 1 | 2 | 3) {
    if (visited.has(route.id)) return;
    visited.add(route.id);
    result.push({ output, route });
    const end = route.points.at(-1);
    if (!end?.joint) return;
    const next = designer.routes.filter((candidate) => candidate.id !== route.id && !visited.has(candidate.id) && terminalMatches(candidate.points[0], end));
    if (next.length > 1) errors.push(`${route.name} branches into ${next.length} routes; an output must be serial.`);
    next.sort((left, right) => left.id.localeCompare(right.id)).forEach((candidate) => walk(candidate, output));
  }
}

function terminalMatches(left: DesignerPoint | undefined, right: DesignerPoint | undefined) {
  return Boolean(left?.joint && right) && sameTerminalPoint(left!, right!);
}
