export type ArtworkSizeBasis = "physical-units" | "embedded-density" | "css-pixels-96dpi";

export type ArtworkIntrinsicSize = {
  widthCm: number;
  heightCm: number;
  basis: ArtworkSizeBasis;
};

const CSS_PIXELS_PER_INCH = 96;

export function inspectArtworkIntrinsicSize(bytes: Uint8Array, mimeType: string): ArtworkIntrinsicSize {
  const normalizedMime = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (normalizedMime === "image/svg+xml" || looksLikeSvg(bytes)) return inspectSvg(bytes);
  if (normalizedMime === "image/png" || isPng(bytes)) return inspectPng(bytes);
  if (normalizedMime === "image/jpeg" || isJpeg(bytes)) return inspectJpeg(bytes);
  if (normalizedMime === "image/webp" || isWebp(bytes)) return inspectWebp(bytes);
  if (normalizedMime === "image/bmp" || isBmp(bytes)) return inspectBmp(bytes);
  throw new Error("Unsupported artwork image format.");
}

function inspectSvg(bytes: Uint8Array): ArtworkIntrinsicSize {
  const source = new TextDecoder().decode(bytes);
  const root = source.match(/<svg\b([^>]*)>/i)?.[1];
  if (!root) throw new Error("SVG root element is missing.");
  const viewBox = attribute(root, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  const viewWidth = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 ? viewBox[2] : undefined;
  const viewHeight = viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[3] > 0 ? viewBox[3] : undefined;
  const width = parseSvgLength(attribute(root, "width"));
  const height = parseSvgLength(attribute(root, "height"));

  if (width && height) return checkedSize(width.cm, height.cm, width.physical || height.physical ? "physical-units" : "css-pixels-96dpi");
  if (width && viewWidth && viewHeight) return checkedSize(width.cm, width.cm * viewHeight / viewWidth, width.physical ? "physical-units" : "css-pixels-96dpi");
  if (height && viewWidth && viewHeight) return checkedSize(height.cm * viewWidth / viewHeight, height.cm, height.physical ? "physical-units" : "css-pixels-96dpi");
  if (viewWidth && viewHeight) return pixelsToSize(viewWidth, viewHeight);
  throw new Error("SVG must declare width/height or a valid viewBox.");
}

function inspectPng(bytes: Uint8Array): ArtworkIntrinsicSize {
  if (bytes.length < 24 || !isPng(bytes)) throw new Error("Invalid PNG image.");
  const view = dataView(bytes);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "pHYs" && length >= 9 && offset + 17 <= bytes.length) {
      const pixelsPerMeterX = view.getUint32(offset + 8);
      const pixelsPerMeterY = view.getUint32(offset + 12);
      const unit = bytes[offset + 16];
      if (unit === 1 && pixelsPerMeterX > 0 && pixelsPerMeterY > 0) {
        return checkedSize(width * 100 / pixelsPerMeterX, height * 100 / pixelsPerMeterY, "embedded-density");
      }
    }
    offset += 12 + length;
  }
  return pixelsToSize(width, height);
}

function inspectJpeg(bytes: Uint8Array): ArtworkIntrinsicSize {
  if (!isJpeg(bytes)) throw new Error("Invalid JPEG image.");
  let width = 0;
  let height = 0;
  let density: { x: number; y: number; unit: number } | undefined;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = uint16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    const data = offset + 2;
    if (marker === 0xe0 && length >= 16 && ascii(bytes, data, 5) === "JFIF\0") {
      density = { unit: bytes[data + 7], x: uint16be(bytes, data + 8), y: uint16be(bytes, data + 10) };
    }
    if (isJpegStartOfFrame(marker) && length >= 8) {
      height = uint16be(bytes, data + 1);
      width = uint16be(bytes, data + 3);
    }
    offset += length;
  }
  if (width < 1 || height < 1) throw new Error("JPEG dimensions are missing.");
  if (density && density.x > 0 && density.y > 0) {
    if (density.unit === 1) return checkedSize(width * 2.54 / density.x, height * 2.54 / density.y, "embedded-density");
    if (density.unit === 2) return checkedSize(width / density.x, height / density.y, "embedded-density");
  }
  return pixelsToSize(width, height);
}

function inspectWebp(bytes: Uint8Array): ArtworkIntrinsicSize {
  if (!isWebp(bytes) || bytes.length < 30) throw new Error("Invalid WebP image.");
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") return pixelsToSize(1 + uint24le(bytes, 24), 1 + uint24le(bytes, 27));
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return pixelsToSize(uint16le(bytes, 26) & 0x3fff, uint16le(bytes, 28) & 0x3fff);
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = dataView(bytes).getUint32(21, true);
    return pixelsToSize(1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff));
  }
  throw new Error("WebP dimensions are missing.");
}

function inspectBmp(bytes: Uint8Array): ArtworkIntrinsicSize {
  if (!isBmp(bytes) || bytes.length < 26) throw new Error("Invalid BMP image.");
  const view = dataView(bytes);
  const dibSize = view.getUint32(14, true);
  if (dibSize === 12) return pixelsToSize(view.getUint16(18, true), view.getUint16(20, true));
  if (dibSize < 40 || bytes.length < 54) throw new Error("Unsupported BMP header.");
  const width = Math.abs(view.getInt32(18, true));
  const height = Math.abs(view.getInt32(22, true));
  const pixelsPerMeterX = Math.abs(view.getInt32(38, true));
  const pixelsPerMeterY = Math.abs(view.getInt32(42, true));
  if (pixelsPerMeterX > 0 && pixelsPerMeterY > 0) {
    return checkedSize(width * 100 / pixelsPerMeterX, height * 100 / pixelsPerMeterY, "embedded-density");
  }
  return pixelsToSize(width, height);
}

function parseSvgLength(raw: string | undefined): { cm: number; physical: boolean } | undefined {
  if (!raw || raw.trim().endsWith("%")) return undefined;
  const match = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|pt|pc|q|px)?$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = (match[2] ?? "px").toLowerCase();
  const factors: Record<string, number> = { mm: 0.1, cm: 1, in: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, q: 0.025, px: 2.54 / CSS_PIXELS_PER_INCH };
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return { cm: value * factors[unit], physical: unit !== "px" };
}

function pixelsToSize(width: number, height: number) {
  return checkedSize(width * 2.54 / CSS_PIXELS_PER_INCH, height * 2.54 / CSS_PIXELS_PER_INCH, "css-pixels-96dpi");
}

function checkedSize(widthCm: number, heightCm: number, basis: ArtworkSizeBasis): ArtworkIntrinsicSize {
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm) || widthCm <= 0 || heightCm <= 0) throw new Error("Artwork dimensions are invalid.");
  return { widthCm, heightCm, basis };
}

function attribute(source: string, name: string) {
  return source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
}

function dataView(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));
}

function uint16be(bytes: Uint8Array, offset: number) {
  return dataView(bytes).getUint16(offset);
}

function uint16le(bytes: Uint8Array, offset: number) {
  return dataView(bytes).getUint16(offset, true);
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function looksLikeSvg(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).includes("<svg");
}

function isPng(bytes: Uint8Array) {
  return bytes.length >= 8 && ascii(bytes, 1, 3) === "PNG" && bytes[0] === 0x89;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

function isBmp(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
}

function isJpegStartOfFrame(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}
