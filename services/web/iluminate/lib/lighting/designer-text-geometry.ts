import opentype, { type Font, type PathCommand } from "opentype.js";
import type { DesignerContour, DesignerGeometry, DesignerPoint, DesignerText } from "./partitura-model";

export type DesignerTextBounds = { x: number; y: number; width: number; height: number };

export function designerTextToGeometry(text: DesignerText, fontData: ArrayBuffer, resultId: string): DesignerGeometry | null {
  const font = opentype.parse(fontData);
  const contours = textCommands(font, text).flatMap(commandsToContours);
  if (!contours.length) return null;
  const bounds = contourBounds(contours);
  return {
    id: resultId,
    kind: "path",
    ...bounds,
    points: contours[0].points,
    ...(contours.length > 1 ? { contours } : {}),
    pathMode: "bezier",
    closed: true,
    fillRule: "evenodd"
  };
}

export function estimateDesignerTextBounds(text: DesignerText): DesignerTextBounds {
  const lines = normalizedLines(text.text);
  const sizeCm = Math.max(0.1, text.fontSizeMm / 10);
  const widest = Math.max(1, ...lines.map((line) => Math.max(1, line.length) * sizeCm * 0.58 + Math.max(0, line.length - 1) * text.trackingMm / 10));
  const height = Math.max(sizeCm, lines.length * sizeCm * text.lineHeight);
  const x = text.alignment === "center" ? text.x - widest / 2 : text.alignment === "right" ? text.x - widest : text.x;
  return { x, y: text.y, width: widest, height };
}

function textCommands(font: Font, text: DesignerText) {
  const sizeCm = Math.max(0.1, text.fontSizeMm / 10);
  const trackingCm = text.trackingMm / 10;
  const scale = sizeCm / font.unitsPerEm;
  const lines = normalizedLines(text.text);
  const widths = lines.map((line) => lineWidth(font, line, sizeCm, trackingCm));
  return lines.flatMap((line, lineIndex) => {
    const width = widths[lineIndex];
    const startX = text.alignment === "center" ? text.x - width / 2 : text.alignment === "right" ? text.x - width : text.x;
    const baseline = text.y + font.ascender * scale + lineIndex * sizeCm * text.lineHeight;
    let cursor = startX;
    let previous: opentype.Glyph | null = null;
    return font.stringToGlyphs(line).map((glyph) => {
      if (previous) cursor += font.getKerningValue(previous, glyph) * scale;
      const commands = glyph.getPath(cursor, baseline, sizeCm).commands;
      cursor += (glyph.advanceWidth ?? 0) * scale + trackingCm;
      previous = glyph;
      return commands;
    });
  });
}

function lineWidth(font: Font, line: string, sizeCm: number, trackingCm: number) {
  const glyphs = font.stringToGlyphs(line);
  const scale = sizeCm / font.unitsPerEm;
  return glyphs.reduce((width, glyph, index) => width
    + (index ? font.getKerningValue(glyphs[index - 1], glyph) * scale : 0)
    + (glyph.advanceWidth ?? 0) * scale
    + (index < glyphs.length - 1 ? trackingCm : 0), 0);
}

function normalizedLines(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

function commandsToContours(commands: PathCommand[]): DesignerContour[] {
  const contours: DesignerContour[] = [];
  let points: DesignerPoint[] = [];
  const finish = () => {
    if (points.length >= 3) contours.push({ points, pathMode: points.some((point) => point.handleIn || point.handleOut) ? "bezier" : "straight", closed: true });
    points = [];
  };
  commands.forEach((command) => {
    if (command.type === "M") {
      finish();
      points.push(point(command.x, command.y));
      return;
    }
    if (command.type === "L") {
      points.push(point(command.x, command.y));
      return;
    }
    if (command.type === "C") {
      const previous = points[points.length - 1];
      if (!previous) return;
      previous.handleOut = point(command.x1 - previous.x, command.y1 - previous.y);
      points.push({ ...point(command.x, command.y), handleIn: point(command.x2 - command.x, command.y2 - command.y), nodeType: "smooth" });
      return;
    }
    if (command.type === "Q") {
      const previous = points[points.length - 1];
      if (!previous) return;
      const control1 = { x: previous.x + (2 / 3) * (command.x1 - previous.x), y: previous.y + (2 / 3) * (command.y1 - previous.y) };
      const control2 = { x: command.x + (2 / 3) * (command.x1 - command.x), y: command.y + (2 / 3) * (command.y1 - command.y) };
      previous.handleOut = point(control1.x - previous.x, control1.y - previous.y);
      points.push({ ...point(command.x, command.y), handleIn: point(control2.x - command.x, control2.y - command.y), nodeType: "smooth" });
      return;
    }
    if (command.type === "Z") finish();
  });
  finish();
  return contours;
}

function contourBounds(contours: DesignerContour[]): DesignerTextBounds {
  const coordinates = contours.flatMap((contour) => contour.points.flatMap((entry) => [entry, entry.handleIn ? { x: entry.x + entry.handleIn.x, y: entry.y + entry.handleIn.y } : entry, entry.handleOut ? { x: entry.x + entry.handleOut.x, y: entry.y + entry.handleOut.y } : entry]));
  const minX = Math.min(...coordinates.map((entry) => entry.x));
  const minY = Math.min(...coordinates.map((entry) => entry.y));
  const maxX = Math.max(...coordinates.map((entry) => entry.x));
  const maxY = Math.max(...coordinates.map((entry) => entry.y));
  return { x: round(minX), y: round(minY), width: Math.max(0.001, round(maxX - minX)), height: Math.max(0.001, round(maxY - minY)) };
}

function point(x: number, y: number): DesignerPoint {
  return { x: round(x), y: round(y) };
}

function round(value: number) {
  return Math.round(value * 100000) / 100000;
}
