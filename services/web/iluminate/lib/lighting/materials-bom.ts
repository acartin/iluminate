import type { DesignerForm, DesignerRouteForm, PartituraDocument } from "@/lib/lighting/partitura-model";
import { sampleRouteLedDots } from "@/lib/lighting/led-route-sampling";
import { resolveRouteOutputs } from "@/components/lighting/designer/designer-geometry";

export type LedStringBomRow = {
  id: string;
  name: string;
  lengthM: number;
  ledCount?: number;
  assignment: string;
  output?: number;
  voltageV: number;
  powerW?: number;
  currentA?: number;
};

export type LedStringBomGroup = {
  output?: number;
  label: string;
  rows: LedStringBomRow[];
  totalLengthM: number;
  totalLedCount?: number;
  totalPowerW?: number;
  minimumCurrentA?: number;
  recommendedCurrentA?: number;
};

export type LedStringBom = {
  stripName: string;
  voltageV: number;
  ratedCurrentMaPerLed?: number;
  ratedPowerWPerMeter?: number;
  rows: LedStringBomRow[];
  groups: LedStringBomGroup[];
  totalLengthM: number;
  totalLedCount?: number;
  totalPowerW?: number;
  minimumCurrentA?: number;
  recommendedCurrentA?: number;
};

function routeLengthM(route: DesignerRouteForm) {
  return route.points.slice(1).reduce((total, point, index) => {
    const previous = route.points[index];
    return total + Math.hypot(point.x - previous.x, point.y - previous.y) / 100;
  }, 0);
}

function routeAssignment(route: DesignerRouteForm, designer: DesignerForm) {
  if (!route.diffuserMapping || route.diffuserMapping.mode === "auto") return "Auto";
  const labels = route.diffuserMapping.targets.map((target) => {
    const collection = target.type === "zone" ? designer.zones : designer.channels;
    const item = collection.find((candidate) => candidate.id === target.id);
    return item ? `${target.type === "zone" ? "Zone" : "Channel"}: ${item.name}` : `${target.type}: ${target.id}`;
  });
  return labels.length ? labels.join(", ") : "None";
}

export function buildLedStringBom(document: PartituraDocument): LedStringBom {
  const designer = document.designer;
  if (!designer) {
    return { stripName: "LED strip not configured", voltageV: 0, rows: [], groups: [], totalLengthM: 0 };
  }
  const strip = designer.stripConfiguration;
  const voltageV = strip?.voltageV ?? 0;
  const ratedPowerWPerMeter = strip?.ratedPowerWPerMeter;
  const ratedCurrentMaPerLed = strip?.ratedCurrentMaPerLed
    ?? (ratedPowerWPerMeter !== undefined && voltageV > 0 && designer.ledsPerMeter > 0
      ? ratedPowerWPerMeter / voltageV / designer.ledsPerMeter * 1000
      : undefined);
  const showsIndividualLeds = strip?.construction !== "continuous";
  const routeOutputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const routesById = new Map(designer.routes.map((route) => [route.id, route]));
  const orderedStringIds = Array.from(routeOutputs.keys()).filter((id) => routesById.get(id)?.kind === "led_string");
  const disconnectedStringIds = designer.routes.filter((route) => route.kind === "led_string" && !routeOutputs.has(route.id)).map((route) => route.id);
  const rows = [...orderedStringIds, ...disconnectedStringIds].map((routeId): LedStringBomRow => {
    const route = routesById.get(routeId)!;
    const ledCount = showsIndividualLeds
      ? sampleRouteLedDots(route, designer.ledsPerMeter, designer.addressablePixelsPerMeter).length
      : undefined;
    const lengthM = ledCount === undefined ? routeLengthM(route) : ledCount / Math.max(0.1, designer.ledsPerMeter);
    const currentA = ledCount !== undefined && ratedCurrentMaPerLed !== undefined
      ? ledCount * ratedCurrentMaPerLed / 1000
      : ratedPowerWPerMeter !== undefined && voltageV > 0 ? lengthM * ratedPowerWPerMeter / voltageV : undefined;
    const powerW = currentA === undefined || voltageV <= 0 ? undefined : currentA * voltageV;
    return {
      id: route.id,
      name: route.name,
      lengthM,
      ...(ledCount === undefined ? {} : { ledCount }),
      assignment: routeAssignment(route, designer),
      ...(routeOutputs.get(route.id) === undefined ? {} : { output: routeOutputs.get(route.id) }),
      voltageV,
      ...(powerW === undefined ? {} : { powerW }),
      ...(currentA === undefined ? {} : { currentA })
    };
  });
  const summarize = (groupRows: LedStringBomRow[]) => {
    const totalLengthM = groupRows.reduce((total, row) => total + row.lengthM, 0);
    const totalLedCount = showsIndividualLeds ? groupRows.reduce((total, row) => total + (row.ledCount ?? 0), 0) : undefined;
    const totalPowerW = groupRows.every((row) => row.powerW !== undefined) ? groupRows.reduce((total, row) => total + (row.powerW ?? 0), 0) : undefined;
    const minimumCurrentA = groupRows.every((row) => row.currentA !== undefined) ? groupRows.reduce((total, row) => total + (row.currentA ?? 0), 0) : undefined;
    return {
      totalLengthM,
      ...(totalLedCount === undefined ? {} : { totalLedCount }),
      ...(totalPowerW === undefined ? {} : { totalPowerW }),
      ...(minimumCurrentA === undefined ? {} : { minimumCurrentA, recommendedCurrentA: minimumCurrentA * 1.25 })
    };
  };
  const groups: LedStringBomGroup[] = Array.from({ length: designer.controller.dataOutputs }, (_, index) => {
    const output = index + 1;
    const groupRows = rows.filter((row) => row.output === output);
    return { output, label: `Controller output ${output}`, rows: groupRows, ...summarize(groupRows) };
  });
  const disconnectedRows = rows.filter((row) => row.output === undefined);
  if (disconnectedRows.length) groups.push({ label: "No controller output", rows: disconnectedRows, ...summarize(disconnectedRows) });
  const totalLengthM = rows.reduce((total, row) => total + row.lengthM, 0);
  const totalLedCount = showsIndividualLeds ? rows.reduce((total, row) => total + (row.ledCount ?? 0), 0) : undefined;
  const totalPowerW = rows.every((row) => row.powerW !== undefined) ? rows.reduce((total, row) => total + (row.powerW ?? 0), 0) : undefined;
  const minimumCurrentA = rows.every((row) => row.currentA !== undefined) ? rows.reduce((total, row) => total + (row.currentA ?? 0), 0) : undefined;
  return {
    stripName: strip?.name ?? "Custom LED strip",
    voltageV,
    ...(ratedCurrentMaPerLed === undefined ? {} : { ratedCurrentMaPerLed }),
    ...(ratedPowerWPerMeter === undefined ? {} : { ratedPowerWPerMeter }),
    rows,
    groups,
    totalLengthM,
    ...(totalLedCount === undefined ? {} : { totalLedCount }),
    ...(totalPowerW === undefined ? {} : { totalPowerW }),
    ...(minimumCurrentA === undefined ? {} : { minimumCurrentA, recommendedCurrentA: minimumCurrentA * 1.25 })
  };
}
