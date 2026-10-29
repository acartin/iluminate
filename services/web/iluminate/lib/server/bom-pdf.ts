import type { LedStringBom, LedStringBomGroup } from "@/lib/lighting/materials-bom";

function printable(value: string) {
  return value
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function clipped(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function text(x: number, y: number, value: string, size = 9, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${printable(value)}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `${x1} ${y1} m ${x2} ${y2} l S`;
}

function number(value: number | undefined, digits: number, suffix = "") {
  return value === undefined ? "Not set" : `${value.toFixed(digits)}${suffix}`;
}

function pageContent(projectName: string, partituraName: string, bom: LedStringBom, group: LedStringBomGroup, pageRows: LedStringBom["rows"], page: number, pageCount: number, isLastForGroup: boolean) {
  const commands = [
    "0.15 0.20 0.29 RG",
    "0.15 0.20 0.29 rg",
    text(36, 555, "ILUMINATE - LED STRING BOM", 16, true),
    text(36, 535, `Project: ${clipped(projectName, 75)}`, 10),
    text(36, 520, `Active partitura: ${clipped(partituraName, 65)}`, 10),
    text(500, 535, `Strip: ${clipped(bom.stripName, 48)}`, 9),
    text(500, 520, `Electrical profile: ${number(bom.voltageV || undefined, 2, " V")} / ${bom.ratedCurrentMaPerLed === undefined ? number(bom.ratedPowerWPerMeter, 2, " W/m") : number(bom.ratedCurrentMaPerLed, 2, " mA/LED")}`, 9),
    line(36, 505, 806, 505),
    text(40, 488, group.label, 11, true),
    text(620, 488, `${group.rows.length} strings`, 9),
    line(36, 478, 806, 478),
    text(40, 461, "#", 8, true),
    text(65, 461, "LED string", 8, true),
    text(235, 461, "Zone / Channel", 8, true),
    text(535, 461, "Length", 8, true),
    text(615, 461, "LEDs", 8, true),
    text(704, 461, "Current", 8, true),
    line(36, 451, 806, 451)
  ];
  pageRows.forEach((row, index) => {
    const y = 433 - index * 14;
    const absoluteIndex = group.rows.indexOf(row) + 1;
    commands.push(
      text(40, y, String(absoluteIndex), 8),
      text(65, y, clipped(row.name, 30), 8),
      text(235, y, clipped(row.assignment, 43), 8),
      text(535, y, number(row.lengthM, 2, " m"), 8),
      text(615, y, row.ledCount === undefined ? "N/A" : String(row.ledCount), 8),
      text(704, y, number(row.currentA, 2, " A"), 8)
    );
  });
  if (isLastForGroup) {
    const summaryY = Math.max(62, 419 - pageRows.length * 14);
    commands.push(
      line(470, summaryY + 18, 806, summaryY + 18),
      text(470, summaryY, `Output length: ${number(group.totalLengthM, 2, " m")}`, 9, true),
      text(650, summaryY, `LEDs: ${group.totalLedCount === undefined ? "N/A" : group.totalLedCount}`, 9, true),
      text(470, summaryY - 16, `Output current: ${number(group.minimumCurrentA, 2, " A")}`, 9, true),
      text(650, summaryY - 16, `Recommended (+25%): ${number(group.recommendedCurrentA, 2, " A")}`, 9, true)
    );
  }
  commands.push(text(735, 28, `Page ${page} / ${pageCount}`, 8));
  return commands.join("\n");
}

export function createLedStringBomPdf(projectName: string, partituraName: string, bom: LedStringBom) {
  const pages = bom.groups.flatMap((group) => {
    const chunks = group.rows.length ? Array.from({ length: Math.ceil(group.rows.length / 25) }, (_, index) => group.rows.slice(index * 25, (index + 1) * 25)) : [[]];
    return chunks.map((rows, index) => ({ group, rows, isLastForGroup: index === chunks.length - 1 }));
  });
  if (!pages.length) pages.push({ group: { label: "No controller output", rows: [], totalLengthM: 0 }, rows: [], isLastForGroup: true });
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach(({ group, rows, isLastForGroup }, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = pageContent(projectName, partituraName, bom, group, rows, index + 1, pages.length, isLastForGroup);
    const streamLength = Buffer.byteLength(stream, "latin1");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [0];
  let position = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(position);
    const chunk = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, "latin1");
    chunks.push(chunk);
    position += chunk.length;
  });
  const xrefOffset = position;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  ].join("\n");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}
