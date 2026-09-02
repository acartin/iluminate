import { Partitura } from "../domain/partituras/types.js";
import { FramePixel, renderSceneFrame, Rgb } from "./scene-player.js";

export const WS2812B_BITS_PER_PIXEL = 24;
export const WS2812B_BIT_TIME_US = 1.25;
export const WS2812B_RESET_TIME_US = 280;

export type Ws2812bPixel = {
  chainId: string;
  output: number;
  index: number;
  x: number;
  y: number;
  order: number;
  normalizedX: number;
  normalizedY: number;
  color: Rgb;
  grb: [number, number, number];
};

export type Ws2812bOutputFrame = {
  output: number;
  chainId: string;
  pixelCount: number;
  transmitTimeUs: number;
  maxRefreshRateFps: number;
  pixels: Ws2812bPixel[];
};

export type Ws2812bSimulationFrame = {
  protocol: "WS2812B-like";
  sceneId: string;
  timeMs: number;
  resetTimeUs: number;
  bitTimeUs: number;
  bitsPerPixel: number;
  longestOutputTransmitTimeUs: number;
  estimatedMaxRefreshRateFps: number;
  outputs: Ws2812bOutputFrame[];
};

export function simulateWs2812bFrame(partitura: Partitura, sceneId: string, timeMs: number): Ws2812bSimulationFrame {
  const renderedFrame = renderSceneFrame(partitura, sceneId, timeMs);
  const renderedByAddress = new Map(renderedFrame.pixels.map((pixel) => [`${pixel.chainId}:${pixel.index}`, pixel]));

  const outputs = partitura.chains
    .slice()
    .sort((left, right) => left.output - right.output)
    .map<Ws2812bOutputFrame>((chain) => {
      const pixels = Array.from({ length: chain.pixelCount }, (_, index) => {
        const renderedPixel = renderedByAddress.get(`${chain.id}:${index}`);
        return toWs2812bPixel(
          renderedPixel ?? {
            chainId: chain.id,
            output: chain.output,
            index,
            x: index,
            y: 0,
            order: index,
            normalizedX: chain.pixelCount > 1 ? index / (chain.pixelCount - 1) : 0,
            normalizedY: 0,
            color: { r: 0, g: 0, b: 0 }
          }
        );
      });
      const transmitTimeUs = estimateTransmitTimeUs(chain.pixelCount);

      return {
        output: chain.output,
        chainId: chain.id,
        pixelCount: chain.pixelCount,
        transmitTimeUs,
        maxRefreshRateFps: estimateRefreshRateFps(chain.pixelCount),
        pixels
      };
    });

  const longestOutputTransmitTimeUs = Math.max(...outputs.map((output) => output.transmitTimeUs), 0);

  return {
    protocol: "WS2812B-like",
    sceneId: renderedFrame.sceneId,
    timeMs: renderedFrame.timeMs,
    resetTimeUs: WS2812B_RESET_TIME_US,
    bitTimeUs: WS2812B_BIT_TIME_US,
    bitsPerPixel: WS2812B_BITS_PER_PIXEL,
    longestOutputTransmitTimeUs,
    estimatedMaxRefreshRateFps: longestOutputTransmitTimeUs > 0 ? Math.floor(1_000_000 / longestOutputTransmitTimeUs) : 0,
    outputs
  };
}

export function estimateTransmitTimeUs(pixelCount: number) {
  if (pixelCount <= 0) return 0;
  return pixelCount * WS2812B_BITS_PER_PIXEL * WS2812B_BIT_TIME_US + WS2812B_RESET_TIME_US;
}

export function estimateRefreshRateFps(pixelCount: number) {
  return Math.floor(1_000_000 / estimateTransmitTimeUs(pixelCount));
}

function toWs2812bPixel(pixel: FramePixel): Ws2812bPixel {
  const color = quantizeRgb(pixel.color);
  return {
    chainId: pixel.chainId,
    output: pixel.output,
    index: pixel.index,
    x: pixel.x,
    y: pixel.y,
    order: pixel.order,
    normalizedX: pixel.normalizedX,
    normalizedY: pixel.normalizedY,
    color,
    grb: [color.g, color.r, color.b]
  };
}

function quantizeRgb(color: Rgb): Rgb {
  return {
    r: clampByte(color.r),
    g: clampByte(color.g),
    b: clampByte(color.b)
  };
}

function clampByte(value: number) {
  return Math.round(Math.min(255, Math.max(0, value)));
}
