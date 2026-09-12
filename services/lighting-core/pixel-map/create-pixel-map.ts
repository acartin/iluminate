import { SpatialPixel } from "../domain/partituras/types.js";

/** Returns physical pixels in deterministic controller transmission order. */
export function sortPixelMap(pixels: SpatialPixel[]) {
  return pixels.slice().sort((left, right) => left.output - right.output || left.serialIndex - right.serialIndex);
}
