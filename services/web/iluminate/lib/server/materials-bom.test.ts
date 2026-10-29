import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { controllerPortPoint } from "@/components/lighting/designer/designer-geometry";
import { buildLedStringBom } from "@/lib/lighting/materials-bom";
import { createNewPartituraDocument } from "@/lib/lighting/partitura-model";
import { createLedStringBomPdf } from "./bom-pdf";

describe("LED string BOM", () => {
  it("uses only physical LED strings and derives electrical totals from their drawn length", () => {
    const document = createNewPartituraDocument("bom-project");
    const designer = document.designer!;
    designer.ledsPerMeter = 60;
    designer.stripConfiguration = {
      name: "Test strip",
      construction: "discrete",
      nativeControlProtocol: "ws281x",
      colorModel: "rgb",
      voltageV: 12,
      cutMode: "marked_segments",
      addressablePixelsPerCutSegment: 1,
      physicalLedsPerCutSegment: 1,
      physicalLedsPerAddressablePixel: 1,
      addressablePixelsPerMeter: 60,
      physicalLedsPerMeter: 60,
      pcbWidthMm: 10,
      ratedPowerWPerMeter: 18
    };
    designer.zones = [{ id: "zone-a", name: "Letter A", shape: "rect", x: 0, y: 0, width: 10, height: 10, visible: true, locked: false, opacity: 1 }];
    designer.routes = [
      { id: "string-a", name: "String A", kind: "led_string", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }], diffuserMapping: { mode: "restricted", targets: [{ type: "zone", id: "zone-a" }] } },
      { id: "virtual-cable", name: "Virtual data cable", kind: "data_cable", points: [{ x: 0, y: 0 }, { x: 1000, y: 0 }] }
    ];

    const bom = buildLedStringBom(document);
    assert.equal(bom.rows.length, 1);
    assert.equal(bom.rows[0].lengthM, 1.5);
    assert.equal(bom.rows[0].ledCount, 90);
    assert.equal(bom.rows[0].assignment, "Zone: Letter A");
    assert.equal(bom.rows[0].powerW, 27);
    assert.equal(bom.rows[0].currentA, 2.25);
    assert.equal(bom.minimumCurrentA, 2.25);
    assert.equal(bom.recommendedCurrentA, 2.8125);
  });

  it("reports Auto and leaves electrical totals unavailable when W/m is missing", () => {
    const document = createNewPartituraDocument("bom-no-power");
    document.designer!.stripConfiguration = { ...document.designer!.stripConfiguration!, ratedPowerWPerMeter: undefined };
    document.designer!.routes = [{ id: "string-auto", name: "Auto string", kind: "led_string", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] }];
    const bom = buildLedStringBom(document);
    assert.equal(bom.rows[0].assignment, "Auto");
    assert.equal(bom.totalPowerW, undefined);
    assert.equal(bom.minimumCurrentA, undefined);
  });

  it("counts the physical LED packages materialized by Designer and derives strip length from that count", () => {
    const document = createNewPartituraDocument("bom-drawn-leds");
    document.designer!.ledsPerMeter = 60;
    document.designer!.routes = [{ id: "string-edge", name: "Edge string", kind: "led_string", points: [{ x: 0, y: 0 }, { x: 2.5, y: 0 }] }];
    const bom = buildLedStringBom(document);
    assert.equal(bom.rows[0].ledCount, 1);
    assert.ok(Math.abs(bom.rows[0].lengthM - 1 / 60) < 1e-9);
  });

  it("does not invent an individual LED count for a continuous strip", () => {
    const document = createNewPartituraDocument("bom-continuous");
    document.designer!.stripConfiguration = { ...document.designer!.stripConfiguration!, construction: "continuous" };
    document.designer!.routes = [{ id: "string-cob", name: "COB string", kind: "led_string", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    const bom = buildLedStringBom(document);
    assert.equal(bom.rows[0].ledCount, undefined);
    assert.equal(bom.totalLedCount, undefined);
  });

  it("groups complete strings by controller output in electrical traversal order", () => {
    const document = createNewPartituraDocument("bom-outputs");
    const designer = document.designer!;
    designer.stripConfiguration = { ...designer.stripConfiguration!, ratedCurrentMaPerLed: 40, ratedPowerWPerMeter: undefined };
    const port = controllerPortPoint(designer.controller, 0, designer.snapCm);
    designer.routes = [
      { id: "cable-1", name: "Output cable", kind: "data_cable", designSurface: "rear", points: [{ ...port, joint: true }, { x: port.x + 10, y: port.y, joint: true }] },
      { id: "string-1", name: "First string", kind: "led_string", designSurface: "rear", points: [{ x: port.x + 10, y: port.y, joint: true }, { x: port.x + 110, y: port.y, joint: true }] },
      { id: "string-2", name: "Second string", kind: "led_string", designSurface: "rear", points: [{ x: port.x + 110, y: port.y, joint: true }, { x: port.x + 160, y: port.y }] }
    ];

    const bom = buildLedStringBom(document);
    assert.deepEqual(bom.groups[0].rows.map((row) => row.name), ["First string", "Second string"]);
    assert.equal(bom.groups[0].totalLedCount, 90);
    assert.ok(Math.abs((bom.groups[0].minimumCurrentA ?? 0) - 3.6) < 1e-9);
    assert.ok(Math.abs((bom.groups[0].recommendedCurrentA ?? 0) - 4.5) < 1e-9);
    assert.equal(bom.groups[1].rows.length, 0);
  });

  it("exports the same BOM as a downloadable PDF document", () => {
    const document = createNewPartituraDocument("bom-pdf");
    document.designer!.routes = [{ id: "string-pdf", name: "Letter string", kind: "led_string", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    const pdf = createLedStringBomPdf("Demo project", "Normal operation", buildLedStringBom(document));
    assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
    assert.match(pdf.toString("latin1"), /ILUMINATE - LED STRING BOM/);
    assert.match(pdf.toString("latin1"), /Letter string/);
    assert.match(pdf.toString("latin1"), /%%EOF/);
  });
});
