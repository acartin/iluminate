import { Group, LogicalOutput, Output, SpatialPixel, Zone } from "../domain/partituras/types.js";

export type MatrixWiring = "rows" | "serpentine_rows" | "columns" | "serpentine_columns";
export type MatrixPixelMapInput = { id: string; name?: string; output: LogicalOutput; width: number; height: number; originX?: number; originY?: number; wiring?: MatrixWiring };
export type PixelMapPreset = { outputs: Output[]; pixelMap: SpatialPixel[]; zones: Zone[]; groups: Group[] };

export function createLinearPixelMapPreset({ id, name, output, pixels, originX = 0, originY = 0 }: { id: string; name?: string; output: LogicalOutput; pixels: number; originX?: number; originY?: number }): PixelMapPreset {
  const pixelMap = Array.from({ length: pixels }, (_, serialIndex) => ({ id: `${id}_px_${serialIndex}`, output, serialIndex, stringId: id, routeOffsetCm: serialIndex, x: originX + serialIndex, y: originY, tangentDeg: 0 }));
  return { outputs: [{ id: `output_${output}`, name: `Output ${output}`, output, pixelCount: pixels }], pixelMap, zones: [{ id, name: name ?? id, pixelIds: pixelMap.map((pixel) => pixel.id) }], groups: [] };
}

export function createMatrixPixelMapPreset(input: MatrixPixelMapInput): PixelMapPreset {
  const wiring = input.wiring ?? "serpentine_rows";
  const originX = input.originX ?? 0;
  const originY = input.originY ?? 0;
  const points = wiring === "columns" || wiring === "serpentine_columns"
    ? Array.from({ length: input.width * input.height }, (_, index) => {
      const column = Math.floor(index / input.height); const local = index % input.height; const y = wiring === "serpentine_columns" && column % 2 ? input.height - 1 - local : local;
      return { x: originX + column, y: originY + y, angle: 90 };
    })
    : Array.from({ length: input.width * input.height }, (_, index) => {
      const row = Math.floor(index / input.width); const local = index % input.width; const x = wiring === "serpentine_rows" && row % 2 ? input.width - 1 - local : local;
      return { x: originX + x, y: originY + row, angle: 0 };
    });
  const pixelMap = points.map((point, serialIndex) => ({ id: `${input.id}_px_${serialIndex}`, output: input.output, serialIndex, stringId: input.id, routeOffsetCm: serialIndex, x: point.x, y: point.y, tangentDeg: point.angle }));
  return { outputs: [{ id: `output_${input.output}`, name: `Output ${input.output}`, output: input.output, pixelCount: pixelMap.length }], pixelMap, zones: [{ id: input.id, name: input.name ?? input.id, pixelIds: pixelMap.map((pixel) => pixel.id) }], groups: [] };
}

export function createMultiPanelPixelMapPreset(inputs: MatrixPixelMapInput[]): PixelMapPreset {
  const panels = inputs.map(createMatrixPixelMapPreset);
  const pixelMap = panels.flatMap((panel) => panel.pixelMap);
  const outputs = [1, 2, 3].flatMap((output) => {
    const pixels = pixelMap.filter((pixel) => pixel.output === output);
    return pixels.length ? [{ id: `output_${output}`, name: `Output ${output}`, output: output as LogicalOutput, pixelCount: pixels.length }] : [];
  });
  return { outputs, pixelMap, zones: panels.flatMap((panel) => panel.zones), groups: [{ id: "lab_area", name: "Lab area", members: panels.flatMap((panel) => panel.zones.map((zone) => ({ type: "zone" as const, id: zone.id }))) }] };
}
