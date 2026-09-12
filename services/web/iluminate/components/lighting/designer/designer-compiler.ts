import type { DesignerForm, DesignerPoint, DesignerRouteForm, PartituraDocument } from "@/lib/lighting/partitura-model";
import { controllerPortPoint, pointInsideDesignerShape, sameSnapPoint, sampleRouteLedDots } from "./designer-geometry";

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
    routes: designer.routes,
    zones: designer.zones,
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

  designer.routes.filter((route) => route.kind === "led_string" && !ordered.some((entry) => entry.route.id === route.id)).forEach((route) => {
    warnings.push(`${route.name} has no valid controller signal path and is excluded.`);
  });

  const zones = designer.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    pixelIds: pixelMap.filter((pixel) => pointInsideDesignerShape(zone, { x: pixel.x, y: pixel.y })).map((pixel) => pixel.id)
  }));
  zones.filter((zone) => !zone.pixelIds.length).forEach((zone) => warnings.push(`${zone.name} contains no mapped pixels.`));
  const groups = [...designer.groups];
  if (zones.length) groups.push({ id: "full_sign", name: "Full sign", members: zones.map((zone) => ({ type: "zone" as const, id: zone.id })) });
  const outputs: CompiledDesignerLayout["outputs"] = ([1, 2, 3] as const).map((output) => ({ id: `output_${output}`, name: `Output ${output}`, output, pixelCount: serialStarts[output] }));
  return { outputs, pixelMap, zones, groups, validation: { errors, warnings } };
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
  for (let portIndex = 0; portIndex < designer.controller.dataOutputs; portIndex += 1) {
    const output = (portIndex + 1) as 1 | 2 | 3;
    const port = controllerPortPoint(designer.controller, portIndex, designer.snapCm);
    const roots = designer.routes.filter((route) => route.kind === "data_cable" && terminalMatches(route.points[0], port, designer.snapCm));
    if (roots.length > 1) errors.push(`Output ${output} has multiple data-cable starts.`);
    roots.forEach((route) => walk(route, output));
  }
  return result;

  function walk(route: DesignerRouteForm, output: 1 | 2 | 3) {
    if (visited.has(route.id)) return;
    visited.add(route.id);
    result.push({ output, route });
    const end = route.points.at(-1);
    if (!end?.joint) return;
    const next = designer.routes.filter((candidate) => candidate.id !== route.id && !visited.has(candidate.id) && terminalMatches(candidate.points[0], end, designer.snapCm));
    if (next.length > 1) errors.push(`${route.name} branches into ${next.length} routes; an output must be serial.`);
    next.sort((left, right) => left.id.localeCompare(right.id)).forEach((candidate) => walk(candidate, output));
  }
}

function terminalMatches(left: DesignerPoint | undefined, right: DesignerPoint | undefined, snapCm: number) {
  return Boolean(left?.joint && right) && sameSnapPoint(left!, right!, snapCm);
}
