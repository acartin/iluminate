import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import paper from "paper";
import type { DesignerChannelForm } from "../../../lib/lighting/partitura-model";
import { DESIGNER_SCHEMA_VERSION, canonicalizeDesignerGeometry, createDefaultOpticalTreatment, createDefaultPartituraDocument, nextEmptyClipLayer, normalizeDefaultSignLayout, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry, wouldCreateDesignerDerivedGeometryCycle, wouldCreateDesignerProjectionCycle } from "../../../lib/lighting/partitura-model";
import { filletDesignerGeometry, offsetDesignerGeometry } from "../../../lib/lighting/designer-derived-geometry";
import { DEFAULT_DESIGNER_FONT_ID, designerFontResource } from "../../../lib/lighting/designer-font-catalog";
import { designerTextToGeometry } from "../../../lib/lighting/designer-text-geometry";
import { compileDesignerLayout, designerCompileSignature } from "./designer-compiler";
import { geometryToolAllowedOnLayer, geometryToolPolicy } from "./canvas/designer-tool-policy";
import { applyDesignerGeometryCommand } from "./geometry/designer-geometry-commands";
import { applyDesignerBooleanOperation, validateDesignerGeometryTopology } from "./geometry/designer-geometry-boolean";
import { applyFaceGraphicToOpticalMode, applyFaceGraphicTransmission, faceGraphicMaskUv, faceGraphicTransmissionAtPoint, frontMaterialOffStyle, orderOpticalTreatmentsForRendering, registerPixiFrameResource, releasePixiFrameResources, resolvePhysicalFaceGraphics } from "./rendering/designer-player-renderers";
import { requestPlaybackPreview, resolvePlaybackPixels } from "./designer-playback-frame";
import { generateDesignerFabricationExport } from "./fabrication/designer-fabrication-export";
import { designerLayerForSelection, designerSelectionForClipTarget } from "./types";
import {
  channelBorderPolylines,
  channelCenterPolyline,
  channelIsClosed,
  controllerPortPoint,
  detachSolderedRoutePoint,
  distanceToChannelCenter,
  nextDesignerItemNumber,
  pickDesignerHit,
  pickAnimationTarget,
  pointInPolygon,
  pointInsideDesignerShape,
  primitiveShapeBounds,
  moveControllerWithSolderedCables,
  resolveRouteOutputs,
  setChannelNodeType,
  smoothBezierPoints
} from "./designer-geometry";

describe("Layers panel organization", () => {
  it("keeps the natural category order and nests electrical objects under Hardware", async () => {
    const source = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");

    assert.match(source, /label="Artwork"\s+order=\{1\}/);
    assert.match(source, /label="Hardware"\s+order=\{2\}/);
    assert.match(source, /label="Diffusors"\s+order=\{3\}/);
    assert.match(source, /label="Face Graphic"\s+order=\{4\}/);

    const hardwareStart = source.indexOf('label="Hardware"');
    const faceGraphicStart = source.indexOf('label="Face Graphic"', hardwareStart);
    const hardwareSection = source.slice(hardwareStart, faceGraphicStart);
    assert.ok(hardwareStart >= 0 && faceGraphicStart > hardwareStart);
    assert.match(hardwareSection, /label="Strings"\s+order=\{1\}/);
    assert.match(hardwareSection, /label="Data cables"\s+order=\{2\}/);
    assert.match(hardwareSection, /label="Controller"\s+order=\{3\}/);
  });

  it("preserves the canvas layer mapping used by panel and canvas selection", () => {
    assert.equal(designerLayerForSelection({ type: "route", id: "route_1" }), "strings");
    assert.equal(designerLayerForSelection({ type: "controller", id: "controller_1" }), "hardware");
    assert.equal(designerLayerForSelection({ type: "zone", id: "zone_1" }), "zones");
    assert.equal(designerLayerForSelection({ type: "face_graphic", id: "face_graphic_1" }), "faceGraphic");
  });
});

describe("compound paths and boolean operations", () => {
  const rectangle = (id: string, x: number, y: number, width: number, height: number) => ({ id, kind: "rect" as const, x, y, width, height });

  it("subtracts an inner profile as a persistent even-odd hole", () => {
    paper.setup(new paper.Size(200, 200));
    const result = applyDesignerBooleanOperation(paper, [rectangle("outer", 0, 0, 20, 20), rectangle("inner", 5, 5, 10, 10)], "subtract", "result");
    assert.deepEqual(result.issues, []);
    assert.equal(result.geometry?.fillRule, "evenodd");
    assert.equal(result.geometry?.contours?.length, 2);
    const shape = { shape: "polygon" as const, ...result.geometry!, pathMode: result.geometry?.pathMode ?? "straight" };
    assert.equal(pointInsideDesignerShape(shape, { x: 2, y: 2 }), true);
    assert.equal(pointInsideDesignerShape(shape, { x: 10, y: 10 }), false);
  });

  it("supports union, intersect and exclude through the shared geometry engine", () => {
    paper.setup(new paper.Size(200, 200));
    const operands = [rectangle("left", 0, 0, 10, 10), rectangle("right", 5, 0, 10, 10)];
    const union = applyDesignerBooleanOperation(paper, operands, "union", "union");
    const intersect = applyDesignerBooleanOperation(paper, operands, "intersect", "intersect");
    const exclude = applyDesignerBooleanOperation(paper, operands, "exclude", "exclude");
    assert.deepEqual(union.issues, []);
    assert.deepEqual([union.geometry?.x, union.geometry?.width], [0, 15]);
    assert.deepEqual([intersect.geometry?.x, intersect.geometry?.width], [5, 5]);
    assert.equal(exclude.geometry?.contours?.length, 2);
  });

  it("rejects self intersections and duplicate contours before fabrication", () => {
    const bowTie = {
      id: "bow_tie",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }],
      pathMode: "straight" as const,
      closed: true
    };
    assert.deepEqual(validateDesignerGeometryTopology(bowTie), ["self-intersection"]);
    const contour = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], pathMode: "straight" as const, closed: true as const };
    assert.deepEqual(validateDesignerGeometryTopology({ ...bowTie, points: contour.points, contours: [contour, contour] }), ["duplicate-contour"]);
  });

  it("round-trips compound contours through canonical document normalization", () => {
    const document = createDefaultPartituraDocument("compound_roundtrip");
    const contour = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], pathMode: "straight" as const, closed: true as const };
    const hole = { points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], pathMode: "straight" as const, closed: true as const };
    document.designer.faceGraphics = [{ id: "mask", name: "Mask", shape: "polygon", x: 0, y: 0, width: 20, height: 20, points: contour.points, contours: [contour, hole], fillRule: "evenodd", pathMode: "straight", passMode: "opaque", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    document.designer = canonicalizeDesignerGeometry(document.designer);
    const normalized = normalizeDefaultSignLayout(document).designer;
    assert.equal(normalized.faceGraphics[0].contours?.length, 2);
    assert.equal(normalized.geometries?.find((geometry) => geometry.id === normalized.faceGraphics[0].geometryId)?.contours?.length, 2);
  });

  it("invalidates zone compilation for contour changes and reports invalid topology", () => {
    const designer = createDefaultPartituraDocument("compound_compile").designer;
    const before = designerCompileSignature(designer);
    const zone = designer.zones[0];
    zone.shape = "polygon";
    zone.points = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }];
    zone.pathMode = "straight";
    const after = designerCompileSignature(designer);
    assert.notEqual(after, before);
    assert.ok(compileDesignerLayout(designer).validation.errors.some((error) => error.includes("self intersection")));
  });
});

describe("parametric offset and fillet operations", () => {
  const rectangle = { id: "rectangle", kind: "rect" as const, x: 0, y: 0, width: 10, height: 8 };

  it("offsets a closed profile outward and inward with explicit join behavior", () => {
    const outward = offsetDesignerGeometry(rectangle, 10, "miter", 4, "outward");
    const inward = offsetDesignerGeometry(rectangle, -10, "miter", 4, "inward");
    assert.equal(outward.issue, null);
    assert.deepEqual([outward.geometry?.x, outward.geometry?.y, outward.geometry?.width, outward.geometry?.height], [-1, -1, 12, 10]);
    assert.deepEqual([inward.geometry?.x, inward.geometry?.y, inward.geometry?.width, inward.geometry?.height], [1, 1, 8, 6]);
  });

  it("offsets an open path without inventing a closing segment", () => {
    const open = { id: "open", kind: "path" as const, x: 0, y: 0, width: 10, height: 5, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 5 }], pathMode: "straight" as const, closed: false };
    const result = offsetDesignerGeometry(open, 10, "miter", 4, "open_offset");
    assert.equal(result.issue, null);
    assert.equal(result.geometry?.closed, false);
    assert.equal(result.geometry?.points?.length, 3);
  });

  it("preserves compound holes and reports a collapsed inward offset", () => {
    const outer = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], pathMode: "straight" as const, closed: true as const };
    const hole = { points: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], pathMode: "straight" as const, closed: true as const };
    const compound = { id: "compound", kind: "path" as const, x: 0, y: 0, width: 20, height: 20, points: outer.points, contours: [outer, hole], pathMode: "straight" as const, closed: true, fillRule: "evenodd" as const };
    const expanded = offsetDesignerGeometry(compound, 10, "miter", 4, "expanded");
    assert.equal(expanded.issue, null);
    assert.equal(expanded.geometry?.contours?.length, 2);
    assert.deepEqual([expanded.geometry?.x, expanded.geometry?.width], [-1, 22]);
    assert.equal(offsetDesignerGeometry(rectangle, -50, "round", 4).issue, "collapsed");
  });

  it("fillets selected corners and clamps radii that exceed neighboring legs", () => {
    const selected = filletDesignerGeometry(rectangle, 20, [0], "selected_fillet");
    const clamped = filletDesignerGeometry(rectangle, 100, undefined, "clamped_fillet");
    assert.equal(selected.issue, null);
    assert.ok((selected.geometry?.points?.length ?? 0) > 4);
    assert.ok(clamped.warnings.some((warning) => warning.includes("clamped")));
  });

  it("recalculates a projection-offset-fillet chain and rejects dependency cycles", () => {
    const designer = createDefaultPartituraDocument("derived_chain").designer;
    const source = designer.zones[0];
    designer.projections = [{ id: "projection_1", name: "Projection", geometryId: "geometry_projection_1", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: true }];
    designer.derivedGeometries = [
      { id: "derived_1", name: "Offset", geometryId: "geometry_derived_1", sourceGeometryId: "geometry_projection_1", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, visible: true },
      { id: "derived_2", name: "Fillet", geometryId: "geometry_derived_2", sourceGeometryId: "geometry_derived_1", targetLayer: "faceGraphic", operation: "fillet", radiusMm: 2, visible: true }
    ];
    const before = resolveDesignerDerivedGeometry(designer, "derived_2");
    source.x += 8;
    source.points = source.points?.map((point) => ({ ...point, x: point.x + 8 }));
    designer.geometries = canonicalizeDesignerGeometry(designer).geometries;
    const after = resolveDesignerDerivedGeometry(designer, "derived_2");
    assert.equal(before.issue, null);
    assert.equal(after.issue, null);
    assert.equal(Math.round((after.geometry!.x - before.geometry!.x) * 100) / 100, 8);
    assert.equal(wouldCreateDesignerDerivedGeometryCycle(designer, "derived_1", "geometry_derived_2"), true);
  });
});

describe("controlled text and deterministic outlines", () => {
  async function controlledFont() {
    const resource = designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    const buffer = await readFile(`node_modules/@fontsource/roboto/files/${resource.fileName}`);
    return { resource, data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  }

  it("persists editable typography against a stable catalog resource", () => {
    const document = createDefaultPartituraDocument("text_roundtrip");
    const resource = designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    document.designer.texts = [{ id: "text_1", name: "Logo", text: "ILUMINATE", fontId: resource.id, fontHash: resource.hash, fontSizeMm: 42, trackingMm: 0.5, lineHeight: 1.2, alignment: "center", x: 50, y: 8, targetLayer: "faceGraphic", visible: true, locked: false, opacity: 1 }];
    const normalized = normalizeDefaultSignLayout(document).designer.texts[0];
    assert.deepEqual([normalized.text, normalized.fontId, normalized.fontHash, normalized.targetLayer], ["ILUMINATE", resource.id, resource.hash, "faceGraphic"]);
  });

  it("produces identical compound Bezier geometry and preserves glyph holes", async () => {
    const { resource, data } = await controlledFont();
    const text = { id: "text_1", name: "Outline", text: "BO", fontId: resource.id, fontHash: resource.hash, fontSizeMm: 40, trackingMm: 1, lineHeight: 1.2, alignment: "left" as const, x: 10, y: 5, targetLayer: "zones" as const, visible: true, locked: false, opacity: 1 };
    const first = designerTextToGeometry(text, data, "outline");
    const second = designerTextToGeometry(JSON.parse(JSON.stringify(text)), data.slice(0), "outline");
    assert.deepEqual(second, first);
    assert.equal(first?.kind, "path");
    assert.equal(first?.fillRule, "evenodd");
    assert.ok((first?.contours?.length ?? 0) >= 5);
    assert.ok(first?.contours?.some((contour) => contour.points.some((point) => point.handleIn || point.handleOut)));
  });

  it("lays out multiline text with tracking and alignment in manufacturing units", async () => {
    const { resource, data } = await controlledFont();
    const base = { id: "text_2", name: "Multiline", text: "AB\nA", fontId: resource.id, fontHash: resource.hash, fontSizeMm: 20, trackingMm: 0, lineHeight: 1.5, alignment: "left" as const, x: 20, y: 10, targetLayer: "reference" as const, visible: true, locked: false, opacity: 1 };
    const normal = designerTextToGeometry(base, data, "normal")!;
    const tracked = designerTextToGeometry({ ...base, trackingMm: 3, alignment: "center" }, data.slice(0), "tracked")!;
    assert.ok(normal.height > 3);
    assert.ok(tracked.width > normal.width);
    assert.ok(tracked.x < normal.x);
  });
});

describe("fabrication SVG and DXF export", () => {
  it("emits path-only SVG at explicit 1:1 millimeter scale and groups Face Graphic material", async () => {
    const document = createDefaultPartituraDocument("fabrication_project");
    if (!document.designer) assert.fail("default designer missing");
    document.designer.faceGraphics = [{ id: "red_vinyl", name: "Red vinyl", shape: "rect", x: 10, y: 5, width: 20, height: 10, passMode: "translucent", filterColor: "#FF0000", visible: false, locked: false, opacity: 0.2 }];
    const result = await generateDesignerFabricationExport({
      designer: canonicalizeDesignerGeometry(document.designer),
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "fabrication", partituraName: "Fabrication" },
      sourceDocument: document,
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.match(result.svg, /width="1700mm" height="400mm" viewBox="0 0 1700 400"/);
    assert.match(result.svg, /data-operation="FACE_TRANSLUCENT_FF0000"/);
    assert.match(result.svg, /data-pass-mode="translucent" data-filter-color="#FF0000"/);
    assert.match(result.svg, /<metadata>.*sha256:/);
    assert.doesNotMatch(result.svg, /<(rect|ellipse|text|image|polyline)\b/);
    assert.doesNotMatch(result.svg, /led_string|controller/i);
  });

  it("outlines controlled editable text during export without mutating it", async () => {
    const document = createDefaultPartituraDocument("fabrication_text");
    if (!document.designer) assert.fail("default designer missing");
    const resource = designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    const buffer = await readFile(`node_modules/@fontsource/roboto/files/${resource.fileName}`);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    document.designer.buildAreas = [];
    document.designer.zones = [];
    document.designer.channels = [];
    document.designer.texts = [{ id: "text_logo", name: "Logo", text: "BO", fontId: resource.id, fontHash: resource.hash, fontSizeMm: 40, trackingMm: 1, lineHeight: 1.2, alignment: "left", x: 10, y: 5, targetLayer: "faceGraphic", visible: true, locked: false, opacity: 1 }];
    const result = await generateDesignerFabricationExport({
      designer: document.designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "text", partituraName: "Text" },
      sourceDocument: document,
      fontDataById: new Map([[resource.id, data]]),
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
    assert.match(result.svg, /id="text_logo"/);
    assert.match(result.svg, /fill-rule="evenodd"/);
    assert.doesNotMatch(result.svg, /<text\b/);
    assert.equal(document.designer.texts.length, 1);
  });

  it("emits metric DXF layers and deterministic closed polylines", async () => {
    const document = createDefaultPartituraDocument("fabrication_dxf");
    if (!document.designer) assert.fail("default designer missing");
    document.designer.buildAreas = [];
    document.designer.channels = [];
    document.designer.faceGraphics = [{ id: "clear", name: "Clear", shape: "ellipse", x: 1, y: 2, width: 5, height: 3, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    const result = await generateDesignerFabricationExport({
      designer: canonicalizeDesignerGeometry(document.designer),
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "dxf", partituraName: "DXF" },
      sourceDocument: document,
      options: { includeReference: false, includeZones: false, flattenToleranceMm: 0.05 },
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.match(result.dxf, /\n\$INSUNITS\n70\n4\n/);
    assert.match(result.dxf, /\nLAYER\n2\nFACE_CLEAR\n/);
    assert.match(result.dxf, /\nLWPOLYLINE\n/);
    assert.match(result.dxf, /\n70\n1\n/);
    const repeated = await generateDesignerFabricationExport({ designer: document.designer, identity: { projectId: document.projectId, partituraId: "1", partituraKey: "dxf", partituraName: "DXF" }, sourceDocument: document, options: { includeReference: false, includeZones: false, flattenToleranceMm: 0.05 }, generatedAt: "2026-10-06T12:00:00.000Z" });
    assert.equal(repeated.dxf, result.dxf);
  });

  it("exports resolved live derived profiles but excludes linked construction projections", async () => {
    const document = createDefaultPartituraDocument("fabrication_derived");
    if (!document.designer) assert.fail("default designer missing");
    const source = document.designer.zones[0];
    document.designer.projections = [{ id: "projection_cut", name: "Construction projection", geometryId: "geometry_projection_cut", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: true }];
    document.designer.derivedGeometries = [{ id: "derived_cut", name: "Cut offset", geometryId: "geometry_derived_cut", sourceGeometryId: "geometry_projection_cut", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FF0000", visible: true }];
    const result = await generateDesignerFabricationExport({
      designer: document.designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "derived", partituraName: "Derived" },
      sourceDocument: document,
      options: { includeReference: false, includeZones: false, includeFaceGraphic: true },
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.match(result.svg, /id="derived_cut"/);
    assert.match(result.svg, /data-filter-color="#FF0000"/);
    assert.match(result.dxf, /FACE_TRANSLUCENT_FF0000/);
    assert.doesNotMatch(result.svg, /id="projection_cut"/);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  });

  it("blocks unresolved text and invalid profiles while warning outside the fabrication area", async () => {
    const document = createDefaultPartituraDocument("fabrication_validation");
    if (!document.designer) assert.fail("default designer missing");
    const resource = designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    document.designer.buildAreas = [];
    document.designer.channels = [];
    document.designer.zones = [{ id: "bad", name: "Bad profile", shape: "polygon", x: -2, y: 0, width: 12, height: 10, points: [{ x: -2, y: 0 }, { x: 10, y: 10 }, { x: -2, y: 10 }, { x: 10, y: 0 }], pathMode: "straight", visible: true, locked: false, opacity: 1 }];
    document.designer.texts = [{ id: "missing_font", name: "Missing font", text: "A", fontId: resource.id, fontHash: resource.hash, fontSizeMm: 20, trackingMm: 0, lineHeight: 1.2, alignment: "left", x: 1, y: 1, targetLayer: "zones", visible: true, locked: false, opacity: 1 }];
    const result = await generateDesignerFabricationExport({ designer: canonicalizeDesignerGeometry(document.designer), identity: { projectId: document.projectId, partituraId: "1", partituraKey: "bad", partituraName: "Bad" }, sourceDocument: document });
    assert.ok(result.issues.some((issue) => issue.code === "self-intersection" && issue.severity === "error"));
    assert.ok(result.issues.some((issue) => issue.code === "unresolved-font" && issue.severity === "error"));
    assert.ok(result.issues.some((issue) => issue.code === "outside-fabrication-area" && issue.severity === "warning"));
  });
});

describe("primitive drag creation", () => {
  it("generates a new zone suffix from existing IDs instead of array length", () => {
    assert.equal(nextDesignerItemNumber([{ id: "zone_2" }, { id: "zone_8" }, { id: "zone_9" }], "zone_"), 10);
  });

  it("normalizes a reverse drag into positive bounds", () => {
    assert.deepEqual(
      primitiveShapeBounds({ x: 12, y: 9 }, { x: 4, y: 3 }, 1),
      { x: 4, y: 3, width: 8, height: 6 }
    );
  });

  it("uses Ctrl/Command constraint to create a square or circle", () => {
    assert.deepEqual(
      primitiveShapeBounds({ x: 2, y: 2 }, { x: 8, y: 5 }, 1, { preserveAspect: true }),
      { x: 2, y: 2, width: 6, height: 6 }
    );
  });

  it("uses Shift to draw symmetrically from the starting center", () => {
    assert.deepEqual(
      primitiveShapeBounds({ x: 10, y: 10 }, { x: 14, y: 13 }, 1, { fromCenter: true }),
      { x: 6, y: 7, width: 8, height: 6 }
    );
  });
});

describe("canonical designer geometry schema", () => {
  it("migrates a legacy document without losing editable shapes", () => {
    const legacy = createDefaultPartituraDocument();
    if (!legacy.designer) assert.fail("default designer missing");
    delete legacy.designer.designerSchemaVersion;
    delete legacy.designer.geometries;
    legacy.designer.zones[0].geometryId = undefined;

    const normalized = normalizeDefaultSignLayout(legacy).designer;
    assert.equal(normalized?.designerSchemaVersion, DESIGNER_SCHEMA_VERSION);
    assert.equal(normalized?.zones[0].geometryId, "geometry_zone_fondo");
    assert.ok(normalized?.geometries?.some((geometry) => geometry.id === normalized.zones[0].geometryId));
    assert.deepEqual(normalized?.zones[0].points, legacy.designer.zones[0].points);
  });

  it("preserves deliberately empty geometry and wiring collections", () => {
    const document = createDefaultPartituraDocument("empty_authored_state");
    document.designer.zones = [];
    document.designer.routes = [];
    document.designer.lightSources = [];
    document.designer = canonicalizeDesignerGeometry(document.designer);

    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));
    assert.deepEqual(normalized.designer.zones, []);
    assert.deepEqual(normalized.designer.routes, []);
    assert.deepEqual(normalized.designer.lightSources, []);
    assert.deepEqual(normalized.designer.geometries?.filter((geometry) => geometry.id.includes("geometry_zone_")), []);
  });

  it("normalizes a current document idempotently without geometry or wiring loss", () => {
    const document = createDefaultPartituraDocument("current_roundtrip");
    const source = document.designer.zones[0];
    document.designer.faceGraphics = [{ id: "mask", name: "Red mask", shape: "rect", x: 42, y: 2, width: 60, height: 16, passMode: "translucent", filterColor: "#FF0000", visible: true, locked: false, opacity: 1 }];
    document.designer = canonicalizeDesignerGeometry(document.designer);
    document.designer.projections = [{ id: "projection", name: "Projection", geometryId: "geometry_projection", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: true }];
    document.designer.derivedGeometries = [{ id: "offset", name: "Red offset", geometryId: "geometry_offset", sourceGeometryId: "geometry_projection", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FF0000", visible: false }];

    const once = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));
    const twice = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice, once);
    assert.equal(once.designer.routes.length, document.designer.routes.length);
    assert.equal(once.designer.derivedGeometries[0].passMode, "translucent");
    assert.equal(once.designer.derivedGeometries[0].filterColor, "#FF0000");
  });

  it("treats persisted canonical geometry as authoritative on load", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer?.geometries) assert.fail("canonical geometry missing");
    const zone = document.designer.zones[0];
    const geometry = document.designer.geometries.find((entry) => entry.id === zone.geometryId);
    if (!geometry?.points) assert.fail("zone path geometry missing");
    geometry.points = geometry.points.map((point) => ({ ...point, x: point.x + 7 }));
    geometry.x += 7;
    zone.x = -999;

    const normalized = normalizeDefaultSignLayout(document).designer;
    assert.equal(normalized?.zones[0].x, geometry.x);
    assert.deepEqual(normalized?.zones[0].points, geometry.points);
  });

  it("commits compatibility-view edits through one canonical boundary", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const editedX = document.designer.zones[1].x + 3;
    const edited = canonicalizeDesignerGeometry({
      ...document.designer,
      zones: document.designer.zones.map((zone, index) => index === 1 ? { ...zone, x: editedX } : zone)
    });
    const geometry = edited.geometries?.find((entry) => entry.id === edited.zones[1].geometryId);
    assert.equal(geometry?.x, editedX);
  });

  it("applies geometry commands without layer semantics", () => {
    const moved = applyDesignerGeometryCommand(
      { id: "g", kind: "rect", x: 1, y: 2, width: 3, height: 4 },
      { type: "move", dx: 5, dy: -1 }
    );
    assert.deepEqual({ x: moved.x, y: moved.y }, { x: 6, y: 1 });
  });
});

describe("shared geometry tool policy", () => {
  it("maps semantic toolbar tools onto one geometry vocabulary", () => {
    assert.deepEqual(geometryToolPolicy("build_area_bezier")?.mode, "bezier");
    assert.equal(geometryToolPolicy("zone_rect")?.shape, "rect");
    assert.equal(geometryToolPolicy("channel_bezier")?.target, "channel");
    assert.equal(geometryToolPolicy("led_string"), null);
  });

  it("keeps layer permissions outside the geometry engine", () => {
    assert.equal(geometryToolAllowedOnLayer("build_area_rect", "reference"), true);
    assert.equal(geometryToolAllowedOnLayer("build_area_rect", "zones"), false);
    assert.equal(geometryToolAllowedOnLayer("zone_bezier", "zones"), true);
  });
});

describe("Face Graphic authoring", () => {
  it("migrates legacy documents to an empty visible Face Graphic layer", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    delete (document.designer as Partial<typeof document.designer>).faceGraphics;
    delete (document.designer.layers as Partial<typeof document.designer.layers>).faceGraphic;
    const normalized = normalizeDefaultSignLayout(document).designer;
    assert.deepEqual(normalized?.faceGraphics, []);
    assert.equal(normalized?.layers.faceGraphic.visible, true);
  });

  it("persists native mask geometry with translucent white defaults", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const designer = canonicalizeDesignerGeometry({
      ...document.designer,
      faceGraphics: [{
        id: "face_graphic_1", name: "Vinyl", shape: "rect", x: 10, y: 5, width: 20, height: 8,
        passMode: "translucent", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1
      }]
    });
    const element = designer.faceGraphics[0];
    assert.equal(element.geometryId, "geometry_face_graphic_face_graphic_1");
    assert.ok(designer.geometries?.some((geometry) => geometry.id === element.geometryId));
    const normalized = normalizeDefaultSignLayout({ ...document, designer }).designer;
    assert.equal(normalized?.faceGraphics[0].passMode, "translucent");
    assert.equal(normalized?.faceGraphics[0].filterColor, "#FFFFFF");
  });

  it("does not affect the electrical compile signature", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const before = designerCompileSignature(document.designer);
    const after = designerCompileSignature(canonicalizeDesignerGeometry({
      ...document.designer,
      faceGraphics: [{
        id: "face_graphic_1", name: "Red vinyl", shape: "ellipse", x: 20, y: 4, width: 12, height: 12,
        passMode: "translucent", filterColor: "#FF0000", visible: true, locked: false, opacity: 1
      }]
    }));
    assert.equal(after, before);
  });

  it("routes every Face Graphic drawing tool through the shared geometry policy", () => {
    for (const tool of ["face_graphic_rect", "face_graphic_ellipse", "face_graphic_polygon", "face_graphic_bezier"] as const) {
      assert.equal(geometryToolPolicy(tool)?.target, "face_graphic");
      assert.equal(geometryToolAllowedOnLayer(tool, "faceGraphic"), true);
      assert.equal(geometryToolAllowedOnLayer(tool, "zones"), false);
    }
  });

  it("maps Face Graphic selection to its dedicated layer", () => {
    assert.equal(designerLayerForSelection({ type: "face_graphic", id: "face_graphic_1" }), "faceGraphic");
  });
});

describe("Face Graphic optical renderer", () => {
  it("releases every temporary Pixi resource exactly once between frames", () => {
    const owner = {};
    const destroyed: string[] = [];
    registerPixiFrameResource(owner, { destroy: () => destroyed.push("blur") });
    registerPixiFrameResource(owner, { destroy: () => destroyed.push("mask") });

    releasePixiFrameResources(owner);
    releasePixiFrameResources(owner);

    assert.deepEqual(destroyed, ["blur", "mask"]);
  });

  it("keeps an unlit Front diffuser black instead of exposing a gray material base", () => {
    assert.deepEqual(frontMaterialOffStyle("silicone"), { color: 0x000000, alpha: 1 });
    assert.deepEqual(frontMaterialOffStyle("milky_white"), { color: 0x000000, alpha: 1 });
    assert.deepEqual(frontMaterialOffStyle("day_night"), { color: 0x171a20, alpha: 0.92 });
  });

  it("implements canonical clear, opaque and translucent color transmission", () => {
    assert.deepEqual(applyFaceGraphicTransmission({ r: 255, g: 255, b: 255 }, "translucent", "#FF0000"), { r: 255, g: 0, b: 0 });
    assert.deepEqual(applyFaceGraphicTransmission({ r: 255, g: 0, b: 0 }, "translucent", "#FF0000"), { r: 255, g: 0, b: 0 });
    assert.deepEqual(applyFaceGraphicTransmission({ r: 0, g: 0, b: 255 }, "translucent", "#FF0000"), { r: 0, g: 0, b: 0 });
    assert.deepEqual(applyFaceGraphicTransmission({ r: 12, g: 34, b: 56 }, "clear"), { r: 12, g: 34, b: 56 });
    assert.deepEqual(applyFaceGraphicTransmission({ r: 12, g: 34, b: 56 }, "opaque"), { r: 0, g: 0, b: 0 });
  });

  it("never applies the Face Graphic pass to Halo or Wall Wash", () => {
    const source = { r: 40, g: 80, b: 120 };
    assert.deepEqual(applyFaceGraphicToOpticalMode(source, "halo", "opaque"), source);
    assert.deepEqual(applyFaceGraphicToOpticalMode(source, "wall_wash", "translucent", "#FF0000"), source);
    assert.deepEqual(applyFaceGraphicToOpticalMode(source, "front", "opaque"), { r: 0, g: 0, b: 0 });
  });

  it("uses front-to-back region order and treats the uncut face as opaque", () => {
    const back = { id: "back", name: "Back", shape: "rect" as const, x: 0, y: 0, width: 20, height: 20, passMode: "clear" as const, filterColor: "#FFFFFF", visible: false, locked: false, opacity: 0 };
    const front = { ...back, id: "front", name: "Front", x: 5, y: 5, width: 5, height: 5, passMode: "translucent" as const, filterColor: "#FF0000" };
    assert.deepEqual(faceGraphicTransmissionAtPoint([front, back], { x: 6, y: 6 }), { passMode: "translucent", filterColor: "#FF0000" });
    assert.deepEqual(faceGraphicTransmissionAtPoint([front, back], { x: 2, y: 2 }), { passMode: "clear", filterColor: "#FFFFFF" });
    assert.deepEqual(faceGraphicTransmissionAtPoint([front], { x: 2, y: 2 }), { passMode: "opaque", filterColor: "#000000" });
    assert.equal(faceGraphicTransmissionAtPoint([], { x: 2, y: 2 }), null);
  });

  it("maps the transmission texture to absolute viewport pixels instead of local front-buffer bounds", () => {
    assert.deepEqual(faceGraphicMaskUv({ x: 0, y: 0 }, { width: 1200, height: 500 }), { x: 0, y: 0 });
    assert.deepEqual(faceGraphicMaskUv({ x: 600, y: 250 }, { width: 1200, height: 500 }), { x: 0.5, y: 0.5 });
    assert.deepEqual(faceGraphicMaskUv({ x: 1200, y: 500 }, { width: 1200, height: 500 }), { x: 1, y: 1 });
  });

  it("resolves live Face Graphic derivations as physical masks independent of editor visibility", () => {
    const designer = createDefaultPartituraDocument("derived_face_graphic_optics").designer;
    const source = designer.zones[0];
    designer.projections = [{ id: "projection", name: "Projection", geometryId: "geometry_projection", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: false }];
    designer.derivedGeometries = [{ id: "red_offset", name: "Red offset", geometryId: "geometry_red_offset", sourceGeometryId: "geometry_projection", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FF0000", visible: false }];

    const physical = resolvePhysicalFaceGraphics(designer);
    assert.equal(physical.length, 1);
    assert.deepEqual(faceGraphicTransmissionAtPoint(physical, { x: source.x + 1, y: source.y + 1 }), { passMode: "translucent", filterColor: "#FF0000" });
    assert.deepEqual(applyFaceGraphicTransmission({ r: 255, g: 255, b: 255 }, physical[0].passMode, physical[0].filterColor), { r: 255, g: 0, b: 0 });
  });
});

describe("associative Project Geometry", () => {
  it("resolves from canonical source geometry and follows source edits", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const source = document.designer.zones[0];
    if (!source.geometryId) assert.fail("zone geometry missing");
    const projected = {
      ...document.designer,
      projections: [{ id: "projection_1", name: "Fondo projection", geometryId: "geometry_projection_projection_1", sourceGeometryId: source.geometryId, targetLayer: "faceGraphic" as const, linked: true as const, visible: true }]
    };
    const before = resolveDesignerProjectionGeometry(projected, "projection_1");
    assert.equal(before.issue, null);
    const moved = canonicalizeDesignerGeometry({ ...projected, zones: projected.zones.map((zone) => zone.id === source.id ? { ...zone, x: zone.x + 9, points: zone.points?.map((point) => ({ ...point, x: point.x + 9 })) } : zone) });
    const after = resolveDesignerProjectionGeometry(moved, "projection_1");
    assert.equal(after.issue, null);
    assert.equal(after.geometry?.x, (before.geometry?.x ?? 0) + 9);
  });

  it("preserves a recoverable broken reference after source deletion", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const sourceGeometryId = document.designer.zones[0].geometryId!;
    const designer = canonicalizeDesignerGeometry({
      ...document.designer,
      zones: document.designer.zones.slice(1),
      projections: [{ id: "projection_1", name: "Broken", geometryId: "geometry_projection_projection_1", sourceGeometryId, targetLayer: "faceGraphic", linked: true, visible: true }]
    });
    assert.equal(resolveDesignerProjectionGeometry(designer, "projection_1").issue, "broken");
    assert.equal(designer.projections[0].sourceGeometryId, sourceGeometryId);
  });

  it("detects and rejects direct or chained dependency cycles", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const sourceGeometryId = document.designer.zones[0].geometryId!;
    const designer = {
      ...document.designer,
      projections: [
        { id: "projection_1", name: "P1", geometryId: "geometry_projection_projection_1", sourceGeometryId, targetLayer: "faceGraphic" as const, linked: true as const, visible: true },
        { id: "projection_2", name: "P2", geometryId: "geometry_projection_projection_2", sourceGeometryId: "geometry_projection_projection_1", targetLayer: "zones" as const, linked: true as const, visible: true }
      ]
    };
    assert.equal(wouldCreateDesignerProjectionCycle(designer, "projection_1", "geometry_projection_projection_2"), true);
    const cyclic = { ...designer, projections: designer.projections.map((projection) => projection.id === "projection_1" ? { ...projection, sourceGeometryId: "geometry_projection_projection_2" } : projection) };
    assert.equal(resolveDesignerProjectionGeometry(cyclic, "projection_1").issue, "cycle");
  });

  it("does not affect electrical compilation", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const before = designerCompileSignature(document.designer);
    const sourceGeometryId = document.designer.zones[0].geometryId!;
    const after = designerCompileSignature({ ...document.designer, projections: [{ id: "projection_1", name: "P1", geometryId: "geometry_projection_projection_1", sourceGeometryId, targetLayer: "faceGraphic", linked: true, visible: true }] });
    assert.equal(after, before);
  });
});

describe("Phase 10 integrated Designer regression", () => {
  it("keeps linked fabrication, optical filtering, electrical compile and save/reload coherent", async () => {
    const document = createDefaultPartituraDocument("phase_10_e2e");
    let designer = document.designer;
    const source = designer.zones[0];
    designer.projections = [{ id: "projection_e2e", name: "Face projection", geometryId: "geometry_projection_e2e", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: true }];
    designer.derivedGeometries = [
      { id: "offset_e2e", name: "Face offset", geometryId: "geometry_offset_e2e", sourceGeometryId: "geometry_projection_e2e", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FF0000", visible: true },
      { id: "fillet_e2e", name: "Face fillet", geometryId: "geometry_fillet_e2e", sourceGeometryId: "geometry_offset_e2e", targetLayer: "faceGraphic", operation: "fillet", radiusMm: 2, passMode: "translucent", filterColor: "#FF0000", visible: true }
    ];

    const compileBefore = compileDesignerLayout(designer);
    assert.deepEqual(compileBefore.validation.errors, []);
    assert.ok(compileBefore.pixelMap.length > 0);
    assert.equal(resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm).get("route_fondo"), 1);
    assert.deepEqual(applyFaceGraphicTransmission({ r: 255, g: 255, b: 255 }, resolvePhysicalFaceGraphics(designer).at(-1)!.passMode, "#FF0000"), { r: 255, g: 0, b: 0 });

    const before = resolveDesignerDerivedGeometry(designer, "fillet_e2e").geometry!;
    designer = canonicalizeDesignerGeometry({
      ...designer,
      zones: designer.zones.map((zone) => zone.id === source.id ? { ...zone, x: zone.x + 5, points: zone.points?.map((point) => ({ ...point, x: point.x + 5 })) } : zone)
    });
    const after = resolveDesignerDerivedGeometry(designer, "fillet_e2e").geometry!;
    assert.equal(Math.round((after.x - before.x) * 100) / 100, 5);

    const saved = normalizeDefaultSignLayout(JSON.parse(JSON.stringify({ ...document, designer })));
    assert.equal(saved.designer.routes.length, designer.routes.length);
    assert.equal(saved.designer.derivedGeometries.length, 2);
    assert.equal(compileDesignerLayout(saved.designer).pixelMap.length, compileBefore.pixelMap.length);

    const exported = await generateDesignerFabricationExport({
      designer: saved.designer,
      identity: { projectId: saved.projectId, partituraId: "1", partituraKey: "phase-10", partituraName: "Phase 10" },
      sourceDocument: saved,
      options: { includeReference: false, includeZones: false, includeFaceGraphic: true },
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.equal(exported.issues.some((issue) => issue.severity === "error"), false);
    assert.match(exported.svg, /FACE_TRANSLUCENT_FF0000/);
    assert.match(exported.dxf, /FACE_TRANSLUCENT_FF0000/);

    const detached = detachSolderedRoutePoint(saved.designer.routes, saved.designer.controller, "data_feed_1", 0, saved.designer.snapCm);
    const detachedDesigner = { ...saved.designer, routes: detached.routes };
    assert.ok(compileDesignerLayout(detachedDesigner).validation.errors.some((error) => error.includes("No controller output")));
    assert.equal(resolveDesignerDerivedGeometry(detachedDesigner, "fillet_e2e").issue, null);
  });

  it("moves a controller's soldered cable without changing downstream serial order", () => {
    const designer = createDefaultPartituraDocument("controller_move_regression").designer;
    const originalController = { ...designer.controller };
    const originalRoutes = JSON.parse(JSON.stringify(designer.routes));
    const nextController = { ...designer.controller, x: designer.controller.x + 2, y: designer.controller.y + 2 };
    const moved = moveControllerWithSolderedCables(designer, originalController, nextController, originalRoutes, designer.snapCm);
    const movedPort = controllerPortPoint(nextController, 0, designer.snapCm);

    assert.deepEqual(moved.routes.find((route) => route.id === "data_feed_1")?.points[0], { ...movedPort, joint: true });
    assert.equal(resolveRouteOutputs(moved.controller, moved.routes, moved.snapCm).get("route_fondo"), 1);
    assert.deepEqual(compileDesignerLayout(moved).pixelMap.map((pixel) => pixel.serialIndex), compileDesignerLayout(designer).pixelMap.map((pixel) => pixel.serialIndex));
  });
});

describe("timeline clip placement", () => {
  it("uses the last completely empty track", () => {
    assert.equal(nextEmptyClipLayer({ laneCount: 4, clips: [
      { id: "a", name: "A", target: "full_sign", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: {} },
      { id: "b", name: "B", target: "full_sign", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 2, params: {} }
    ] }), 3);
  });

  it("adds a new final track when every track is occupied", () => {
    assert.equal(nextEmptyClipLayer({ laneCount: 2, clips: [
      { id: "a", name: "A", target: "full_sign", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: {} },
      { id: "b", name: "B", target: "full_sign", effect: "solid", blend: "replace", startMs: 1000, durationMs: 1000, layer: 1, params: {} }
    ] }), 2);
  });
});

describe("animation frame playback", () => {
  it("renders a missing clip preview as an explicit off frame instead of gray unmapped pixels", () => {
    assert.deepEqual(resolvePlaybackPixels(undefined, [
      { output: 1, serialIndex: 0 },
      { output: 2, serialIndex: 4 }
    ]), [
      { output: 1, serialIndex: 0, color: { r: 0, g: 0, b: 0 } },
      { output: 2, serialIndex: 4, color: { r: 0, g: 0, b: 0 } }
    ]);

    const wipeFrame = [{ output: 1, serialIndex: 0, color: { r: 0, g: 4, b: 15 } }];
    assert.equal(resolvePlaybackPixels(wipeFrame, [{ output: 1, serialIndex: 0 }]), wipeFrame);
  });

  it("recovers after a transient frame request failure and accepts the next clip frame", async () => {
    const failed = await requestPlaybackPreview(async () => {
      throw new Error("temporary frame failure");
    });
    const recovered = await requestPlaybackPreview(async () => ({
      ok: true,
      preview: { timeMs: 500, pixels: [{ output: 1, serialIndex: 0, color: { r: 12, g: 237, b: 39 } }] }
    }));

    assert.equal(failed, null);
    assert.deepEqual(recovered, {
      timeMs: 500,
      pixels: [{ output: 1, serialIndex: 0, color: { r: 12, g: 237, b: 39 } }]
    });
  });
});

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
];

function closedBezierChannel(): DesignerChannelForm {
  return {
    id: "channel_test",
    name: "Channel test",
    points: smoothBezierPoints(square),
    pathMode: "bezier",
    widthMm: 10,
    closed: true,
    cap: "butt",
    visible: true,
    locked: false,
    opacity: 1
  };
}

describe("closed channel geometry", () => {
  it("stays closed while every Bezier node is converted to a corner or straight node", () => {
    for (const nodeType of ["corner", "straight"] as const) {
      let channel = closedBezierChannel();

      for (let index = 0; index < channel.points.length; index += 1) {
        channel = setChannelNodeType(channel, index, nodeType);
        assert.equal(channelIsClosed(channel), true);

        const center = channelCenterPolyline(channel);
        assert.ok(center.length >= 4);
        assert.notDeepEqual(center.at(-1), center[0]);

        const borders = channelBorderPolylines(channel);
        assert.equal(borders.left.length, center.length);
        assert.equal(borders.right.length, center.length);
      }

      assert.deepEqual(channelCenterPolyline(channel), square);
      assert.ok(Math.abs(distanceToChannelCenter(channel, { x: 0, y: 5 })) < 1e-8);
    }
  });

  it("does not invent a closing edge for an open channel", () => {
    const channel = { ...closedBezierChannel(), points: square, closed: false };
    assert.equal(channelIsClosed(channel), false);
    assert.ok(Math.abs(distanceToChannelCenter(channel, { x: 0, y: 5 }) - 5) < 1e-8);
  });

  it("migrates legacy cap=closed documents to the explicit topology flag", () => {
    const document = createDefaultPartituraDocument("legacy_channel_test");
    document.designer!.channels = [{
      ...closedBezierChannel(),
      closed: undefined,
      cap: "closed"
    } as unknown as DesignerChannelForm];

    const [channel] = normalizeDefaultSignLayout(document).designer.channels;
    assert.equal(channel.closed, true);
    assert.equal(channel.cap, "butt");
  });
});

describe("animation target picking", () => {
  it("selects a visible channel before an overlapping filled zone", () => {
    const document = createDefaultPartituraDocument("animation_hit_test");
    const designer = document.designer!;
    designer.zones = [{
      id: "zone_behind",
      name: "Zone behind",
      shape: "rect",
      x: -2,
      y: -2,
      width: 14,
      height: 14,
      visible: true,
      locked: false,
      opacity: 1
    }];
    designer.channels = [closedBezierChannel()];

    assert.deepEqual(pickAnimationTarget(designer, { x: 0, y: 0 }, 0.1), {
      type: "channel",
      id: "channel_test"
    });
    assert.deepEqual(pickAnimationTarget(designer, { x: 5, y: 5 }, 0.1), {
      type: "zone",
      id: "zone_behind"
    });
  });
});

describe("timeline clip target selection", () => {
  it("resolves a light-source clip to its owning zone", () => {
    const designer = createDefaultPartituraDocument("clip_source_selection").designer!;
    designer.zones = [{ id: "zone_logo", name: "Logo", shape: "rect", x: 0, y: 0, width: 10, height: 10, visible: true, locked: false, opacity: 1 }];
    designer.lightSources = [{
      ...createDefaultOpticalTreatment("zone", "zone_logo", "halo"),
      id: "source_logo_halo"
    }];

    assert.deepEqual(designerSelectionForClipTarget(designer, "source_logo_halo"), { type: "zone", id: "zone_logo" });
  });

  it("keeps direct channel targets selectable", () => {
    const designer = createDefaultPartituraDocument("clip_channel_selection").designer!;
    designer.channels = [closedBezierChannel()];

    assert.deepEqual(designerSelectionForClipTarget(designer, "channel_test"), { type: "channel", id: "channel_test" });
  });
});

describe("designer layer selection", () => {
  it("allows inspecting a visible object on an active locked layer", () => {
    const designer = createDefaultPartituraDocument("locked_layer_hit_test").designer!;
    designer.layers.artwork = { ...designer.layers.artwork, visible: true, locked: true };
    designer.buildAreas = [];
    designer.artwork = [{
      id: "artwork_locked",
      assetId: "",
      name: "Locked artwork",
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      visible: true,
      locked: false,
      opacity: 1
    }];

    assert.deepEqual(
      pickDesignerHit(designer, "artwork", { x: 15, y: 15 }, { x: 0, y: 0, width: 100, height: 50 }, { width: 1000, height: 500 }),
      { type: "artwork", id: "artwork_locked" }
    );
  });

  it("keeps hidden layers out of canvas hit testing", () => {
    const designer = createDefaultPartituraDocument("hidden_layer_hit_test").designer!;
    designer.layers.artwork = { ...designer.layers.artwork, visible: false, locked: false };
    designer.buildAreas = [];
    designer.artwork = [{
      id: "artwork_hidden",
      assetId: "",
      name: "Hidden artwork",
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      visible: true,
      locked: false,
      opacity: 1
    }];

    assert.equal(
      pickDesignerHit(designer, "artwork", { x: 15, y: 15 }, { x: 0, y: 0, width: 100, height: 50 }, { width: 1000, height: 500 }),
      null
    );
  });
});

describe("polygon containment", () => {
  it("preserves the direction of descending sloped edges", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ];

    assert.equal(pointInPolygon({ x: 2, y: 2 }, triangle), true);
    assert.equal(pointInPolygon({ x: 8, y: 8 }, triangle), false);
  });
});

describe("detaching solder joints", () => {
  it("detaches a data cable from a controller without deleting the cable", () => {
    const designer = createDefaultPartituraDocument("detach_controller_cable").designer!;
    const port = controllerPortPoint(designer.controller, 0, designer.snapCm);
    designer.routes = [{
      id: "cable_1",
      name: "Cable 1",
      kind: "data_cable",
      points: [{ ...port, joint: true }, { x: port.x + 10, y: port.y }]
    }];

    const result = detachSolderedRoutePoint(designer.routes, designer.controller, "cable_1", 0, designer.snapCm);

    assert.equal(result.changed, true);
    assert.equal(result.routes.length, 1);
    assert.equal(result.routes[0].points.length, 2);
    assert.equal(result.routes[0].points[0].joint, false);
  });

  it("detaches cable and string terminals while preserving both routes", () => {
    const designer = createDefaultPartituraDocument("detach_cable_string").designer!;
    designer.routes = [
      { id: "cable_1", name: "Cable 1", kind: "data_cable", points: [{ x: 0, y: 0 }, { x: 10, y: 0, joint: true }] },
      { id: "string_1", name: "String 1", kind: "led_string", points: [{ x: 10, y: 0, joint: true }, { x: 20, y: 0 }] }
    ];

    const result = detachSolderedRoutePoint(designer.routes, designer.controller, "string_1", 0, designer.snapCm);

    assert.equal(result.routes.length, 2);
    assert.equal(result.routes[0].points.at(-1)?.joint, false);
    assert.equal(result.routes[1].points[0].joint, false);
  });

  for (const kind of ["data_cable", "led_string"] as const) {
    it(`splits a merged ${kind} joint back into two complete routes`, () => {
      const designer = createDefaultPartituraDocument(`detach_merged_${kind}`).designer!;
      designer.routes = [{
        id: "merged_route",
        name: "Merged route",
        kind,
        points: [{ x: 0, y: 0 }, { x: 10, y: 0, joint: true }, { x: 20, y: 0 }]
      }];

      const result = detachSolderedRoutePoint(designer.routes, designer.controller, "merged_route", 1, designer.snapCm);

      assert.equal(result.routes.length, 2);
      assert.deepEqual(result.routes.map((route) => route.points.length), [2, 2]);
      assert.equal(result.routes[0].points.at(-1)?.joint, false);
      assert.equal(result.routes[1].points[0].joint, false);
      assert.deepEqual(result.routes[0].points.at(-1), result.routes[1].points[0]);
    });
  }
});

describe("physical light mounts", () => {
  it("renders rear illumination before front-face illumination regardless of saved order", () => {
    const front = createDefaultOpticalTreatment("zone", "zone_test", "front");
    const halo = createDefaultOpticalTreatment("zone", "zone_test", "halo");
    const wallWash = createDefaultOpticalTreatment("zone", "zone_test", "wall_wash");

    assert.deepEqual(
      orderOpticalTreatmentsForRendering([front, halo, wallWash]).map((treatment) => treatment.mode),
      ["halo", "wall_wash", "front"]
    );
  });

  it("persists normalized Halo-Lit settings without changing the physical compile signature", () => {
    const document = createDefaultPartituraDocument("optics_test");
    const baseline = normalizeDefaultSignLayout(document);
    baseline.designer.lightSources = [{
      ...createDefaultOpticalTreatment("zone", "letra_1", "halo"),
      stringIds: ["route_letras"]
    }];
    const before = designerCompileSignature(baseline.designer);
    baseline.designer.lightSources = [{
      ...baseline.designer.lightSources[0],
      spreadCm: 7.5,
      receiverType: "build_area",
      receiverId: "build_area_main"
    }];

    const normalized = normalizeDefaultSignLayout(baseline).designer;
    assert.equal(normalized.lightSources[0].mode, "halo");
    assert.equal(normalized.lightSources[0].spreadCm, 7.5);
    assert.equal(designerCompileSignature(normalized), before);
  });

  it("includes channel geometry in the physical compile signature", () => {
    const document = createDefaultPartituraDocument("channel_signature_test");
    const designer = document.designer!;
    const before = designerCompileSignature(designer);
    designer.channels = [closedBezierChannel()];
    assert.notEqual(designerCompileSignature(designer), before);
  });

  it("allows Front and Halo-Lit to coexist on the same target", () => {
    const document = createDefaultPartituraDocument("combined_mounts_test");
    document.designer!.opticalTreatments = [
      { ...createDefaultOpticalTreatment("zone", "letra_1", "front"), material: "day_night" },
      createDefaultOpticalTreatment("zone", "letra_1", "halo")
    ];

    const treatments = normalizeDefaultSignLayout(document).designer.lightSources;
    assert.deepEqual(treatments.map((treatment) => treatment.mode), ["front", "halo"]);
    assert.equal(new Set(treatments.map((treatment) => treatment.id)).size, 2);
    assert.equal(treatments[0].material, "day_night");
  });

  it("persists physical silicone diffuser parameters", () => {
    const document = createDefaultPartituraDocument("silicone_diffuser_test");
    document.designer!.opticalTreatments = [{
      ...createDefaultOpticalTreatment("channel", "channel_test", "front"),
      material: "silicone",
      sourceDistanceCm: 0.5,
      transmissionPct: 55,
      beamAngleDeg: 115
    }];

    const [treatment] = normalizeDefaultSignLayout(document).designer.lightSources;
    assert.equal(treatment.material, "silicone");
    assert.equal(treatment.sourceDistanceCm, 0.5);
    assert.equal(treatment.transmissionPct, 55);
    assert.equal(treatment.beamAngleDeg, 115);
  });

  it("migrates one legacy zone clip into independent Front and Halo source clips", () => {
    const document = createDefaultPartituraDocument("source_clip_migration");
    document.designer!.opticalTreatments = [
      createDefaultOpticalTreatment("zone", "letra_1", "front"),
      createDefaultOpticalTreatment("zone", "letra_1", "halo")
    ];
    document.scenes = [{
      id: "scene",
      name: "Scene",
      loop: true,
      durationMs: 1000,
      clips: [{ id: "clip", name: "Letter", target: "letra_1", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: { color: "#ffffff" } }]
    }];
    document.activeSceneId = "scene";

    const normalized = normalizeDefaultSignLayout(document);
    assert.equal(normalized.designer.lightSources.length, 2);
    assert.deepEqual(normalized.scenes[0].clips.map((clip) => clip.target), normalized.designer.lightSources.map((source) => source.id));
  });

  it("does not migrate a legacy zone clip into a disabled light source", () => {
    const document = createDefaultPartituraDocument("enabled_source_clip_migration");
    const front = createDefaultOpticalTreatment("zone", "letra_1", "front");
    const halo = { ...createDefaultOpticalTreatment("zone", "letra_1", "halo"), enabled: false };
    document.designer!.opticalTreatments = [front, halo];
    document.scenes = [{
      id: "scene",
      name: "Scene",
      loop: true,
      durationMs: 1000,
      clips: [{ id: "clip", name: "Letter", target: "letra_1", effect: "solid", blend: "replace", startMs: 0, durationMs: 1000, layer: 0, params: { color: "#ffffff" } }]
    }];
    document.activeSceneId = "scene";

    const normalized = normalizeDefaultSignLayout(document);
    assert.deepEqual(normalized.scenes[0].clips.map((clip) => clip.target), [front.id]);
  });

  it("defaults legacy clips to enabled and preserves an explicit mute", () => {
    const document = createDefaultPartituraDocument("clip_enabled_state");
    document.scenes[0].clips[0].enabled = false;
    delete document.scenes[0].clips[1].enabled;

    const normalized = normalizeDefaultSignLayout(document);
    assert.equal(normalized.scenes[0].clips[0].enabled, false);
    assert.equal(normalized.scenes[0].clips[1].enabled, true);
  });
});
