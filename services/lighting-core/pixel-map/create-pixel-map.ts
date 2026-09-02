import { Chain, Segment, SpatialPixel } from "../domain/partituras/types.js";

export function createPixelMap(chains: Chain[], segments: Segment[]): SpatialPixel[] {
  const chainById = new Map(chains.map((chain) => [chain.id, chain]));
  let order = 0;

  return segments.flatMap((segment) => {
    const chain = chainById.get(segment.chainId);
    if (!chain) return [];

    const indexes = range(segment.length).map((offset) => segment.start + offset);
    const directedIndexes = segment.reverse ? indexes.reverse() : indexes;
    const originX = segment.x ?? segment.start;
    const originY = segment.y ?? 0;
    const stepX = segment.stepX ?? 1;
    const stepY = segment.stepY ?? 0;

    return directedIndexes.map((index, offset) => ({
      id: `${segment.id}_${offset}`,
      chainId: chain.id,
      output: chain.output,
      index,
      segmentId: segment.id,
      x: originX + offset * stepX,
      y: originY + offset * stepY,
      order: order++
    }));
  });
}

function range(length: number) {
  return Array.from({ length }, (_, index) => index);
}
