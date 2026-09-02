import { LogicalOutput } from "../domain/partituras/types.js";
import { ChainConfig, SegmentConfig, ZoneConfig } from "../generators/partitura-generator.js";

export type MatrixWiring = "rows" | "serpentine_rows" | "columns" | "serpentine_columns";

export type MatrixPixelMapInput = {
  id: string;
  name?: string;
  output: LogicalOutput;
  width: number;
  height: number;
  originX?: number;
  originY?: number;
  gapAfter?: number;
  wiring?: MatrixWiring;
};

export type PixelMapPreset = {
  chains: ChainConfig[];
  segments: SegmentConfig[];
  zones: ZoneConfig[];
};

export function createLinearPixelMapPreset({
  id,
  name,
  output,
  pixels,
  originX = 0,
  originY = 0
}: {
  id: string;
  name?: string;
  output: LogicalOutput;
  pixels: number;
  originX?: number;
  originY?: number;
}): PixelMapPreset {
  const chainId = `${id}_chain`;
  const segmentId = `${id}_segment`;

  return {
    chains: [{ id: chainId, name: name ?? id, output, pixelCount: pixels }],
    segments: [{ id: segmentId, name: name ?? id, chainId, start: 0, length: pixels, reverse: false, x: originX, y: originY, stepX: 1, stepY: 0 }],
    zones: [{ id, name: name ?? id, segments: [segmentId] }]
  };
}

export function createMatrixPixelMapPreset(input: MatrixPixelMapInput): PixelMapPreset {
  const chainId = `${input.id}_chain`;
  const segments = createMatrixSegments({ ...input, chainId });

  return {
    chains: [{ id: chainId, name: input.name ?? input.id, output: input.output, pixelCount: input.width * input.height }],
    segments,
    zones: [{ id: input.id, name: input.name ?? input.id, segments: segments.map((segment) => segment.id) }]
  };
}

export function createMultiPanelPixelMapPreset(inputs: MatrixPixelMapInput[]): PixelMapPreset {
  const panels = inputs.map(createMatrixPixelMapPreset);
  return {
    chains: panels.flatMap((panel) => panel.chains),
    segments: panels.flatMap((panel) => panel.segments),
    zones: [
      ...panels.flatMap((panel) => panel.zones),
      {
        id: "lab_area",
        name: "Lab area",
        segments: panels.flatMap((panel) => panel.segments.map((segment) => segment.id))
      }
    ]
  };
}

function createMatrixSegments(input: MatrixPixelMapInput & { chainId: string }): SegmentConfig[] {
  const wiring = input.wiring ?? "serpentine_rows";
  const originX = input.originX ?? 0;
  const originY = input.originY ?? 0;

  if (wiring === "columns" || wiring === "serpentine_columns") {
    return Array.from({ length: input.width }, (_, column) => {
      const reverse = wiring === "serpentine_columns" && column % 2 === 1;
      return {
        id: `${input.id}_col_${column + 1}`,
        name: `${input.name ?? input.id} col ${column + 1}`,
        chainId: input.chainId,
        start: column * input.height,
        length: input.height,
        reverse,
        x: originX + column,
        y: originY,
        stepX: 0,
        stepY: 1
      };
    });
  }

  return Array.from({ length: input.height }, (_, row) => {
    const reverse = wiring === "serpentine_rows" && row % 2 === 1;
    return {
      id: `${input.id}_row_${row + 1}`,
      name: `${input.name ?? input.id} row ${row + 1}`,
      chainId: input.chainId,
      start: row * input.width,
      length: input.width,
      reverse,
      x: originX,
      y: originY + row,
      stepX: 1,
      stepY: 0
    };
  });
}
