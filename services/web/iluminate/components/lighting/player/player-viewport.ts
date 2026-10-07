import type { DesignerViewport } from "../designer/types";

type PlayerSurfaceSize = {
  width: number;
  height: number;
};

/**
 * Expands the visible world around its center until both canvas axes use the
 * same physical scale. Expanding instead of cropping keeps the requested
 * content visible when the player surface changes shape.
 */
export function normalizePlayerViewport(viewport: DesignerViewport, surface: PlayerSurfaceSize): DesignerViewport {
  const surfaceWidth = Math.max(1, surface.width);
  const surfaceHeight = Math.max(1, surface.height);
  const aspect = surfaceWidth / surfaceHeight;
  const scale = Math.max(viewport.width / aspect, viewport.height);
  const width = scale * aspect;
  const height = scale;

  return {
    x: viewport.x - (width - viewport.width) / 2,
    y: viewport.y - (height - viewport.height) / 2,
    width,
    height
  };
}
