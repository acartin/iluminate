export async function requestPlaybackPreview<T>(request: () => Promise<{ ok: boolean; preview?: T }>): Promise<T | null> {
  try {
    const payload = await request();
    return payload.ok && payload.preview ? payload.preview : null;
  } catch {
    return null;
  }
}

type PlaybackPixel = {
  output: number;
  serialIndex: number;
  color: { r: number; g: number; b: number };
};

type PlaybackPixelAddress = Pick<PlaybackPixel, "output" | "serialIndex">;

/** A missing preview is an off frame, not the renderer's gray unmapped state. */
export function resolvePlaybackPixels(previewPixels: PlaybackPixel[] | undefined, pixelMap: PlaybackPixelAddress[]): PlaybackPixel[] {
  if (previewPixels) return previewPixels;
  return pixelMap.map(({ output, serialIndex }) => ({
    output,
    serialIndex,
    color: { r: 0, g: 0, b: 0 }
  }));
}
