import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import paper from "paper";
import type { VisualShape } from "@iluminate/lighting-core";
import type { ClipForm, DesignerChannelForm } from "../../../lib/lighting/partitura-model";
import { DESIGNER_SCHEMA_VERSION, canonicalizeDesignerGeometry, createDefaultOpticalTreatment, createDefaultPartituraDocument, createNewPartituraDocument, nextEmptyClipLayer, normalizeDefaultSignLayout, resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry, wouldCreateDesignerDerivedGeometryCycle, wouldCreateDesignerProjectionCycle } from "../../../lib/lighting/partitura-model";
import { designerFilletCornerIsEligible, filletDesignerGeometry, filletDesignerGeometryExact, offsetDesignerGeometry } from "../../../lib/lighting/designer-derived-geometry";
import { DEFAULT_DESIGNER_FONT_ID, designerFontResource } from "../../../lib/lighting/designer-font-catalog";
import { designerTextToGeometry } from "../../../lib/lighting/designer-text-geometry";
import { inspectArtworkIntrinsicSize } from "../../../lib/lighting/artwork-intrinsic-size";
import { placeSvgPathCandidates } from "../../../lib/lighting/artwork-svg-zones";
import { compileDesignerLayout, designerCompileSignature } from "./designer-compiler";
import { canvasInteractionSnapCm, CHANNEL_ROUTER_BIT_PRESETS, channelWidthForRouterDiameter, geometryToolAllowedOnLayer, geometryToolPolicy, POINTER_DRAG_THRESHOLD_PX, TERMINAL_SOLDER_CAPTURE_RADIUS_PX } from "./canvas/designer-tool-policy";
import { applyDesignerGeometryCommand, applyDesignerNativeFillet } from "./geometry/designer-geometry-commands";
import { applyDesignerBooleanOperation, validateDesignerGeometryTopology } from "./geometry/designer-geometry-boolean";
import { trimDesignerChannelPathAtPoint, trimDesignerPathAtPoint } from "./geometry/designer-path-trim";
import { channelPathsFromGeometries } from "./geometry/designer-channel-from-path";
import { resolveDesignerProjectionGeometry as resolveProjectedGeometry } from "./geometry/designer-projected-geometry";
import { applyFaceGraphicToOpticalMode, applyFaceGraphicTransmission, faceGraphicMaskUv, faceGraphicTransmissionAtPoint, frontMaterialOffStyle, orderOpticalTreatmentsForRendering, resolvePhysicalFaceGraphics } from "../player/optical-model";
import { buildOutlineSegments, faceMaskTextureSize, opticalOccluderShapes, opticalTargetMaskBounds, opticalTargetMaskMode, opticalTargetShape, selectedOutlineShapes, targetMaskTextureSize } from "../player/gpu/webgl2-player-renderer";
import { resolveChannelOutlineContours, sweptChannelOutlineContours } from "./rendering/channel-swept-outline";
import { generateDesignerFabricationExport, sha256Hex } from "./fabrication/designer-fabrication-export";
import { applyFaceGraphicObjectVisibility, faceGraphicObjectKeys, sameFaceGraphicVisibility, visibleFaceGraphicObjectKeys } from "./designer-face-graphic-visibility";
import { applyDiffusorObjectVisibility, diffusorObjectKeys, sameDiffusorVisibility, visibleDiffusorObjectKeys } from "./designer-diffusor-visibility";
import { designerAdditiveSelectionRequested, designerConstrainedMoveDelta, designerLayerForSelection, designerSelectionForClipTarget, designerWholeObjectHit, routeMatchesSurfaceView } from "./types";
import { clipIdForSelectedTargets, clipLightSourcesForTarget, clipScopeTargets, clipTargetsForSelection, designerClipTargetIdsForSelection, explicitClipTargetSelectionSettled } from "./designer-animation-selection";
import {
  channelBorderPolylines,
  channelCenterPolyline,
  channelIsClosed,
  controllerPortPoint,
  canSolderRoutes,
  deleteDesignerRoute,
  designerFilletCornerForHit,
  designerBooleanResultName,
  designerDerivedGeometryName,
  designerProjectionName,
  designerShapePointCount,
  designerShapePointLocation,
  detachSolderedRoutePoint,
  distanceToChannelCenter,
  findJointGroup,
  findMatchingSolderTerminal,
  findNearbySolderTerminal,
  missingWorkLineHolePoints,
  moveDesignerVectorGroupMember,
  movedShape,
  nextDesignerItemNumber,
  pickDesignerHit,
  pickAnimationTarget,
  pickPolygonPointHit,
  pointInPolygon,
  pointInsideDesignerShape,
  primitiveShapeBounds,
  moveControllerWithSolderedCables,
  movedWorkLine,
  resolveRouteOutputs,
  setChannelNodeType,
  setPolygonNodeType,
  smoothBezierPoints,
  smoothOpenBezierPoints,
  shapeInsertIndexAtPoint,
  worldHitTolerance,
  updatePolygonPoint,
  updateWorkLinePoint,
  updatedDesignerOffsetName,
  workLineIntersectionPoints
} from "./designer-geometry";

describe("Layers panel organization", () => {
  it("forwards Ctrl, Command, and Shift row clicks as additive geometry selection", async () => {
    assert.equal(designerAdditiveSelectionRequested({ shiftKey: true, ctrlKey: false, metaKey: false }), true);
    assert.equal(designerAdditiveSelectionRequested({ shiftKey: false, ctrlKey: true, metaKey: false }), true);
    assert.equal(designerAdditiveSelectionRequested({ shiftKey: false, ctrlKey: false, metaKey: true }), true);
    assert.equal(designerAdditiveSelectionRequested({ shiftKey: false, ctrlKey: false, metaKey: false }), false);

    const source = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    for (const type of ["build_area", "zone", "face_graphic", "projection", "derived_geometry"]) {
      assert.match(source, new RegExp(`onSelect\\(\\{ type: "${type}"[\\s\\S]{0,120}designerAdditiveSelectionRequested\\(event\\)`));
      assert.ok(source.includes("selectedGeometryKeys.includes(`" + type + ":${"));
    }
  });

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
    assert.match(hardwareSection, /label="Strings"[\s\S]{0,80}icon=\{Lightbulb\}[\s\S]{0,80}order=\{1\}/);
    assert.match(hardwareSection, /label="Data cables"[\s\S]{0,80}icon=\{Cable\}[\s\S]{0,80}order=\{2\}/);
    assert.match(hardwareSection, /label="Controller"[\s\S]{0,80}icon=\{Cpu\}[\s\S]{0,80}order=\{3\}/);
  });

  it("preserves the canvas layer mapping used by panel and canvas selection", () => {
    assert.equal(designerLayerForSelection({ type: "route", id: "route_1" }), "strings");
    assert.equal(designerLayerForSelection({ type: "controller", id: "controller_1" }), "hardware");
    assert.equal(designerLayerForSelection({ type: "zone", id: "zone_1" }), "zones");
    assert.equal(designerLayerForSelection({ type: "face_graphic", id: "face_graphic_1" }), "faceGraphic");
  });

  it("updates the Hardware master visibility as one atomic layer mutation", async () => {
    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");

    assert.match(panelSource, /onChange=\{\(patch\) => onPatchLayers\(\["strings", "hardware"\], patch\)\}/);
    assert.match(workspaceSource, /function patchDesignerLayers\([\s\S]*?layers\.forEach\([\s\S]*?updateDesigner\(/);
    assert.match(rendererSource, /if \(designer\.layers\.strings\.visible && designer\.layers\.lightSources\.visible\)/);
    assert.doesNotMatch(panelSource, /onPatchLayer\("strings", patch\);\s*onPatchLayer\("hardware", patch\)/);
  });

  it("gives Zones and Channels folders atomic master visibility eyes", async () => {
    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");

    assert.match(panelSource, /label="Zones"[\s\S]{0,220}visible=\{designer\.zones\.every/);
    assert.match(panelSource, /onSetDiffusorFolderVisibility\("zones", !designer\.zones\.every/);
    assert.match(panelSource, /label="Channels"[\s\S]{0,240}visible=\{designer\.channels\.every/);
    assert.match(panelSource, /onSetDiffusorFolderVisibility\("channels", !designer\.channels\.every/);
    assert.match(panelSource, /`Hide all \$\{label\}` : `Show all \$\{label\}`/);
    assert.match(workspaceSource, /function setDiffusorFolderVisibility\([\s\S]*?zones: designer\.zones\.map\(\(zone\) => \(\{ \.\.\.zone, visible \}\)\)[\s\S]*?channels: designer\.channels\.map\(\(channel\) => \(\{ \.\.\.channel, visible \}\)\)/);
  });

  it("uses one color language for visibility and lock states across layer headers and rows", async () => {
    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    assert.match(panelSource, /function layerVisibilityStateClass[\s\S]*?border-blue-300[\s\S]*?text-muted-foreground/);
    assert.match(panelSource, /function layerLockStateClass[\s\S]*?border-red-500[\s\S]*?border-emerald-500/);
    assert.match(panelSource, /layerVisibilityStateClass\(visible !== false\)/);
    assert.match(panelSource, /layerLockStateClass\(locked === true\)/);
    assert.match(panelSource, /layerVisibilityStateClass\(layer\.visible\)/);
    assert.match(panelSource, /layerLockStateClass\(layer\.locked\)/);
  });
});

describe("Face Graphic visibility presets", () => {
  it("captures and applies native, projected, derived, and text object eyes without touching other layers", () => {
    const designer = createDefaultPartituraDocument("face_visibility_presets").designer;
    const sourceGeometryId = designer.zones[0].geometryId!;
    designer.faceGraphics = [{ id: "face_1", name: "Face", shape: "rect", x: 1, y: 1, width: 10, height: 5, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    designer.projections = [
      { id: "projection_face", name: "Face projection", geometryId: "geometry_projection_face", sourceGeometryId, targetLayer: "faceGraphic", linked: true, visible: false },
      { id: "projection_reference", name: "Reference projection", geometryId: "geometry_projection_reference", sourceGeometryId, targetLayer: "reference", linked: true, visible: true }
    ];
    designer.derivedGeometries = [{ id: "derived_face", name: "Face offset", geometryId: "geometry_derived_face", sourceGeometryId, targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, visible: true }];
    designer.texts = [{ id: "text_face", name: "Face text", text: "A", fontId: DEFAULT_DESIGNER_FONT_ID, fontHash: designerFontResource(DEFAULT_DESIGNER_FONT_ID)!.hash, fontSizeMm: 20, trackingMm: 0, lineHeight: 1.2, alignment: "left", x: 1, y: 1, targetLayer: "faceGraphic", visible: false, locked: false, opacity: 1 }];

    assert.deepEqual(faceGraphicObjectKeys(designer), ["faceGraphic:face_1", "projection:projection_face", "derived:derived_face", "text:text_face"]);
    assert.deepEqual(visibleFaceGraphicObjectKeys(designer), ["faceGraphic:face_1", "derived:derived_face"]);
    const applied = applyFaceGraphicObjectVisibility(designer, ["projection:projection_face", "text:text_face"]);
    assert.equal(applied.faceGraphics[0].visible, false);
    assert.equal(applied.projections[0].visible, true);
    assert.equal(applied.projections[1].visible, true);
    assert.equal(applied.derivedGeometries[0].visible, false);
    assert.equal(applied.texts[0].visible, true);
    assert.equal(sameFaceGraphicVisibility(visibleFaceGraphicObjectKeys(applied), ["projection:projection_face", "text:text_face"]), true);
  });

  it("persists custom presets while keeping them outside electrical compilation", () => {
    const baseline = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(createDefaultPartituraDocument("face_visibility_persistence"))));
    const compileBefore = designerCompileSignature(baseline.designer);
    baseline.designer.faceGraphicVisibilityPresets = [{ id: "preset_stencil", name: "Stencil", visibleObjectKeys: ["faceGraphic:letter_u", "derived:u_offset", "derived:u_offset"] }];
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(baseline)));
    assert.deepEqual(normalized.designer.faceGraphicVisibilityPresets, [{ id: "preset_stencil", name: "Stencil", visibleObjectKeys: ["faceGraphic:letter_u", "derived:u_offset"] }]);
    assert.equal(designerCompileSignature(normalized.designer), compileBefore);
  });

  it("keeps the Face Graphic preset bar limited to create, update, delete, and visibility application", async () => {
    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    assert.match(panelSource, /FaceGraphicVisibilityBar[\s\S]*?All on[\s\S]*?All off/);
    assert.match(panelSource, /scopeLabel="Face Graphic"/);
    assert.match(panelSource, /aria-label=\{`Create \$\{scopeLabel\} visibility preset`\}/);
    assert.match(panelSource, /aria-label=\{`Update \$\{scopeLabel\} visibility preset`\}/);
    assert.match(panelSource, /aria-label=\{`Delete \$\{scopeLabel\} visibility preset`\}/);
    assert.match(panelSource, /title="Create visibility preset"/);
    assert.match(panelSource, /title="Delete visibility preset\?"/);
    assert.doesNotMatch(panelSource, /window\.(?:prompt|confirm)/);
  });
});

describe("Diffusors visibility presets", () => {
  it("captures and applies every Diffusors object eye without touching Face Graphic or Reference", () => {
    const designer = createDefaultPartituraDocument("diffusor_visibility_presets").designer;
    const sourceGeometryId = designer.zones[0].geometryId!;
    designer.channels = [{ id: "channel_1", name: "Channel", widthMm: 10, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], pathMode: "straight", closed: false, cap: "round", visible: false, locked: false, opacity: 1 }];
    designer.faceGraphics = [{ id: "face_1", name: "Face", shape: "rect", x: 1, y: 1, width: 10, height: 5, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    designer.projections = [
      { id: "projection_zones", name: "Zone projection", geometryId: "geometry_projection_zones", sourceGeometryId, targetLayer: "zones", linked: true, visible: false },
      { id: "projection_reference", name: "Reference projection", geometryId: "geometry_projection_reference", sourceGeometryId, targetLayer: "reference", linked: true, visible: true }
    ];
    designer.derivedGeometries = [{ id: "derived_zones", name: "Zone offset", geometryId: "geometry_derived_zones", sourceGeometryId, targetLayer: "zones", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, visible: true }];
    designer.texts = [{ id: "text_zones", name: "Zone text", text: "A", fontId: DEFAULT_DESIGNER_FONT_ID, fontHash: designerFontResource(DEFAULT_DESIGNER_FONT_ID)!.hash, fontSizeMm: 20, trackingMm: 0, lineHeight: 1.2, alignment: "left", x: 1, y: 1, targetLayer: "zones", visible: false, locked: false, opacity: 1 }];

    assert.ok(diffusorObjectKeys(designer).includes("channel:channel_1"));
    assert.ok(diffusorObjectKeys(designer).includes("projection:projection_zones"));
    assert.ok(visibleDiffusorObjectKeys(designer).includes("derived:derived_zones"));
    assert.equal(visibleDiffusorObjectKeys(designer).includes("channel:channel_1"), false);
    const applied = applyDiffusorObjectVisibility(designer, ["channel:channel_1", "projection:projection_zones", "text:text_zones"]);
    assert.equal(applied.zones.every((zone) => zone.visible === false), true);
    assert.equal(applied.channels[0].visible, true);
    assert.equal(applied.projections[0].visible, true);
    assert.equal(applied.projections[1].visible, true);
    assert.equal(applied.derivedGeometries[0].visible, false);
    assert.equal(applied.texts[0].visible, true);
    assert.equal(applied.faceGraphics[0].visible, true);
    assert.equal(sameDiffusorVisibility(visibleDiffusorObjectKeys(applied), ["channel:channel_1", "projection:projection_zones", "text:text_zones"]), true);
  });

  it("persists Diffusors presets independently and exposes the same compact manager", async () => {
    const baseline = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(createDefaultPartituraDocument("diffusor_visibility_persistence"))));
    const compileBefore = designerCompileSignature(baseline.designer);
    baseline.designer.faceGraphicVisibilityPresets = [{ id: "face_view", name: "Face", visibleObjectKeys: ["faceGraphic:face_1"] }];
    baseline.designer.diffusorVisibilityPresets = [{ id: "diffusor_view", name: "Routing", visibleObjectKeys: ["zone:zone_1", "channel:channel_1", "faceGraphic:invalid", "zone:zone_1"] }];
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(baseline)));
    assert.deepEqual(normalized.designer.diffusorVisibilityPresets, [{ id: "diffusor_view", name: "Routing", visibleObjectKeys: ["zone:zone_1", "channel:channel_1"] }]);
    assert.deepEqual(normalized.designer.faceGraphicVisibilityPresets, [{ id: "face_view", name: "Face", visibleObjectKeys: ["faceGraphic:face_1"] }]);
    assert.equal(designerCompileSignature(normalized.designer), compileBefore);

    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    assert.match(panelSource, /label="Diffusors"[\s\S]*?<DiffusorVisibilityBar/);
    assert.match(panelSource, /function DiffusorVisibilityBar[\s\S]*?designer\.diffusorVisibilityPresets/);
    assert.match(panelSource, /scopeLabel="Diffusors"[\s\S]*?diffusorObjectKeys\(designer\)[\s\S]*?visibleDiffusorObjectKeys\(designer\)/);
    assert.doesNotMatch(panelSource, /window\.(?:prompt|confirm)/);
  });
});

describe("Face Graphic generated object names", () => {
  it("starts projection, offset, fillet, and boolean names with the source object name", () => {
    assert.equal(designerProjectionName("L"), "L");
    assert.equal(designerDerivedGeometryName("L", "offset", 3), "L offset 3 mm");
    assert.equal(designerDerivedGeometryName("L", "offset", -3.175), "L offset -3.175 mm");
    assert.equal(designerDerivedGeometryName("L", "fillet"), "L fillet");
    assert.equal(updatedDesignerOffsetName("L", "L offset 2 mm", 2, 3), "L offset 3 mm");
    assert.equal(updatedDesignerOffsetName("L", "Custom cut", 2, 3), "Custom cut");
    assert.equal(designerBooleanResultName("L", "subtract"), "L subtract");
    assert.equal(designerBooleanResultName("L", "union"), "L union");
  });

  it("does not rename persisted objects during normalization", () => {
    const document = createDefaultPartituraDocument("existing_face_names");
    const sourceGeometryId = document.designer.zones[0].geometryId!;
    document.designer.projections = [{ id: "projection_1", name: "Existing projection", geometryId: "geometry_projection_1", sourceGeometryId, targetLayer: "faceGraphic", linked: true, visible: true }];
    document.designer.derivedGeometries = [{ id: "derived_1", name: "Existing offset", geometryId: "geometry_derived_1", sourceGeometryId, targetLayer: "faceGraphic", operation: "offset", distanceMm: 3, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FFFFFF", visible: true }];

    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));

    assert.equal(normalized.designer.projections[0].name, "Existing projection");
    assert.equal(normalized.designer.derivedGeometries[0].name, "Existing offset");
  });
});

describe("New partitura document", () => {
  it("starts with only the hardware controller while preserving the demo fixture", () => {
    const document = createNewPartituraDocument("new_project");
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));
    const designer = normalized.designer;

    assert.equal(normalized.projectId, "new_project");
    assert.equal(normalized.scenes.length, 1);
    assert.deepEqual(normalized.scenes[0].clips, []);
    assert.equal(designer.controller.name, "Controller");
    assert.equal(designer.controller.dataOutputs, 3);
    assert.deepEqual(designer.artwork, []);
    assert.equal(designer.workLinesVisible, true);
    assert.deepEqual(designer.workLines, []);
    assert.deepEqual(designer.projections, []);
    assert.deepEqual(designer.derivedGeometries, []);
    assert.deepEqual(designer.texts, []);
    assert.deepEqual(designer.buildAreas, []);
    assert.deepEqual(designer.zones, []);
    assert.deepEqual(designer.faceGraphics, []);
    assert.deepEqual(designer.vectorGroups, []);
    assert.deepEqual(designer.groups, []);
    assert.deepEqual(designer.channels, []);
    assert.deepEqual(designer.lightSources, []);
    assert.deepEqual(designer.routes, []);
    assert.deepEqual(designer.geometries, []);

    const demo = createDefaultPartituraDocument("demo_project");
    assert.ok(demo.scenes.some((scene) => scene.clips.length > 0));
    assert.ok(demo.designer && demo.designer.buildAreas.length > 0);
    assert.ok(demo.designer && demo.designer.zones.length > 0);
    assert.ok(demo.designer && demo.designer.routes.length > 0);
  });

  it("persists same-layer vector groups without changing electrical compilation", () => {
    const document = createDefaultPartituraDocument("vector_groups");
    const designer = document.designer!;
    const [firstZone, secondZone] = designer.zones;
    designer.vectorGroups = [
      { id: "vector_group_1", name: "Letters", members: [{ type: "zone", id: firstZone.id }, { type: "zone", id: secondZone.id }] },
      { id: "vector_group_overlap", name: "Overlap", members: [{ type: "zone", id: firstZone.id }, { type: "zone", id: designer.zones[2].id }] },
      { id: "vector_group_mixed", name: "Mixed", members: [{ type: "zone", id: designer.zones[3].id }, { type: "build_area", id: designer.buildAreas[0].id }] }
    ];
    const withoutGroups = normalizeDefaultSignLayout(JSON.parse(JSON.stringify({ ...document, designer: { ...designer, vectorGroups: [] } }))).designer;
    const compileBefore = designerCompileSignature(withoutGroups);
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document))).designer;

    assert.deepEqual(normalized.vectorGroups, [designer.vectorGroups[0]]);
    assert.equal(designerCompileSignature(normalized), compileBefore);
    assert.equal(normalized.designerSchemaVersion, DESIGNER_SCHEMA_VERSION);

    const movedFirst = movedShape(normalized.zones[0], 7, 3, 0);
    const moved = moveDesignerVectorGroupMember(normalized, { type: "zone", id: normalized.zones[0].id }, movedFirst);
    assert.deepEqual(
      moved.zones.slice(0, 2).map((zone, index) => ({ x: zone.x - normalized.zones[index].x, y: zone.y - normalized.zones[index].y })),
      [{ x: 7, y: 3 }, { x: 7, y: 3 }]
    );
    assert.deepEqual(moved.zones[2], normalized.zones[2]);
  });
});

describe("Electrical route deletion", () => {
  it("deletes the final route and removes its light-source assignments", () => {
    const document = createNewPartituraDocument("delete_last_route");
    const route = { id: "route_only", name: "Only LED string", kind: "led_string" as const, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
    document.designer.routes = [route];
    document.designer.lightSources = [{
      ...createDefaultOpticalTreatment("zone", "zone_1"),
      id: "source_1",
      name: "Source 1",
      stringIds: [route.id]
    }];

    const result = deleteDesignerRoute(document.designer, route.id);

    assert.deepEqual(result.routes, []);
    assert.deepEqual(result.lightSources[0].stringIds, []);
  });
});

describe("Designer wiring surface display", () => {
  it("persists front/rear classification without changing electrical compilation", () => {
    const document = createDefaultPartituraDocument();
    if (!document.designer) assert.fail("default designer missing");
    const before = designerCompileSignature(document.designer);
    const changed = canonicalizeDesignerGeometry({
      ...document.designer,
      routes: document.designer.routes.map((route, index) => ({
        ...route,
        designSurface: index % 2 ? "front" as const : "rear" as const,
        visible: false
      }))
    });
    assert.equal(designerCompileSignature(changed), before);
    assert.equal(changed.routes[1]?.designSurface, "front");
    assert.equal(routeMatchesSurfaceView("front", "front"), true);
    assert.equal(routeMatchesSurfaceView("front", "rear"), false);
    assert.equal(routeMatchesSurfaceView(undefined, "rear"), true);
    assert.equal(routeMatchesSurfaceView("front", "both"), true);
  });

  it("keeps the shared surface filter inside Design and applies it to strings and cables", async () => {
    const [workspaceSource, layersSource, canvasSource] = await Promise.all([
      readFile("components/lighting/partitura-workspace.tsx", "utf8"),
      readFile("components/lighting/designer/designer-ui.tsx", "utf8"),
      readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8")
    ]);
    assert.match(workspaceSource, /routeSurfaceView/);
    assert.match(workspaceSource, /<option value="rear">Rear<\/option>[\s\S]*?<option value="front">Front<\/option>/);
    assert.match(layersSource, /Wiring surface visibility/);
    assert.match(layersSource, /route\.kind === "data_cable" && routeMatchesSurfaceView/);
    assert.match(layersSource, /route\.kind === "led_string" && routeMatchesSurfaceView/);
    assert.match(canvasSource, /displayedDesigner[\s\S]*?drawPaperDesigner/);
    assert.match(canvasSource, /findNearbySolderTerminal\(displayedRoutes/);
  });

  it("keeps terminals on opposite physical surfaces independent", () => {
    const rearOutput = {
      id: "rear_output",
      name: "Rear output",
      kind: "led_string" as const,
      designSurface: "rear" as const,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0, joint: true }]
    };
    const frontInput = {
      id: "front_input",
      name: "Front input",
      kind: "led_string" as const,
      designSurface: "front" as const,
      points: [{ x: 10, y: 0, joint: true }, { x: 20, y: 0 }]
    };

    assert.equal(findNearbySolderTerminal([rearOutput, frontInput], rearOutput.id, 1, { x: 10, y: 0 }, 1), null);
    assert.equal(findMatchingSolderTerminal([rearOutput, frontInput], rearOutput.id, 1, 2), null);
    assert.deepEqual(findJointGroup([rearOutput, frontInput], rearOutput.id, 1, 2), [{ routeId: rearOutput.id, pointIndex: 1 }]);

    const rearInput = { ...frontInput, id: "rear_input", designSurface: "rear" as const };
    assert.deepEqual(findMatchingSolderTerminal([rearOutput, rearInput], rearOutput.id, 1, 2), { routeId: rearInput.id, pointIndex: 0 });
  });
});

describe("terminal solder capture", () => {
  it("keeps magnetic assistance inside the terminal marker", () => {
    assert.equal(TERMINAL_SOLDER_CAPTURE_RADIUS_PX, 5);
  });

  it("keeps a click on a terminal as selection instead of treating it as a drag", async () => {
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    assert.equal(POINTER_DRAG_THRESHOLD_PX, 3);
    assert.match(canvasSource, /const routePointWasDragged =/);
    assert.match(canvasSource, /if \(routePointWasDragged && endedRoutePointDrag\) onRoutePointDragEnd/);
  });

  it("requires opposite green/red polarities without restricting route kinds", () => {
    const cable = { id: "cable", name: "Cable", kind: "data_cable" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    const cableTwo = { id: "cable_two", name: "Cable two", kind: "data_cable" as const, points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] };
    const string = { id: "string", name: "String", kind: "led_string" as const, points: [{ x: 10, y: 0 }, { x: 20, y: 0 }] };
    const stringTwo = { id: "string_two", name: "String two", kind: "led_string" as const, points: [{ x: 20, y: 0 }, { x: 30, y: 0 }] };

    assert.equal(canSolderRoutes(cable, 1, cableTwo, 0, 0.1), true);
    assert.equal(canSolderRoutes(cable, 1, string, 0, 0.1), true);
    assert.equal(canSolderRoutes(string, 1, stringTwo, 0, 0.1), true);
    assert.equal(canSolderRoutes(cableTwo, 0, string, 0, 0.1), false);
    assert.equal(canSolderRoutes(cableTwo, 1, string, 1, 0.1), false);
  });

  it("does not treat separated terminals in the same large grid cell as coincident", () => {
    const output = { id: "output", name: "Output", kind: "led_string" as const, points: [{ x: 20, y: 20 }, { x: 28.6, y: 24 }] };
    const input = { id: "input", name: "Input", kind: "led_string" as const, points: [{ x: 29.4, y: 24 }, { x: 36, y: 24 }] };

    assert.equal(canSolderRoutes(output, 1, input, 0, 2), false);
  });

  it("does not run a second proximity capture after pointer release", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const autoSolderStart = workspaceSource.indexOf("function autoSolderRoutePoint");
    const autoSolderEnd = workspaceSource.indexOf("function moveSolderedTerminals", autoSolderStart);
    const autoSolderSource = workspaceSource.slice(autoSolderStart, autoSolderEnd);

    assert.doesNotMatch(autoSolderSource, /findNearby(?:ControllerPort|SolderTerminal)/);
    assert.match(autoSolderSource, /if \(!allowSolder\)/);
    assert.match(autoSolderSource, /findMatchingControllerPort/);
    assert.match(autoSolderSource, /findMatchingSolderTerminal/);
  });
});

describe("Artwork intrinsic size", () => {
  const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} != ${expected}`);

  it("preserves physical SVG dimensions at 1:1 scale", () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="550mm" height="300mm" viewBox="0 0 550 300"/>');
    const size = inspectArtworkIntrinsicSize(bytes, "image/svg+xml");
    assert.deepEqual(size, { widthCm: 55, heightCm: 30, basis: "physical-units" });
  });

  it("uses embedded PNG pixel density when present", () => {
    const bytes = new Uint8Array(66);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set(new TextEncoder().encode("IHDR"), 12);
    view.setUint32(16, 2079);
    view.setUint32(20, 1134);
    view.setUint32(33, 9);
    bytes.set(new TextEncoder().encode("pHYs"), 37);
    view.setUint32(41, 3780);
    view.setUint32(45, 3780);
    bytes[49] = 1;
    const size = inspectArtworkIntrinsicSize(bytes, "image/png");
    closeTo(size.widthCm, 55);
    closeTo(size.heightCm, 30);
    assert.equal(size.basis, "embedded-density");
  });

  it("uses the explicit 96 dpi fallback for raster files without physical density", () => {
    const bytes = new Uint8Array(30);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    bytes.set(new TextEncoder().encode("VP8X"), 12);
    const width = 960 - 1;
    const height = 480 - 1;
    bytes.set([width & 0xff, (width >> 8) & 0xff, (width >> 16) & 0xff], 24);
    bytes.set([height & 0xff, (height >> 8) & 0xff, (height >> 16) & 0xff], 27);
    const size = inspectArtworkIntrinsicSize(bytes, "image/webp");
    closeTo(size.widthCm, 25.4);
    closeTo(size.heightCm, 12.7);
    assert.equal(size.basis, "css-pixels-96dpi");
  });

  it("reads JPEG and BMP embedded density without changing their native scale", () => {
    const jpeg = new Uint8Array(41);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    jpeg.set(new TextEncoder().encode("JFIF\0"), 6);
    jpeg.set([0x01, 0x01, 0x01, 0x00, 0x64, 0x00, 0x64], 11);
    jpeg.set([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x26], 20);
    jpeg.set([0xff, 0xd9], 39);
    const jpegSize = inspectArtworkIntrinsicSize(jpeg, "image/jpeg");
    closeTo(jpegSize.widthCm, 13.97);
    closeTo(jpegSize.heightCm, 7.62);
    assert.equal(jpegSize.basis, "embedded-density");

    const bmp = new Uint8Array(54);
    const bmpView = new DataView(bmp.buffer);
    bmp.set(new TextEncoder().encode("BM"));
    bmpView.setUint32(14, 40, true);
    bmpView.setInt32(18, 550, true);
    bmpView.setInt32(22, 300, true);
    bmpView.setInt32(38, 1000, true);
    bmpView.setInt32(42, 1000, true);
    const bmpSize = inspectArtworkIntrinsicSize(bmp, "image/bmp");
    assert.deepEqual(bmpSize, { widthCm: 55, heightCm: 30, basis: "embedded-density" });
  });
});

describe("SVG artwork path import", () => {
  it("maps SVG curves and compound holes into the displayed object-contain rectangle", () => {
    const imported = placeSvgPathCandidates([{
      name: "letter-a",
      fillRule: "nonzero",
      contours: [
        {
          closed: true,
          segments: [
            { point: { x: 0, y: 0 }, handleOut: { x: 55, y: 0 } },
            { point: { x: 550, y: 0 }, handleIn: { x: -55, y: 0 } },
            { point: { x: 550, y: 300 } },
            { point: { x: 0, y: 300 } }
          ]
        },
        {
          closed: true,
          segments: [
            { point: { x: 200, y: 100 } },
            { point: { x: 350, y: 100 } },
            { point: { x: 350, y: 200 } },
            { point: { x: 200, y: 200 } }
          ]
        }
      ]
    }], { x: 0, y: 0, width: 550, height: 300 }, {
      artwork: { x: 22, y: 12, width: 90, height: 30 },
      intrinsicWidthCm: 55,
      intrinsicHeightCm: 30
    });

    assert.equal(imported.skippedOpenPaths, 0);
    assert.equal(imported.drafts.length, 1);
    const zone = imported.drafts[0];
    assert.equal(zone.suggestedName, "letter-a");
    assert.equal(zone.x, 39.5);
    assert.equal(zone.y, 12);
    assert.equal(zone.fillRule, "evenodd");
    assert.equal(zone.contours?.length, 2);
    assert.deepEqual(zone.points?.[0], { x: 39.5, y: 12, handleOut: { x: 5.5, y: 0 }, nodeType: "smooth" });
    assert.deepEqual(zone.points?.[1], { x: 94.5, y: 12, handleIn: { x: -5.5, y: 0 }, nodeType: "smooth" });
  });

  it("skips open SVG paths and exposes one contextual import command", async () => {
    const imported = placeSvgPathCandidates([{
      fillRule: "nonzero",
      contours: [{ closed: false, segments: [{ point: { x: 0, y: 0 } }, { point: { x: 10, y: 10 } }] }]
    }], { x: 0, y: 0, width: 10, height: 10 }, {
      artwork: { x: 0, y: 0, width: 10, height: 10 },
      intrinsicWidthCm: 10,
      intrinsicHeightCm: 10
    });
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const assetRouteSource = await readFile("app/api/lighting/projects/[id]/assets/[assetId]/route.ts", "utf8");
    const svgImportSource = await readFile("lib/lighting/artwork-svg-zones.ts", "utf8");
    const paperCanvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");

    assert.equal(imported.drafts.length, 0);
    assert.equal(imported.skippedOpenPaths, 1);
    assert.equal(workspaceSource.match(/createZonesFromArtworkSvg/g)?.length, 2);
    assert.match(workspaceSource, /"Create Zones"/);
    assert.doesNotMatch(workspaceSource, /entry\.id === artwork\.id \? \{ \.\.\.entry, visible: false \}/);
    assert.doesNotMatch(workspaceSource, /zones: \{ \.\.\.latestDesigner\.layers\.zones, visible: true \}/);
    assert.doesNotMatch(workspaceSource, /updateLiveDocument[\s\S]{0,240}setActiveLayer\("zones"\)/);
    assert.match(assetRouteSource, /inspection === "svg-source"/);
    assert.match(svgImportSource, /scope\.project\.clear\(\);[\s\S]{0,320}paper\.activate\(\)/);
    assert.match(paperCanvasSource, /loadedPaper\.activate\(\);[\s\S]{0,120}setPaperScope\(loadedPaper\)/);
  });

  it("splits one compound lettering path into selectable regions while retaining counters as holes", () => {
    const rectangle = (x: number, y: number, width: number, height: number) => ({
      closed: true,
      segments: [
        { point: { x, y } },
        { point: { x: x + width, y } },
        { point: { x: x + width, y: y + height } },
        { point: { x, y: y + height } }
      ]
    });
    const letterBodies = Array.from({ length: 11 }, (_, index) => rectangle(index * 20, 0, 12, 20));
    const imported = placeSvgPathCandidates([{
      name: "outlined-word",
      fillRule: "nonzero",
      contours: [...letterBodies, rectangle(3, 5, 4, 8), rectangle(23, 5, 4, 8)]
    }], { x: 0, y: 0, width: 220, height: 20 }, {
      artwork: { x: 0, y: 0, width: 110, height: 10 },
      intrinsicWidthCm: 110,
      intrinsicHeightCm: 10
    });

    assert.equal(imported.drafts.length, 11);
    assert.equal(imported.drafts[0].contours?.length, 2);
    assert.equal(imported.drafts[1].contours?.length, 2);
    assert.equal(imported.drafts[2].contours, undefined);
  });
});

describe("Generator workspace tabs", () => {
  it("exposes only Overview while keeping registry-based tab state", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const tabsStart = source.indexOf("const tabs = [");
    const tabsEnd = source.indexOf("];", tabsStart);
    const tabRegistry = source.slice(tabsStart, tabsEnd);

    assert.ok(tabsStart >= 0 && tabsEnd > tabsStart);
    assert.match(tabRegistry, /id: "overview", label: "Overview"/);
    assert.doesNotMatch(tabRegistry, /label: "Scenes"|label: "Simulator"/);
    assert.match(source, /tabs\.some\(\(tab\) => tab\.id === requestedTab\)/);
    assert.doesNotMatch(source, /<ScenesTab\s/);
    assert.doesNotMatch(source, /<SimulatorTab\s/);
  });
});

describe("Designer navigation and tenant-scoped project filtering", () => {
  it("keeps Designer as the single menu entry and redirects legacy Generator routes", async () => {
    const [menuSource, generatorPage, generatorDetailPage] = await Promise.all([
      readFile("lib/api.ts", "utf8"),
      readFile("app/partituras/generator/page.tsx", "utf8"),
      readFile("app/partituras/generator/[id]/page.tsx", "utf8")
    ]);

    assert.match(menuSource, /label: "Designer"/);
    assert.doesNotMatch(menuSource, /label: "Partitura Generator"/);
    assert.match(menuSource, /item\.href !== "\/partituras\/generator"/);
    assert.match(generatorPage, /redirect\("\/partituras\/designer"\)/);
    assert.match(generatorDetailPage, /redirect\(`\/partituras\/designer\/\$\{encodeURIComponent\(id\)\}`\)/);
  });

  it("derives catalog tenant scope from the session and filters Designer records by projectId", async () => {
    const [projectsRoute, partiturasRoute, projectsServer, partiturasServer, designerSource] = await Promise.all([
      readFile("app/api/lighting/projects/route.ts", "utf8"),
      readFile("app/api/lighting/partituras/route.ts", "utf8"),
      readFile("lib/server/projects.ts", "utf8"),
      readFile("lib/server/partituras.ts", "utf8"),
      readFile("components/lighting/partitura-designer-workbench.tsx", "utf8")
    ]);

    assert.match(projectsRoute, /listProjects\(menu\.tenant\.client_id\)/);
    assert.match(partiturasRoute, /listPartituras\(menu\.tenant\.client_id\)/);
    assert.match(projectsServer, /client\.id::text = \$1 or client\.client_key = \$1/);
    assert.match(partiturasServer, /c\.id::text = \$1 or c\.client_key = \$1/);
    assert.match(designerSource, /key: "projectId"/);
    assert.match(designerSource, /allLabel: "All projects"/);
    assert.doesNotMatch(designerSource, /client_id.*searchParams|searchParams.*client_id/);
  });
});

describe("Designer text tool visibility", () => {
  it("keeps controlled text support without exposing text creation in the tool rail", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");

    assert.doesNotMatch(source, /<ToolButton[^>]+tool === "(?:reference_text|zone_text|face_graphic_text)"/);
    assert.match(source, /function createTextAt\(point: DesignerPoint\)/);
    assert.match(source, /async function convertTextToPaths\(textId: string\)/);
  });
});

describe("Designer snap-to-grid control", () => {
  it("uses the configured Setup interval only while snapping is enabled", () => {
    assert.equal(canvasInteractionSnapCm(2.5, true), 2.5);
    assert.equal(canvasInteractionSnapCm(2.5, false), 0);
  });

  it("keeps the magnet toggle and Setup close action in the global bar", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");

    assert.match(source, /aria-label="Snap to grid" aria-pressed=\{snapToGrid\}/);
    assert.match(source, /aria-label="Close Setup"/);
    assert.match(source, /setupDetailsRef\.current\.open = false/);
  });

  it("keeps global alignment marks configurable in Setup and movable across layers", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");

    assert.match(workspaceSource, /Alignment \/ calibration/);
    assert.match(workspaceSource, /Measured spacing/);
    assert.match(canvasSource, /type: "alignment-guide-move"/);
    assert.match(canvasSource, /tool === "move" && designer\.alignmentMarks\.enabled && !designer\.alignmentMarks\.locked && pointNearAlignmentMarks/);
    assert.match(rendererSource, /drawPaperAlignmentMarks\(designer/);
  });
});

describe("Animate WebGL outlines", () => {
  it("prepares persistent segments for zone boundaries and channel borders", () => {
    const zone: VisualShape = {
      id: "zone_outline",
      name: "Zone outline",
      kind: "zone",
      primitive: "rectangle",
      x: 2,
      y: 3,
      width: 10,
      height: 6,
      contours: [],
      fillRule: "evenodd"
    };
    const channel: VisualShape = {
      id: "channel_outline",
      name: "Channel outline",
      kind: "channel",
      primitive: "path",
      x: 0,
      y: 0,
      width: 10,
      height: 0,
      contours: [{ points: [{ x: 0, y: 1 }, { x: 10, y: 1 }, { x: 10, y: -1 }, { x: 0, y: -1 }], pathMode: "straight" }],
      fillRule: "evenodd"
    };

    assert.deepEqual(Array.from(buildOutlineSegments([zone])), [2, 3, 12, 3, 12, 3, 12, 9, 12, 9, 2, 9, 2, 9, 2, 3]);
    assert.deepEqual(Array.from(buildOutlineSegments([channel])), [0, 1, 10, 1, 10, 1, 10, -1, 10, -1, 0, -1, 0, -1, 0, 1]);
  });

  it("uses the same resolved Channel contours as Designer instead of reconstructing its center line", async () => {
    const rounded: DesignerChannelForm = {
      id: "rounded_sign",
      name: "Rounded sign",
      points: [
        { x: 129, y: 0, nodeType: "corner", radiusMm: 80 },
        { x: 129, y: 40, nodeType: "corner", radiusMm: 80 },
        { x: 43, y: 40, nodeType: "corner", radiusMm: 80 },
        { x: 43, y: 0, nodeType: "corner", radiusMm: 80 }
      ],
      pathMode: "bezier",
      widthMm: 10,
      closed: true,
      cap: "butt",
      visible: true,
      locked: false,
      opacity: 1
    };
    const contours = resolveChannelOutlineContours(rounded);
    const shape: VisualShape = {
      id: rounded.id,
      name: rounded.name,
      kind: "channel",
      primitive: "path",
      x: 42.5,
      y: -0.5,
      width: 87,
      height: 41,
      contours: contours.map(({ points, pathMode }) => ({ points, pathMode })),
      fillRule: "evenodd"
    };
    const segments = buildOutlineSegments([shape]);

    assert.equal(contours.length, 2);
    assert.ok(segments.length / 4 > 100);
    assert.ok(contours.flatMap((contour) => contour.points).some((point) => point.x > 129 && point.y > 0 && point.y < 8));
    const playerSource = await readFile("components/lighting/player/gpu/webgl2-player-renderer.ts", "utf8");
    assert.doesNotMatch(playerSource, /channelOutlinePolylines/);
    assert.match(playerSource, /shape\.contours\.map\(\(contour\) => flattenContour/);
  });

  it("gates the outline pass with the Animate checkbox state", async () => {
    const source = await readFile("components/lighting/player/gpu/webgl2-player-renderer.ts", "utf8");
    const outlineGate = source.slice(source.indexOf("if (this.settings.showOutlines) {"), source.indexOf("private directPixelRadius"));
    assert.match(outlineGate, /this\.drawOutlineBatch\(this\.zoneOutlines/);
    assert.match(outlineGate, /this\.drawOutlineBatch\(this\.channelOutlines/);
    assert.match(outlineGate, /if \(this\.selectedOutline\) \{/);
    assert.match(outlineGate, /this\.drawOutlineBatch\(this\.selectedOutline/);
  });

  it("can bypass the Face Graphic mask only for the interactive preview", async () => {
    const [workspace, surface, renderer] = await Promise.all([
      readFile("components/lighting/partitura-workspace.tsx", "utf8"),
      readFile("components/lighting/player/player-surface.tsx", "utf8"),
      readFile("components/lighting/player/gpu/webgl2-player-renderer.ts", "utf8")
    ]);

    assert.match(workspace, /<span>Face mask<\/span>/);
    assert.match(workspace, /faceMaskEnabled=\{animationFaceMaskEnabled\}/);
    assert.match(surface, /renderer\.updateFaceMaskEnabled\(faceMaskEnabled\)/);
    assert.match(renderer, /useFaceMask && this\.hasFaceMask && this\.faceMaskEnabled/);
  });

  it("builds selection feedback for exactly one clicked zone without exposing nodes", () => {
    const shapes = [
      { id: "zone_a", kind: "zone" as const },
      { id: "zone_b", kind: "zone" as const },
      { id: "channel_a", kind: "channel" as const }
    ] as VisualShape[];

    assert.deepEqual(selectedOutlineShapes(shapes, { type: "zone", id: "zone_b" }).map((shape) => shape.id), ["zone_b"]);
    assert.deepEqual(selectedOutlineShapes(shapes, { type: "channel", id: "missing" }), []);
  });
});

describe("compound paths and boolean operations", () => {
  const rectangle = (id: string, x: number, y: number, width: number, height: number) => ({ id, kind: "rect" as const, x, y, width, height });

  it("makes subtract and exclude equivalent when the later profile is fully nested", () => {
    paper.setup(new paper.Size(200, 200));
    const operands = [rectangle("outer", 0, 0, 20, 20), rectangle("inner", 5, 5, 10, 10)];
    const subtract = applyDesignerBooleanOperation(paper, operands, "subtract", "subtract");
    const exclude = applyDesignerBooleanOperation(paper, operands, "exclude", "exclude");
    assert.deepEqual(subtract.issues, []);
    assert.deepEqual(exclude.issues, []);
    assert.equal(subtract.geometry?.fillRule, "evenodd");
    assert.equal(subtract.geometry?.contours?.length, 2);
    assert.equal(exclude.geometry?.contours?.length, 2);
    for (const geometry of [subtract.geometry!, exclude.geometry!]) {
      const shape = { shape: "polygon" as const, ...geometry, pathMode: geometry.pathMode ?? "straight" };
      assert.equal(pointInsideDesignerShape(shape, { x: 2, y: 2 }), true);
      assert.equal(pointInsideDesignerShape(shape, { x: 10, y: 10 }), false);
    }
  });

  it("supports union, intersect and exclude through the shared geometry engine", () => {
    paper.setup(new paper.Size(200, 200));
    const operands = [rectangle("left", 0, 0, 10, 10), rectangle("right", 5, 0, 10, 10)];
    const union = applyDesignerBooleanOperation(paper, operands, "union", "union");
    const subtract = applyDesignerBooleanOperation(paper, operands, "subtract", "subtract");
    const intersect = applyDesignerBooleanOperation(paper, operands, "intersect", "intersect");
    const exclude = applyDesignerBooleanOperation(paper, operands, "exclude", "exclude");
    assert.deepEqual(union.issues, []);
    assert.deepEqual([union.geometry?.x, union.geometry?.width], [0, 15]);
    assert.deepEqual([intersect.geometry?.x, intersect.geometry?.width], [5, 5]);
    assert.equal(exclude.geometry?.contours?.length, 2);
    const subtractShape = { shape: "polygon" as const, ...subtract.geometry!, pathMode: subtract.geometry?.pathMode ?? "straight" };
    const excludeShape = { shape: "polygon" as const, ...exclude.geometry!, pathMode: exclude.geometry?.pathMode ?? "straight" };
    assert.equal(pointInsideDesignerShape(subtractShape, { x: 12, y: 5 }), false);
    assert.equal(pointInsideDesignerShape(excludeShape, { x: 12, y: 5 }), true);
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

describe("interactive path trim", () => {
  it("routes the contextual Trim rail tool through the selected Channel center trace", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");

    assert.match(workspaceSource, /const pathTrimAvailable = Boolean\([\s\S]*?selection\?\.type === "channel" && selectedChannel\?\.points\.length/);
    assert.match(workspaceSource, /<ToolButton active=\{tool === "path_trim"\} label="Trim selected path" icon=\{Scissors\}/);
    assert.match(canvasSource, /selectedChannelId \? trimDesignerChannelPathAtPoint : trimDesignerPathAtPoint/);
    assert.match(canvasSource, /else if \(selectedChannelId && preview\.geometry\.points\?\.length\)[\s\S]*?channels: designer\.channels\.map/);
  });

  it("splices the hovered self-crossing loop from an open Channel trace", () => {
    paper.setup(new paper.Size(100, 100));
    const crossingChannel = {
      id: "crossing-channel",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 30,
      height: 20,
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }, { x: 30, y: 0 }],
      pathMode: "straight" as const,
      closed: false,
      fillRule: "nonzero" as const
    };

    const trimmed = trimDesignerChannelPathAtPoint(paper, crossingChannel, { x: 10, y: 18 });

    assert.ok(trimmed);
    assert.equal(trimmed.geometry.closed, false);
    assert.equal(trimmed.intersections.length, 1);
    assert.deepEqual(trimmed.geometry.points, [
      { x: 0, y: 0, nodeType: "corner" },
      { x: 10, y: 10, nodeType: "corner" },
      { x: 20, y: 0, nodeType: "corner" },
      { x: 30, y: 0, nodeType: "corner" }
    ]);
    assert.equal(trimmed.removed.closed, true);
  });

  it("keeps a closed Channel as one editable trace after trimming its selected loop", () => {
    paper.setup(new paper.Size(100, 100));
    const crossingChannel = {
      id: "closed-crossing-channel",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }],
      pathMode: "straight" as const,
      closed: true,
      fillRule: "nonzero" as const
    };

    const trimmed = trimDesignerChannelPathAtPoint(paper, crossingChannel, { x: 10, y: 18 });

    assert.ok(trimmed);
    assert.equal(trimmed.geometry.closed, true);
    assert.equal(trimmed.geometry.contours, undefined);
    assert.ok(trimmed.geometry.points?.some((point) => point.y === 0));
    assert.ok(trimmed.removed.points.some((point) => point.y === 20));
  });

  it("removes the hovered self-crossing loop and stores a clean closed contour", () => {
    paper.setup(new paper.Size(100, 100));
    const crossing = {
      id: "crossing",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }],
      pathMode: "straight" as const,
      closed: true,
      fillRule: "nonzero" as const
    };
    const trimmed = trimDesignerPathAtPoint(paper, crossing, { x: 10, y: 18 });

    assert.ok(trimmed);
    assert.equal(trimmed.intersections.length, 1);
    assert.equal(trimmed.geometry.closed, true);
    assert.deepEqual(validateDesignerGeometryTopology(trimmed.geometry), []);
    assert.ok(trimmed.removed.points.length >= 3);
    assert.ok(trimmed.geometry.points?.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  });

  it("maps the red removal preview to the branch under the pointer", () => {
    paper.setup(new paper.Size(100, 100));
    const crossing = {
      id: "crossing-branch-choice",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 20, y: 0 }],
      pathMode: "straight" as const,
      closed: true,
      fillRule: "nonzero" as const
    };
    const top = trimDesignerPathAtPoint(paper, crossing, { x: 10, y: 18 });
    const bottom = trimDesignerPathAtPoint(paper, crossing, { x: 10, y: 2 });

    assert.ok(top && bottom);
    assert.ok(top.removed.points.some((point) => point.y === 20));
    assert.ok(top.geometry.points?.some((point) => point.y === 0));
    assert.ok(bottom.removed.points.some((point) => point.y === 0));
    assert.ok(bottom.geometry.points?.some((point) => point.y === 20));
  });

  it("trims one selected span while leaving other crossings for subsequent passes", () => {
    paper.setup(new paper.Size(120, 120));
    const crossingChain = {
      id: "multi-crossing",
      kind: "path" as const,
      x: 0,
      y: -2,
      width: 10,
      height: 6,
      points: [
        { x: 0, y: -2 },
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
        { x: 4, y: 0 },
        { x: 6, y: 0 },
        { x: 10, y: 4 },
        { x: 6, y: 4 },
        { x: 10, y: 0 },
        { x: 10, y: -2 }
      ],
      pathMode: "straight" as const,
      closed: true,
      fillRule: "nonzero" as const
    };
    const trimmed = trimDesignerPathAtPoint(paper, crossingChain, { x: 2, y: 3.5 });

    assert.ok(trimmed);
    assert.equal(trimmed.intersections.length, 2);
    assert.ok(trimmed.removed.points.some((point) => point.x === 0 && point.y === 4));
    const secondTrim = trimDesignerPathAtPoint(paper, trimmed.geometry, { x: 8, y: 3.5 });
    assert.ok(secondTrim);
  });

  it("keeps every resolved compound contour node-addressable after trim", () => {
    const shape = {
      x: 0, y: 0, width: 10, height: 10,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      contours: [
        { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], pathMode: "straight" as const, closed: true as const },
        { points: [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 5, y: 7 }], pathMode: "straight" as const, closed: true as const }
      ]
    };
    assert.equal(designerShapePointCount(shape), 7);
    assert.deepEqual(designerShapePointLocation(shape, 4)?.point, { x: 3, y: 3 });

    const updated = updatePolygonPoint(shape, 4, { x: 4, y: 4 }, 0);
    assert.deepEqual(updated.contours[1].points[0], { x: 4, y: 4 });
    assert.deepEqual(updated.points[0], { x: 0, y: 0 });
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

  it("keeps the parallel legs of a concave M aligned for outward and inward offsets", () => {
    const letterM = {
      id: "letter_m",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      points: [
        { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 2, y: 0 },
        { x: 5, y: 5 }, { x: 8, y: 0 }, { x: 10, y: 0 },
        { x: 10, y: 10 }, { x: 8, y: 10 }, { x: 8, y: 4 },
        { x: 5, y: 9 }, { x: 2, y: 4 }, { x: 2, y: 10 }
      ],
      pathMode: "straight" as const,
      closed: true
    };

    const outward = offsetDesignerGeometry(letterM, 2, "miter", 4, "letter_m_outward");
    const inward = offsetDesignerGeometry(letterM, -2, "miter", 4, "letter_m_inward");
    const largeRound = offsetDesignerGeometry(letterM, 13, "round", 4, "letter_m_round_13mm");
    const legXs = (geometry: typeof outward.geometry) => geometry?.points
      ?.filter((_, index) => [0, 1, 6, 7, 8, 11].includes(index))
      .map((point) => Math.round(point.x * 10) / 10);

    assert.equal(outward.issue, null);
    assert.equal(inward.issue, null);
    assert.equal(largeRound.issue, null);
    assert.deepEqual(legXs(outward.geometry), [-0.2, -0.2, 10.2, 7.8, 7.8, 2.2]);
    assert.deepEqual(legXs(inward.geometry), [0.2, 0.2, 9.8, 8.2, 8.2, 1.8]);
    assert.ok(Math.abs((largeRound.geometry?.x ?? 0) + 1.3) < 1e-9);
    assert.ok(Math.abs((largeRound.geometry?.width ?? 0) - 12.6) < 1e-9);
    assert.ok((largeRound.geometry?.points?.length ?? 0) > letterM.points.length);
    assert.ok(Math.abs((outward.geometry?.points?.[3].x ?? 0) - 5) < 1e-9);
    assert.ok(Math.abs((inward.geometry?.points?.[3].x ?? 0) - 5) < 1e-9);
  });

  it("preserves an acute miter without inserting a bevel segment", () => {
    const acute = {
      id: "acute",
      kind: "path" as const,
      x: -1,
      y: 0,
      width: 2,
      height: 10,
      points: [{ x: -1, y: 10 }, { x: 0, y: 0 }, { x: 1, y: 10 }],
      pathMode: "straight" as const,
      closed: true
    };

    const result = offsetDesignerGeometry(acute, 2, "miter", 1, "acute_offset");

    assert.equal(result.issue, null);
    assert.equal(result.geometry?.points?.length, 3);
    assert.deepEqual(result.warnings, []);
    assert.ok((result.geometry?.points?.[1].y ?? 0) < -2);
  });

  it("trims inverted offset loops from a tight Bezier letterform", () => {
    const tuples: Array<[number, number, number | null, number | null, number | null, number | null]> = [
      [48.0121, 33.73225, null, null, null, null], [48.0121, 22.63258, null, null, null, null], [51.0975, 22.63258, null, null, null, null],
      [51.0975, 24.71774, null, null, 0.14838, -0.42346], [51.66611, 23.63113, -0.23069, 0.30094, 0.31693, -0.42044],
      [52.77536, 22.69565, -0.42257, 0.20321, 0.42257, -0.20321], [54.10833, 22.39083, -0.46607, 0, 0.74572, 0],
      [56.06583, 23.1266, -0.55929, -0.49051, 0.42728, 0.36938], [56.95595, 24.60897, -0.16614, -0.61886, 0.12326, -0.3516],
      [57.45472, 23.67318, -0.20926, 0.27226, 0.32314, -0.42044], [58.62923, 22.71667, -0.45986, 0.21723, 0.46607, -0.21723],
      [60.12066, 22.39083, -0.52822, 0, 0.64629, 0], [61.8358, 22.86383, -0.49714, -0.31533, 0.50336, 0.31533],
      [63.01962, 24.23026, -0.28585, -0.59563, 0.28586, 0.58862], [63.44841, 26.34298, 0, -0.81986, null, null],
      [63.44841, 33.73225, null, null, null, null], [60.23252, 33.73225, null, null, null, null], [60.23252, 27.14182, null, null, 0, -0.58161],
      [59.81305, 25.79641, 0.27964, 0.31533, -0.27343, -0.31533], [58.7504, 25.32341, 0.435, 0, -0.29828, 0],
      [57.9674, 25.55465, 0.22372, -0.15416, -0.22371, 0.15416], [57.4454, 26.20634, 0.12429, -0.28029, -0.12429, 0.2803],
      [57.25897, 27.19438, 0, -0.3784, null, null], [57.25897, 33.73225, null, null, null, null], [54.19222, 33.73225, null, null, null, null],
      [54.19222, 27.09978, null, null, 0, -0.53957], [53.7914, 25.80692, 0.26721, 0.32234, -0.26721, -0.32234],
      [52.72875, 25.32341, 0.44122, 0, -0.28586, 0], [51.95507, 25.55465, 0.22993, -0.15416, -0.22371, 0.15416],
      [51.41443, 26.21685, 0.13672, -0.2873, -0.1305, 0.2873], [51.21868, 27.26795, 0, -0.41343, null, null],
      [51.21868, 33.73225, null, null, null, null]
    ];
    const points = tuples.map(([x, y, handleInX, handleInY, handleOutX, handleOutY]) => ({
      x, y,
      ...(handleInX !== null && handleInY !== null ? { handleIn: { x: handleInX, y: handleInY } } : {}),
      ...(handleOutX !== null && handleOutY !== null ? { handleOut: { x: handleOutX, y: handleOutY } } : {})
    }));
    const letterform = { id: "projected_m", kind: "path" as const, x: 48.0121, y: 22.39083, width: 15.43631, height: 11.34142, points, pathMode: "bezier" as const, closed: true, fillRule: "nonzero" as const };

    const outward = offsetDesignerGeometry(letterform, 2, "round", 4, "projected_m_outward");
    const largerOutward = offsetDesignerGeometry(letterform, 13, "round", 4, "projected_m_outward_13mm");
    const inward = offsetDesignerGeometry(letterform, -2, "round", 4, "projected_m_inward");

    for (const result of [outward, largerOutward, inward]) {
      assert.equal(result.issue, null);
      assert.ok(result.geometry);
      assert.ok(result.warnings.some((warning) => warning.includes("loops were trimmed")));
      assert.ok((result.geometry?.points?.length ?? Infinity) < 200);
    }
    assert.equal(largerOutward.geometry?.contours, undefined);
  });

  it("reduces simplification tolerance instead of rejecting a valid inset letterform", () => {
    const tuples: Array<[number, number, number | null, number | null, number | null, number | null]> = [
      [117.83559, 24.72869, 0.80978, 0, -0.98635, 0],
      [115.23273, 24.00781, 0.74889, 0.48059, -0.7428, -0.48746],
      [113.48836, 21.98932, 0.42011, 0.8582, -0.41402, -0.8582],
      [112.86732, 19.04399, 0, 1.10536, 0, -1.10536],
      [113.48836, 16.09866, -0.41402, 0.8582, 0.42011, -0.8582],
      [115.22359, 14.09047, -0.73671, 0.48059, 0.73672, -0.48746],
      [117.75339, 13.35929, -0.94981, 0, 0.72454, 0],
      [119.73521, 13.77122, -0.59668, -0.27462, 0.59668, 0.26776],
      [121.27866, 14.92464, -0.43228, -0.50119, 0.43838, 0.50119],
      [122.29241, 16.70626, -0.23745, -0.68656, 0.23746, 0.67969],
      [122.64859, 18.9616, 0, -0.82387, null, null],
      [122.64859, 19.91935, null, null, null, null],
      [115.92861, 19.91935, null, null, 0.01252, 0.42973],
      [116.16427, 21.06247, -0.14459, -0.33235, 0.16439, 0.35701],
      [116.85837, 21.88634, -0.29834, -0.19224, 0.30443, 0.19224],
      [117.94518, 22.1747, -0.42011, 0, 0.31052, 0],
      [118.77626, 22.03052, -0.24354, 0.09612, 0.24355, -0.09612],
      [119.38817, 21.61858, -0.16439, 0.17851, 0.16439, -0.1785],
      [119.75348, 21.00068, -0.07915, 0.23343, null, null],
      [122.57553, 21.00068, null, null, -0.11568, 0.72775],
      [121.73531, 22.93677, 0.44446, -0.56298, -0.44446, 0.55611],
      [120.05487, 24.25497, 0.67583, -0.32268, -0.66974, 0.31582]
    ];
    const points = tuples.map(([x, y, handleInX, handleInY, handleOutX, handleOutY]) => ({
      x, y,
      ...(handleInX !== null && handleInY !== null ? { handleIn: { x: handleInX, y: handleInY } } : {}),
      ...(handleOutX !== null && handleOutY !== null ? { handleOut: { x: handleOutX, y: handleOutY } } : {})
    }));
    const letterE = { id: "letter_e", kind: "path" as const, x: 112.86732, y: 13.35929, width: 9.78127, height: 11.3694, points, pathMode: "bezier" as const, closed: true, fillRule: "nonzero" as const };

    const inset = offsetDesignerGeometry(letterE, -0.3, "round", 4, "letter_e_inset");

    assert.equal(inset.issue, null);
    assert.ok(inset.geometry);
    assert.deepEqual(validateDesignerGeometryTopology(inset.geometry!), []);
    assert.ok((inset.geometry?.points?.length ?? Infinity) < 549);
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
    const all = filletDesignerGeometry(rectangle, 20, undefined, "all_fillet");
    const clamped = filletDesignerGeometry(rectangle, 100, undefined, "clamped_fillet");
    assert.equal(selected.issue, null);
    assert.equal(selected.geometry?.pathMode, "bezier");
    assert.equal(selected.geometry?.points?.length, 5);
    assert.equal(selected.geometry?.points?.filter((point) => point.handleIn || point.handleOut).length, 2);
    assert.equal(all.geometry?.points?.length, 8);
    assert.ok(clamped.warnings.some((warning) => warning.includes("clamped")));
    assert.ok(clamped.appliedFilletRadiiMm?.every((radius) => radius > 0 && radius < 100));
  });

  it("applies consecutive node fillets directly to the same native object", () => {
    const designer = createDefaultPartituraDocument("direct_fillet").designer;
    const source = designer.buildAreas[0];
    source.shape = "rect";
    source.x = 0;
    source.y = 0;
    source.width = 10;
    source.height = 8;
    const derivedCount = designer.derivedGeometries.length;

    const first = applyDesignerNativeFillet(designer, { type: "build_area", id: source.id, cornerIndex: 0 }, 20);
    assert.equal(first.applied, true);
    assert.equal(first.appliedRadiusMm, 20);
    assert.equal(first.designer.buildAreas[0].id, source.id);
    assert.equal(first.designer.buildAreas[0].name, source.name);
    assert.equal(first.designer.buildAreas[0].shape, "polygon");
    assert.equal(first.designer.buildAreas[0].points?.length, 5);
    assert.equal(first.designer.derivedGeometries.length, derivedCount);

    const second = applyDesignerNativeFillet(first.designer, { type: "build_area", id: source.id, cornerIndex: 3 }, 20);
    assert.equal(second.applied, true);
    assert.equal(second.designer.buildAreas[0].id, source.id);
    assert.equal(second.designer.buildAreas[0].points?.length, 6);
    assert.equal(second.designer.buildAreas[0].points?.filter((point) => point.handleIn || point.handleOut).length, 4);
    assert.equal(second.designer.derivedGeometries.length, derivedCount);

    const alreadyTangent = applyDesignerNativeFillet(second.designer, { type: "build_area", id: source.id, cornerIndex: 0 }, 20);
    assert.equal(alreadyTangent.applied, false);
    assert.equal(alreadyTangent.issue, "radius-not-preserved");
    assert.ok(alreadyTangent.warnings.some((warning) => warning.includes("could not be preserved exactly")));
  });

  it("preserves the requested direct radius by adjusting adjacent curved traces", () => {
    const curvedCorner = {
      id: "curved_exact",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 2,
      height: 0.5,
      closed: false,
      pathMode: "bezier" as const,
      points: [
        { x: -0.5, y: 0, handleOut: { x: 0.2, y: 0 } },
        { x: 0.5, y: 0.5, handleIn: { x: -0.2, y: -0.2 }, handleOut: { x: 0.2, y: -0.2 } },
        { x: 1.5, y: 0, handleIn: { x: -0.2, y: 0 } }
      ]
    };
    const legacy = filletDesignerGeometry(curvedCorner, 15, [1], "legacy_clamped");
    const exact = filletDesignerGeometryExact(curvedCorner, 15, 1, "direct_exact");

    assert.ok((legacy.appliedFilletRadiiMm?.[0] ?? 15) < 15);
    assert.equal(exact.issue, null);
    assert.equal(exact.appliedFilletRadiiMm?.[0], 15);
    assert.match(exact.warnings.join(" "), /adjusted to preserve the exact R15 mm/);
  });

  it("preserves an exact fillet on either contour of a compound path", () => {
    const outer = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], pathMode: "straight" as const, closed: true as const };
    const hole = { points: [{ x: 5, y: 5 }, { x: 9, y: 5 }, { x: 9, y: 9 }, { x: 5, y: 9 }], pathMode: "straight" as const, closed: true as const };
    const compound = { id: "compound_fillet", kind: "path" as const, x: 0, y: 0, width: 20, height: 20, points: outer.points, contours: [outer, hole], pathMode: "straight" as const, closed: true, fillRule: "evenodd" as const };

    assert.equal(designerFilletCornerIsEligible(compound, 4), true);
    const result = filletDesignerGeometryExact(compound, 30, 4, "compound_fillet_result");

    assert.equal(result.issue, null);
    assert.equal(result.appliedFilletRadiiMm?.[0], 30);
    assert.equal(result.geometry?.contours?.length, 2);
    assert.deepEqual(result.geometry?.contours?.[0].points, outer.points);
    assert.equal(result.geometry?.contours?.[1].points.length, 5);
  });

  it("consumes dense offset samples instead of folding an oversized fillet over its immediate neighbors", () => {
    const denseOffsetCusp = {
      id: "dense_offset_cusp",
      kind: "path" as const,
      x: 73.129,
      y: 13.8091,
      width: 2.65637,
      height: 1.6259,
      closed: false,
      pathMode: "straight" as const,
      points: [
        { x: 73.129, y: 14.27046 },
        { x: 73.5893, y: 14.65086 },
        { x: 73.90344, y: 14.97187 },
        { x: 74.263, y: 15.435, nodeType: "straight" as const },
        { x: 74.46659, y: 15.18518 },
        { x: 74.79213, y: 14.83853 },
        { x: 75.26671, y: 14.42773 },
        { x: 75.78537, y: 14.07867 }
      ]
    };

    const result = filletDesignerGeometryExact(denseOffsetCusp, 5, 3, "dense_offset_fillet");

    assert.equal(result.issue, null);
    assert.equal(result.appliedFilletRadiiMm?.[0], 5);
    assert.ok(result.geometry);
    assert.equal(result.geometry.points?.some((point) => point.x === 73.90344 && point.y === 14.97187), false);
    assert.equal(result.geometry.points?.some((point) => point.x === 74.46659 && point.y === 15.18518), false);
    assert.equal(result.geometry?.closed, false);
  });

  it("uses the visible support legs when smooth handles hide an otherwise usable corner", () => {
    const smoothTaggedCorner = {
      id: "smooth_tagged_corner",
      kind: "path" as const,
      x: 97.006,
      y: 14.126,
      width: 4.39081,
      height: 2.571,
      closed: false,
      pathMode: "bezier" as const,
      points: [
        { x: 97.01201, y: 14.46446 },
        { x: 97.006, y: 16.697, nodeType: "smooth" as const, handleIn: { x: 0.0000029563, y: -0.74786168 }, handleOut: { x: -0.0000003144, y: 0.07078761 } },
        { x: 98.19955, y: 15.34738, nodeType: "smooth" as const, handleIn: { x: -0.32991301, y: 0.33201432 }, handleOut: { x: 0.8091, y: -0.81425 } },
        { x: 101.39681, y: 14.126 }
      ]
    };

    assert.equal(designerFilletCornerIsEligible(smoothTaggedCorner, 1), false);
    const result = filletDesignerGeometryExact(smoothTaggedCorner, 6, 1, "smooth_tagged_fillet");
    assert.equal(result.issue, null);
    assert.equal(result.appliedFilletRadiiMm?.[0], 6);
  });

  it("uses the existing Fillet command as a persistent direct-node tool for native geometry", async () => {
    const [workspaceSource, canvasSource] = await Promise.all([
      readFile("components/lighting/partitura-workspace.tsx", "utf8"),
      readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8")
    ]);
    assert.match(workspaceSource, /<ToolButton active=\{tool === "fillet"\} label="Fillet selected path" icon=\{Radius\}/);
    assert.match(workspaceSource, /onFilletCorner=\{applyDirectFillet\}/);
    assert.match(workspaceSource, /updateDesigner\(result\.designer\)/);
    assert.match(workspaceSource, /editableNativeFilletRef\.current = \{ target: editableTarget, sourceGeometry \}/);
    assert.match(workspaceSource, /onChange=\{patchDirectFilletRadius\}/);
    assert.match(workspaceSource, /directFilletRadiusSource === "router_bit"[\s\S]*?designer\.fabricationCutterDiameterMm \/ 2/);
    assert.match(workspaceSource, /label="Radius source"[\s\S]*?<option value="custom">Custom<\/option>[\s\S]*?<option value="router_bit">[\s\S]*?Router bit · Ø\{Number\(designer\.fabricationCutterDiameterMm\.toFixed\(3\)\)\} mm → R\{Number\(\(designer\.fabricationCutterDiameterMm \/ 2\)\.toFixed\(3\)\)\} mm/);
    assert.match(workspaceSource, /role="status"[\s\S]*?\{fabricationNotice\}/);
    assert.match(workspaceSource, /function selectDirectFilletRadiusSource[\s\S]*?activeDirectFilletRadiusMmRef\.current = requestedRadiusMm;[\s\S]*?recalculateDirectFilletRadius\(requestedRadiusMm\)/);
    assert.match(workspaceSource, /label="Router bit preset"/);
    assert.match(workspaceSource, /label="Router bit diameter"/);
    assert.match(workspaceSource, /label="Router bit unit"/);
    assert.doesNotMatch(workspaceSource, /label="Cutter (?:preset|diameter|unit)"/);
    assert.match(workspaceSource, /onClick=\{toggleDirectFilletTool\}/);
    assert.match(workspaceSource, /function toggleDirectFilletTool\(\)[\s\S]*?if \(!selectedDirectFilletTarget\) return;[\s\S]*?applyDirectFillet\(selectedDirectFilletTarget\)/);
    assert.match(workspaceSource, /setSelection\(\{ type: target\.type, id: target\.id, pointIndex: target\.cornerIndex \}\)/);
    assert.match(workspaceSource, /function patchDirectFilletRadius\([\s\S]*?selection\?\.type !== editable\.target\.type \|\| selection\.id !== editable\.target\.id \|\| selection\.pointIndex !== editable\.target\.cornerIndex/);
    assert.match(workspaceSource, /useState\(\(\) => Math\.max\(0, document\.designer\?\.filletRadiusMm \?\? 2\)\)/);
    assert.match(workspaceSource, /activeDirectFilletRadiusMmRef\.current = requestedRadiusMm;[\s\S]*?recalculateDirectFilletRadius\(requestedRadiusMm, requestedRadiusMm\)/);
    assert.match(workspaceSource, /const requestedRadiusMm = Math\.max\(0, activeDirectFilletRadiusMmRef\.current\)/);
    assert.match(workspaceSource, /settingsDesigner = typeof customRadiusMm === "number"[\s\S]*?filletRadiusMm: customRadiusMm/);
    assert.match(workspaceSource, /requestedRadiusMm === 0[\s\S]*?Fillet removed from the selected node/);
    assert.match(workspaceSource, /geometries: \[\.\.\.\(designer\.geometries \?\? \[\]\)\.filter[\s\S]*?applyDesignerNativeFillet\(calculationDesigner, editable\.target, requestedRadiusMm\)/);
    assert.match(canvasSource, /if \(tool === "fillet"\)[\s\S]*?onFilletCorner\(target\)/);
    assert.match(canvasSource, /const selectedFilletHit = tool === "fillet"[\s\S]*?const rawHit = selectedFilletHit/);
    assert.match(workspaceSource, /event\.key === "Escape" && \(tool === "move" \|\| tool === "path_trim" \|\| tool === "fillet"\)/);
  });

  it("trims an existing Bezier segment and inserts a tangent circular fillet", () => {
    const curved = {
      id: "curved",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      points: [
        { x: 0, y: 0, handleOut: { x: 2, y: 0 } },
        { x: 10, y: 0, handleIn: { x: -2, y: 0 } },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ],
      pathMode: "bezier" as const,
      closed: true
    };
    const result = filletDesignerGeometry(curved, 2, [0], "curved_fillet");
    assert.equal(result.issue, null);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.geometry?.points?.length, 5);
    assert.notDeepEqual(result.geometry?.points, curved.points);
    assert.ok(result.geometry?.points?.slice(0, 2).every((point) => point.handleIn || point.handleOut));
  });

  it("fillets a pointed Bezier cusp without straightening either side", () => {
    const cusp = {
      id: "cusp",
      kind: "path" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 5,
      points: [
        { x: 0, y: 0, handleOut: { x: 2, y: 0 } },
        { x: 5, y: 5, handleIn: { x: -2, y: -2 }, handleOut: { x: 2, y: -2 } },
        { x: 10, y: 0, handleIn: { x: -2, y: 0 } }
      ],
      pathMode: "bezier" as const,
      closed: false
    };
    assert.equal(designerFilletCornerIsEligible(cusp, 1), true);
    const result = filletDesignerGeometry(cusp, 3.175 / 2, [1], "cusp_fillet");
    assert.equal(result.issue, null);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.geometry?.points?.length, 5);
    assert.ok(result.geometry?.points?.[0].handleOut);
    assert.ok(result.geometry?.points?.at(-1)?.handleIn);
    assert.ok((result.geometry?.height ?? 5) < cusp.height);
    assert.equal(designerFilletCornerIsEligible(result.geometry!, 1), false);

    const clamped = filletDesignerGeometry(cusp, 100, [1], "clamped_cusp_fillet");
    assert.equal(clamped.issue, null);
    assert.ok((clamped.appliedFilletRadiiMm?.[0] ?? 0) > 0);
    assert.ok((clamped.appliedFilletRadiiMm?.[0] ?? 100) < 100);
    assert.ok(clamped.warnings.some((warning) => warning.includes("clamped")));
  });

  it("maps visible native corners to the same fillet interaction across geometric layers", () => {
    const document = createDefaultPartituraDocument("fillet_hit");
    const designer = document.designer;
    designer.buildAreas[0].shape = "rect";
    designer.faceGraphics = [{ id: "face", name: "Face", shape: "polygon", x: 0, y: 0, width: 10, height: 10, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], pathMode: "straight", passMode: "opaque", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    assert.deepEqual(designerFilletCornerForHit(designer, { type: "build_area_resize", id: designer.buildAreas[0].id, handle: "se" }), { type: "build_area", id: designer.buildAreas[0].id, cornerIndex: 2 });
    assert.deepEqual(designerFilletCornerForHit(designer, { type: "zone_point", id: designer.zones[0].id, pointIndex: 1 }), { type: "zone", id: designer.zones[0].id, cornerIndex: 1 });
    assert.deepEqual(designerFilletCornerForHit(designer, { type: "channel_point", id: "channel_1", pointIndex: 1 }), { type: "channel", id: "channel_1", cornerIndex: 1 });
    assert.deepEqual(designerFilletCornerForHit(designer, { type: "face_graphic_point", id: "face", pointIndex: 2 }), { type: "face_graphic", id: "face", cornerIndex: 2 });
    designer.derivedGeometries = [{ id: "node_fillet", name: "Node fillet", geometryId: "geometry_node_fillet", sourceGeometryId: designer.zones[0].geometryId!, targetLayer: "zones", operation: "fillet", radiusMm: 2, cornerIndices: [1], visible: true }];
    const reloaded = normalizeDefaultSignLayout(JSON.parse(JSON.stringify({ ...document, designer }))).designer;
    assert.deepEqual(reloaded.derivedGeometries[0].cornerIndices, [1]);
    assert.equal(resolveDesignerDerivedGeometry(reloaded, "node_fillet").geometry?.pathMode, "bezier");
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
  it("keeps export checksums available when browser Web Crypto is unavailable", async () => {
    assert.equal(await sha256Hex("abc", null), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(await sha256Hex(new TextEncoder().encode("abc").buffer, null), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("emits path-only SVG at explicit 1:1 millimeter scale and groups Face Graphic material", async () => {
    const document = createDefaultPartituraDocument("fabrication_project");
    if (!document.designer) assert.fail("default designer missing");
    document.designer.faceGraphics = [{ id: "red_vinyl", name: "Red vinyl", shape: "rect", x: 10, y: 5, width: 20, height: 10, passMode: "translucent", filterColor: "#FF0000", visible: true, locked: false, opacity: 0.2 }];
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

  it("exports only visible objects from every fabrication layer to SVG and DXF", async () => {
    const document = createDefaultPartituraDocument("fabrication_object_visibility");
    document.designer.buildAreas = [
      { id: "visible_reference", name: "Visible reference", shape: "rect", x: 1, y: 1, width: 8, height: 6, visible: true, locked: false, opacity: 1 },
      { id: "hidden_reference", name: "Hidden reference", shape: "ellipse", x: 12, y: 1, width: 8, height: 6, visible: false, locked: false, opacity: 1 }
    ];
    document.designer.zones = [
      { id: "visible_zone", name: "Visible zone", shape: "rect", x: 1, y: 10, width: 8, height: 6, visible: true, locked: false, opacity: 1 },
      { id: "hidden_zone", name: "Hidden zone", shape: "ellipse", x: 12, y: 10, width: 8, height: 6, visible: false, locked: false, opacity: 1 }
    ];
    document.designer.channels = [
      { id: "visible_channel", name: "Visible channel", points: [{ x: 1, y: 20 }, { x: 8, y: 20 }], pathMode: "straight", widthMm: 6, closed: false, cap: "round", visible: true, locked: false, opacity: 1 },
      { id: "hidden_channel", name: "Hidden channel", points: [{ x: 12, y: 20 }, { x: 20, y: 20 }], pathMode: "straight", widthMm: 6, closed: false, cap: "round", visible: false, locked: false, opacity: 1 }
    ];
    document.designer.faceGraphics = [
      { id: "visible_face", name: "Visible face", shape: "rect", x: 10, y: 5, width: 20, height: 10, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 },
      { id: "hidden_face", name: "Hidden face", shape: "ellipse", x: 40, y: 5, width: 12, height: 8, passMode: "opaque", filterColor: "#000000", visible: false, locked: false, opacity: 1 }
    ];
    const designer = canonicalizeDesignerGeometry(document.designer);
    const sourceGeometryId = designer.faceGraphics.find((item) => item.id === "visible_face")?.geometryId;
    assert.ok(sourceGeometryId);
    designer.derivedGeometries = [
      { id: "visible_derived", name: "Visible derived", geometryId: "geometry_visible_derived", sourceGeometryId, targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#0000FF", visible: true },
      { id: "hidden_derived", name: "Hidden derived", geometryId: "geometry_hidden_derived", sourceGeometryId, targetLayer: "zones", operation: "offset", distanceMm: 4, join: "round", miterLimit: 4, visible: false }
    ];
    designer.texts = [{ id: "hidden_text", name: "Hidden text", text: "CUT", fontId: "missing", fontHash: "missing", fontSizeMm: 20, trackingMm: 0, lineHeight: 1.2, alignment: "left", x: 1, y: 1, targetLayer: "reference", visible: false, locked: false, opacity: 1 }];

    const result = await generateDesignerFabricationExport({
      designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "object-visibility", partituraName: "Object visibility" },
      sourceDocument: { ...document, designer },
      options: { includeReference: true, includeZones: true, includeChannels: true, includeFaceGraphic: true, includeAlignmentMarks: false },
      generatedAt: "2026-10-09T12:00:00.000Z"
    });

    assert.deepEqual(result.files.map((file) => [file.layer, file.pathCount]), [
      ["reference", 1],
      ["zones", 1],
      ["channels", 1],
      ["faceGraphic", 2]
    ]);
    const reference = result.files.find((file) => file.layer === "reference")!;
    const zones = result.files.find((file) => file.layer === "zones")!;
    const channels = result.files.find((file) => file.layer === "channels")!;
    const faceGraphic = result.files.find((file) => file.layer === "faceGraphic")!;
    assert.match(reference.svg, /id="visible_reference"/);
    assert.match(zones.svg, /id="visible_zone"/);
    assert.match(channels.svg, /id="visible_channel"/);
    assert.match(faceGraphic.svg, /id="visible_face"/);
    assert.match(faceGraphic.svg, /id="visible_derived"/);
    result.files.forEach((file) => assert.doesNotMatch(file.svg, /hidden_reference|hidden_zone|hidden_channel|hidden_face|hidden_derived|hidden_text/));
    assert.equal((reference.dxf.match(/\nLWPOLYLINE\n/g) ?? []).length, 1);
    assert.equal((zones.dxf.match(/\nLWPOLYLINE\n/g) ?? []).length, 1);
    assert.equal((channels.dxf.match(/\nLWPOLYLINE\n/g) ?? []).length, 1);
    assert.equal((faceGraphic.dxf.match(/\nLWPOLYLINE\n/g) ?? []).length, 2);
    assert.match(faceGraphic.dxf, /\nLAYER\n2\nFACE_CLEAR\n/);
    assert.match(faceGraphic.dxf, /\nLAYER\n2\nFACE_TRANSLUCENT_0000FF\n/);
    assert.doesNotMatch(faceGraphic.dxf, /FACE_OPAQUE/);
    assert.equal(result.issues.some((issue) => issue.objectId === "hidden_text"), false);
  });

  it("splits fabrication into layer files and exports Channels as router centerline toolpaths", async () => {
    const document = createDefaultPartituraDocument("fabrication_layers");
    document.designer.buildAreas = [];
    document.designer.zones = [{ id: "zone_cut", name: "Zone cut", shape: "rect", x: 10, y: 10, width: 20, height: 10, visible: true, locked: false, opacity: 1 }];
    document.designer.channels = [{
      id: "channel_route",
      name: "Channel route",
      points: [{ x: 2, y: 3 }, { x: 8, y: 7 }, { x: 14, y: 4 }],
      pathMode: "straight",
      widthMm: 12,
      closed: false,
      cap: "round",
      visible: true,
      locked: false,
      opacity: 1
    }];
    document.designer.faceGraphics = [{ id: "face_cut", name: "Face cut", shape: "ellipse", x: 40, y: 5, width: 12, height: 8, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    const designer = canonicalizeDesignerGeometry(document.designer);
    const result = await generateDesignerFabricationExport({
      designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "layers", partituraName: "Layer files" },
      sourceDocument: { ...document, designer },
      options: { includeReference: false, includeZones: true, includeChannels: true, includeFaceGraphic: true },
      generatedAt: "2026-10-08T12:00:00.000Z"
    });

    assert.deepEqual(result.files.map((file) => [file.layer, file.fileSuffix]), [
      ["zones", "zones"],
      ["channels", "channels-toolpath"],
      ["faceGraphic", "face-graphic"]
    ]);
    const zones = result.files.find((file) => file.layer === "zones")!;
    const channels = result.files.find((file) => file.layer === "channels")!;
    const faceGraphic = result.files.find((file) => file.layer === "faceGraphic")!;
    assert.match(zones.svg, /id="zone_cut"/);
    assert.doesNotMatch(zones.svg, /channel_route|face_cut/);
    assert.match(channels.svg, /data-toolpath="router-centerline"/);
    assert.match(channels.svg, /id="channel_route"[^>]*d="M 20 30 L 80 70 L 140 40"/);
    assert.doesNotMatch(channels.svg, /id="channel_route"[^>]*d="[^"]* Z"/);
    assert.match(channels.dxf, /\nLWPOLYLINE\n100\nAcDbEntity\n8\nCHANNEL_TOOLPATH\n100\nAcDbPolyline\n90\n3\n70\n0\n/);
    assert.match(faceGraphic.svg, /id="face_cut"/);
    assert.doesNotMatch(faceGraphic.svg, /zone_cut|channel_route/);
  });

  it("repeats optional calibrated alignment marks on every output file as no-cut geometry", async () => {
    const document = createDefaultPartituraDocument("fabrication_alignment");
    document.designer.buildAreas = [];
    document.designer.zones = [{ id: "zone_cut", name: "Zone cut", shape: "rect", x: 10, y: 10, width: 20, height: 10, visible: true, locked: false, opacity: 1 }];
    document.designer.channels = [{ id: "channel_cut", name: "Channel cut", points: [{ x: 2, y: 3 }, { x: 8, y: 7 }], pathMode: "straight", widthMm: 6, closed: false, cap: "round", visible: true, locked: false, opacity: 1 }];
    document.designer.faceGraphics = [{ id: "face_cut", name: "Face cut", shape: "rect", x: 40, y: 5, width: 12, height: 8, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 }];
    document.designer.alignmentMarks = { enabled: true, locked: false, originXcm: 1, originYcm: 2, spacingMm: 100 };
    const result = await generateDesignerFabricationExport({
      designer: canonicalizeDesignerGeometry(document.designer),
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "alignment", partituraName: "Alignment" },
      sourceDocument: document,
      options: { includeReference: false, includeZones: true, includeChannels: true, includeFaceGraphic: true, includeAlignmentMarks: true },
      generatedAt: "2026-10-08T12:00:00.000Z"
    });

    assert.equal(result.files.length, 3);
    const guideGroups = result.files.map((file) => file.svg.match(/<g id="ALIGNMENT_GUIDES_NO_CUT"[\s\S]*?<\/g>/)?.[0]);
    assert.ok(guideGroups.every(Boolean));
    assert.deepEqual(new Set(guideGroups).size, 1);
    result.files.forEach((file) => {
      assert.match(file.svg, /data-purpose="alignment-calibration" data-operation-mode="no-cut" data-spacing-mm="100"/);
      assert.match(file.svg, /id="alignment_origin_horizontal"[^>]*d="M 5 20 L 15 20"/);
      assert.match(file.svg, /id="alignment_origin_vertical"[^>]*d="M 10 15 L 10 25"/);
      assert.match(file.svg, /id="alignment_x_spacing_horizontal"[^>]*d="M 105 20 L 115 20"/);
      assert.match(file.svg, /id="alignment_y_spacing_vertical"[^>]*d="M 10 115 L 10 125"/);
      assert.match(file.dxf, /ALIGNMENT_GUIDES_NO_CUT \| spacing=100mm \| remove before machining/);
      assert.equal((file.dxf.match(/\n8\nALIGNMENT_GUIDES_NO_CUT\n/g) ?? []).length, 6);
    });

    const withoutMarks = await generateDesignerFabricationExport({
      designer: document.designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "alignment", partituraName: "Alignment" },
      sourceDocument: document,
      options: { includeReference: false, includeZones: true, includeChannels: false, includeFaceGraphic: false, includeAlignmentMarks: false },
      generatedAt: "2026-10-08T12:00:00.000Z"
    });
    assert.doesNotMatch(withoutMarks.files[0].svg, /ALIGNMENT_GUIDES_NO_CUT/);
    assert.doesNotMatch(withoutMarks.files[0].dxf, /ALIGNMENT_GUIDES_NO_CUT/);
  });

  it("round-trips a direct native fillet and exports it as a compact SVG curve", async () => {
    const document = createDefaultPartituraDocument("fabrication_direct_fillet");
    const source = document.designer.buildAreas[0];
    source.shape = "rect";
    source.x = 0;
    source.y = 0;
    source.width = 10;
    source.height = 8;
    const applied = applyDesignerNativeFillet(document.designer, { type: "build_area", id: source.id, cornerIndex: 0 }, 20);
    assert.equal(applied.applied, true);
    const saved = normalizeDefaultSignLayout(JSON.parse(JSON.stringify({ ...document, designer: canonicalizeDesignerGeometry(applied.designer) })));
    const reloaded = saved.designer.buildAreas.find((entry) => entry.id === source.id)!;
    assert.equal(reloaded.name, source.name);
    assert.equal(reloaded.pathMode, "bezier");
    assert.equal(reloaded.points?.length, 5);
    assert.equal(saved.designer.derivedGeometries.length, document.designer.derivedGeometries.length);

    const result = await generateDesignerFabricationExport({
      designer: saved.designer,
      identity: { projectId: saved.projectId, partituraId: "1", partituraKey: "direct-fillet", partituraName: "Direct fillet" },
      sourceDocument: saved,
      options: { includeReference: true, includeZones: false, includeFaceGraphic: false },
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
    assert.match(result.svg, /\bC\s/);
    assert.doesNotMatch(result.svg, /geometry_derived/);
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
    document.designer.derivedGeometries = [{ id: "derived_cut", name: "Cut fillet", geometryId: "geometry_derived_cut", sourceGeometryId: "geometry_projection_cut", targetLayer: "faceGraphic", operation: "fillet", radiusMm: 2, cornerIndices: [0], passMode: "translucent", filterColor: "#FF0000", visible: true }];
    const result = await generateDesignerFabricationExport({
      designer: document.designer,
      identity: { projectId: document.projectId, partituraId: "1", partituraKey: "derived", partituraName: "Derived" },
      sourceDocument: document,
      options: { includeReference: false, includeZones: false, includeFaceGraphic: true },
      generatedAt: "2026-10-06T12:00:00.000Z"
    });
    assert.match(result.svg, /id="derived_cut"/);
    assert.match(result.svg, /data-filter-color="#FF0000"/);
    assert.match(result.svg, /\bC\s/);
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

  it("does not reuse a Build Area ID after an earlier area was deleted", async () => {
    const areas = [{ id: "build_area_3" }, { id: "build_area_2" }];
    assert.equal(nextDesignerItemNumber(areas, "build_area_"), 4);

    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    assert.doesNotMatch(canvasSource, /designer\.buildAreas\.length \+ 1/);
    assert.equal(canvasSource.match(/nextDesignerItemNumber\(designer\.buildAreas, "build_area_"\)/g)?.length, 2);
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

describe("shared node authoring context", () => {
  it("preserves the chosen node type when initializing Bezier handles", () => {
    const points = smoothBezierPoints([
      { x: 0, y: 0, nodeType: "corner" },
      { x: 10, y: 0, nodeType: "smooth" },
      { x: 10, y: 10, nodeType: "straight" },
      { x: 0, y: 10, nodeType: "symmetric" }
    ]);

    assert.equal(points[0].nodeType, "corner");
    assert.equal(points[0].handleIn, undefined);
    assert.equal(points[1].nodeType, "smooth");
    assert.ok(points[1].handleIn && points[1].handleOut);
    assert.equal(points[2].nodeType, "straight");
    assert.equal(points[2].handleOut, undefined);
    assert.equal(points[3].nodeType, "symmetric");
    assert.ok(points[3].handleIn && points[3].handleOut);
  });

  it("activates and preserves both handles on a straight compound contour", () => {
    const outer = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], pathMode: "straight" as const, closed: true as const };
    const inner = { points: [{ x: 5, y: 5 }, { x: 10, y: 5 }, { x: 10, y: 10 }, { x: 5, y: 10 }], pathMode: "straight" as const, closed: true as const };
    const shape = { x: 0, y: 0, width: 20, height: 20, points: outer.points, contours: [outer, inner], pathMode: "straight" as const };

    const curved = setPolygonNodeType(shape, 6, "smooth");

    assert.equal(curved.pathMode, "bezier");
    assert.equal(curved.contours?.[0].pathMode, "straight");
    assert.equal(curved.contours?.[1].pathMode, "bezier");
    assert.ok(curved.contours?.[1].points[2].handleIn);
    assert.ok(curved.contours?.[1].points[2].handleOut);

    const restored = setPolygonNodeType(curved, 6, "straight");
    assert.equal(restored.pathMode, "straight");
    assert.equal(restored.contours?.[1].pathMode, "straight");
    assert.equal(restored.contours?.[1].points[2].handleIn, undefined);
    assert.equal(restored.contours?.[1].points[2].handleOut, undefined);
  });

  it("uses one contextual picker and one canvas node type across geometric layers", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");

    assert.match(workspaceSource, /nodeCreationToolActive[\s\S]*?<ToolbarField label="New node">[\s\S]*?<NodeTypePicker value=\{nodeCreationType\}/);
    assert.match(workspaceSource, /nodeCreationType=\{nodeCreationType\}/);
    assert.equal(canvasSource.match(/nodeType: nodeCreationType/g)?.length, 1);
    assert.match(canvasSource, /target === "build_area"[\s\S]*target === "zone" \|\| target === "channel"[\s\S]*target === "face_graphic"/);
  });
});

describe("Designer contextual properties", () => {
  it("omits element coordinates and exposes one consistently destructive icon-only Delete action", async () => {
    const [workspaceSource, designerUiSource, buttonSource] = await Promise.all([
      readFile("components/lighting/partitura-workspace.tsx", "utf8"),
      readFile("components/lighting/designer/designer-ui.tsx", "utf8"),
      readFile("components/ui/button.tsx", "utf8")
    ]);
    const contextualBar = workspaceSource.slice(
      workspaceSource.indexOf('{editorMode === "design" ? <div className="flex h-10'),
      workspaceSource.indexOf('<div className={`grid min-h-0 flex-1')
    );
    const detailFields = designerUiSource.slice(designerUiSource.indexOf("function detailFields("), designerUiSource.indexOf("function IconToggle("));

    assert.ok(contextualBar.length > 0);
    assert.doesNotMatch(contextualBar, /<ToolbarNumber label="(?:X|Y|PX|PY)"/);
    assert.doesNotMatch(detailFields, /label: "Position"/);
    assert.equal(contextualBar.match(/<Trash2 /g)?.length, 1);
    assert.match(contextualBar, /variant="destructive"[\s\S]{0,180}aria-label="Delete selection"[\s\S]{0,120}<Trash2[^>]*\/>/);
    assert.match(buttonSource, /destructive: "border border-destructive bg-destructive/);
  });

  it("reuses one fixed Copy, Paste and Delete action group across copyable Layers objects", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    assert.match(workspaceSource, /selection\.type === "artwork" \|\| selection\.type === "zone" \|\| selection\.type === "channel" \|\| selection\.type === "face_graphic" \|\| selection\.type === "route"/);
    assert.match(workspaceSource, /if \(clipboard\.type === "channel"\)[\s\S]*?channels: \[\.\.\.designer\.channels, copy\]/);

    const deleteStart = workspaceSource.indexOf("function deleteSelection()");
    const deleteEnd = workspaceSource.indexOf("function copySelection()", deleteStart);
    const deleteSource = workspaceSource.slice(deleteStart, deleteEnd);
    assert.doesNotMatch(deleteSource, /selection\.type === "(?:zone|channel|face_graphic)" && .*locked/);

    const actionsStart = workspaceSource.indexOf('{!hasMultipleGeometrySelection && (canCopySelection || canDeleteSelection) ? (');
    const actionsEnd = workspaceSource.indexOf("</div>\n        ) : null}", actionsStart);
    const actions = workspaceSource.slice(actionsStart, actionsEnd);
    assert.ok(actionsStart >= 0 && actionsEnd > actionsStart);
    assert.match(actions, /aria-label="Copy selected object"[\s\S]*aria-label="Paste copied object"[\s\S]*aria-label="Delete selection"/);
    assert.match(actions, /disabled=\{!canPasteSelection\}/);
    assert.match(actions, /<Copy [^>]*\/>[\s\S]*<ClipboardPaste [^>]*\/>[\s\S]*<Trash2 [^>]*\/>/);
  });

  it("keeps object workflow actions visible and forbids contextual catch-all menus", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const contextualBar = workspaceSource.slice(
      workspaceSource.indexOf('{editorMode === "design" ? <div className="flex h-10'),
      workspaceSource.indexOf('<div className={`grid min-h-0 flex-1')
    );
    const faceGraphicStart = contextualBar.indexOf('editorMode === "design" && selectedFaceGraphic ? (');
    const faceGraphicEnd = contextualBar.indexOf('editorMode === "design" && selectedZone ? (', faceGraphicStart);
    const faceGraphicContext = contextualBar.slice(faceGraphicStart, faceGraphicEnd);
    const zoneStart = faceGraphicEnd;
    const zoneEnd = contextualBar.indexOf('editorMode === "design" && selectedChannel ? (', zoneStart);
    const zoneContext = contextualBar.slice(zoneStart, zoneEnd);

    assert.ok(faceGraphicStart >= 0 && faceGraphicEnd > faceGraphicStart);
    assert.ok(zoneStart >= 0 && zoneEnd > zoneStart);
    assert.doesNotMatch(contextualBar, /Locked · inspect only|Compound ·/);
    assert.doesNotMatch(faceGraphicContext, /<Badge>Face Graphic<\/Badge>|<Lock|> Lock<|label="Shape"/);
    assert.doesNotMatch(zoneContext, /label="Shape"/);
    assert.match(faceGraphicContext, /<PrimitiveDimensionNumber label=\{selectedFaceGraphic\.shape === "ellipse" \? "ØW" : "W"\}[\s\S]*?<PrimitiveDimensionNumber label=\{selectedFaceGraphic\.shape === "ellipse" \? "ØH" : "H"\}/);
    assert.match(zoneContext, /<PrimitiveDimensionNumber label=\{selectedZone\.shape === "ellipse" \? "ØW" : "W"\}[\s\S]*?<PrimitiveDimensionNumber label=\{selectedZone\.shape === "ellipse" \? "ØH" : "H"\}/);
    assert.match(workspaceSource, /function PrimitiveDimensionNumber[\s\S]*?inputMode="decimal"[\s\S]*?onBlur=\{commit\}/);
    assert.match(faceGraphicContext, /label="Pass"[\s\S]*label="Filter color"/);
    assert.match(zoneContext, /label="Node"/);
    assert.match(contextualBar, /<Layers2 className="h-4 w-4" \/> Project Geometry/);
    assert.match(contextualBar, /!hasMultipleGeometrySelection \? <>[\s\S]*<Badge>\{geometrySelections\.length\} selected<\/Badge>/);
    assert.match(contextualBar, /aria-label="Union selected profiles"[\s\S]*aria-label="Subtract selected profiles"[\s\S]*aria-label="Intersect selected profiles"[\s\S]*aria-label="Exclude selected profiles"/);
    assert.match(contextualBar, /aria-label="Ungroup selected vectors"[\s\S]*<Ungroup className="h-4 w-4" \/>[\s\S]*aria-label="Group selected vectors"[\s\S]*<Group className="h-4 w-4" \/>/);
    assert.match(contextualBar, /<span>Union<\/span>[\s\S]*<span>Subtract<\/span>[\s\S]*<span>Intersect<\/span>[\s\S]*<span>Exclude<\/span>/);
    assert.doesNotMatch(contextualBar, /title="(?:More|Actions|Path operations)"|aria-label="(?:More|Actions|Path operations)"|<Ellipsis |Path operations/);
    assert.match(contextualBar, /label="Offset"[\s\S]*<Tally2 className="h-4 w-4" \/> Offset Path[\s\S]*label="Project to"[\s\S]*Project Geometry/);
    assert.match(contextualBar, /Create Zones[\s\S]*Generate Holes[\s\S]*Convert to paths/);
  });

});

describe("Designer zone layout visibility", () => {
  it("keeps persistent Zone contours independent from selection", async () => {
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");

    assert.match(canvasSource, /<img src=\{url\}[^>]*object-contain/);
    assert.match(rendererSource, /filter\(\(zone\) => zone\.visible !== false\)/);
    assert.match(rendererSource, /strokeColor: options\.selected \? "#38bdf8" : "#2563eb"/);
  });
});

describe("canonical designer geometry schema", () => {
  it("migrates a legacy document without losing editable shapes", () => {
    const legacy = createDefaultPartituraDocument();
    if (!legacy.designer) assert.fail("default designer missing");
    delete legacy.designer.designerSchemaVersion;
    delete legacy.designer.geometries;
    delete (legacy.designer as Partial<typeof legacy.designer>).filletRadiusMm;
    delete (legacy.designer as Partial<typeof legacy.designer>).offsetDistanceMm;
    delete (legacy.designer as Partial<typeof legacy.designer>).offsetJoin;
    delete (legacy.designer as Partial<typeof legacy.designer>).alignmentMarks;
    legacy.designer.zones[0].geometryId = undefined;

    const normalized = normalizeDefaultSignLayout(legacy).designer;
    assert.equal(normalized?.designerSchemaVersion, DESIGNER_SCHEMA_VERSION);
    assert.equal(normalized?.zones[0].geometryId, "geometry_zone_fondo");
    assert.ok(normalized?.geometries?.some((geometry) => geometry.id === normalized.zones[0].geometryId));
    assert.deepEqual(normalized?.zones[0].points, legacy.designer.zones[0].points);
    assert.equal(normalized.fabricationCutterDiameterMm, 3.175);
    assert.equal(normalized.fabricationCutterUnit, "mm");
    assert.equal(normalized.filletRadiusMm, 1.5875);
    assert.equal(normalized.offsetDistanceMm, 2);
    assert.equal(normalized.offsetJoin, "miter");
    assert.equal(normalized.channelRouterDiameterMm, 10);
    assert.deepEqual(normalized.alignmentMarks, { enabled: false, locked: false, originXcm: 2, originYcm: 2, spacingMm: 100 });
  });

  it("persists a custom cutter diameter independently from canvas units", () => {
    const document = createDefaultPartituraDocument("cutter_setup");
    const baseline = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document))).designer;
    const compileBefore = designerCompileSignature(baseline);
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify({
      ...document,
      designer: { ...baseline, rulerUnit: "cm", fabricationCutterDiameterMm: 6.35, fabricationCutterUnit: "in", filletRadiusMm: 8 }
    }))).designer;
    assert.equal(normalized.fabricationCutterDiameterMm, 6.35);
    assert.equal(normalized.fabricationCutterUnit, "in");
    assert.equal(normalized.filletRadiusMm, 8);
    assert.equal(normalized.rulerUnit, "cm");
    assert.equal(designerCompileSignature(normalized), compileBefore);
  });

  it("persists the Channel routing profile without invalidating electrical compile", () => {
    const document = createDefaultPartituraDocument("channel_router_setup");
    const normalized = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));
    const compileBefore = designerCompileSignature(normalized.designer);
    normalized.designer.channelRouterDiameterMm = 6.35;

    const reloaded = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(normalized)));
    assert.equal(reloaded.designer.channelRouterDiameterMm, 6.35);
    assert.equal(designerCompileSignature(reloaded.designer), compileBefore);
  });

  it("persists the last Offset Path settings without invalidating electrical compile", () => {
    const document = createDefaultPartituraDocument("offset_setup");
    const baseline = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(document)));
    const compileBefore = designerCompileSignature(baseline.designer);
    baseline.designer.offsetDistanceMm = -3.175;
    baseline.designer.offsetJoin = "round";

    const reloaded = normalizeDefaultSignLayout(JSON.parse(JSON.stringify(baseline)));
    assert.equal(reloaded.designer.offsetDistanceMm, -3.175);
    assert.equal(reloaded.designer.offsetJoin, "round");
    assert.equal(designerCompileSignature(reloaded.designer), compileBefore);
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
    assert.equal(geometryToolAllowedOnLayer("zone_polygon", "zones"), true);
  });

  it("uses one Zone path tool with a node-type picker", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    assert.match(source, /label="Draw a polygon vector" icon=\{VectorPolygonIcon\}/);
    assert.doesNotMatch(source, /zone_bezier|Bezier Zone/);
    assert.match(source, /nodeCreationToolActive[\s\S]*NodeTypePicker/);
  });

  it("uses the square centerline icon for Work Lines", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    assert.match(source, /FlipHorizontal as SquareCenterlineDashedVertical/);
    assert.match(source, /label="Work line · continuous construction reference" icon=\{SquareCenterlineDashedVertical\}/);
  });

  it("uses the configured router-bit diameter as the channel trace width", async () => {
    assert.deepEqual(CHANNEL_ROUTER_BIT_PRESETS.map((preset) => preset.diameterMm), [3.175, 4.7625, 6, 6.35, 8, 9.525, 10, 12, 12.7]);
    assert.equal(CHANNEL_ROUTER_BIT_PRESETS.find((preset) => preset.label.startsWith("1/4 in"))?.diameterMm, 6.35);
    assert.equal(channelWidthForRouterDiameter(8), 8);
    assert.equal(channelWidthForRouterDiameter(2), 3);
    assert.equal(channelWidthForRouterDiameter(25), 20);

    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    assert.match(canvasSource, /widthMm: channelWidthForRouterDiameter\(shapeDraft\.widthMm \?\? channelRouterDiameterMm\)/);
    assert.match(canvasSource, /cap:\s*"round",/);
    assert.doesNotMatch(canvasSource, /constrainedChannelBezierHandle/);
    assert.doesNotMatch(canvasSource, /widthMm:\s*10,/);
    assert.doesNotMatch(canvasSource, /cap:\s*"butt",/);

    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    assert.doesNotMatch(workspaceSource, /No lighting setup/);
    assert.match(workspaceSource, /Router bit Ø/);
    assert.doesNotMatch(workspaceSource, /label="Unit"/);
    assert.match(workspaceSource, /setChannelNodeRadius/);
    assert.match(workspaceSource, /label="Fillet"/);
    assert.doesNotMatch(workspaceSource, /label="Fillet radius"/);
    assert.match(workspaceSource, /const directFilletAvailable = Boolean\(selectedBuildArea \|\| selectedZone \|\| selectedFaceGraphic\);/);
    assert.doesNotMatch(workspaceSource, /updateChannelPoint\(selectedChannel/);
    assert.match(workspaceSource, /channelRouterDiameterMm: widthMm/);
    assert.match(workspaceSource, /setChannelRouterDiameter\(selectedChannel\.id/);
  });

  it("keeps Channel node and handle drags local until one committed pointer release", async () => {
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    assert.match(canvasSource, /drag\.type === "channel-point"[\s\S]*?requestAnimationFrame\(flushChannelDragPreview\)/);
    assert.match(canvasSource, /drag\.type === "channel-handle"[\s\S]*?requestAnimationFrame\(flushChannelDragPreview\)/);
    assert.match(canvasSource, /interactiveChannelId: drag\?\.type === "channel-move" \|\| drag\?\.type === "channel-point" \|\| drag\?\.type === "channel-handle"/);
    assert.match(canvasSource, /designer: channelDragPreview \? \{/);

    const previewStart = canvasSource.indexOf("function flushChannelDragPreview()");
    const commitStart = canvasSource.indexOf("function commitChannelDragPreview(");
    const panStart = canvasSource.indexOf("function startPanDrag(");
    assert.ok(previewStart >= 0 && commitStart > previewStart && panStart > commitStart);
    assert.doesNotMatch(canvasSource.slice(previewStart, commitStart), /onChangeRef\.current/);
    assert.match(canvasSource.slice(commitStart, panStart), /onChangeRef\.current/);
    assert.match(canvasSource, /endedDrag\?\.type === "channel-point" \|\| endedDrag\?\.type === "channel-handle"\) commitChannelDragPreview\(\)/);

    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");
    assert.doesNotMatch(rendererSource, /channelTightBend|drawPaperChannelBendMarker|ChannelBendMeasurement/);
    assert.match(rendererSource, /if \(!options\.interactive\) \{\s*resolveChannelOutlineContours\(channel\)/);
  });
});

describe("Channel creation from selected paths", () => {
  it("keeps the source-path selection when the Channel tool is activated", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    assert.match(workspaceSource, /if \(tool !== "channel_bezier"\) setGeometrySelections\(\[\]\);/);
    assert.match(workspaceSource, /> Generate Channel/);
    assert.doesNotMatch(workspaceSource, /> Create from \{/);
    assert.match(workspaceSource, /const sourceZoneName = geometrySelections\.length === 1/);
    assert.match(workspaceSource, /name: sourceZoneName \?\? `Channel/);
  });

  it("orders a connected chain and preserves editable Bezier handles when a segment is reversed", () => {
    const result = channelPathsFromGeometries([
      { id: "first", kind: "path", x: 0, y: 0, width: 2, height: 0, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], pathMode: "straight", closed: false },
      { id: "second", kind: "path", x: 2, y: 0, width: 2, height: 1, points: [{ x: 4, y: 1, handleOut: { x: -0.5, y: 0 }, nodeType: "smooth" }, { x: 2, y: 0, handleIn: { x: 0.5, y: 0 }, nodeType: "smooth" }], pathMode: "bezier", closed: false }
    ], "center", 6);

    assert.equal(result.issue, null);
    assert.equal(result.paths.length, 1);
    assert.deepEqual(result.paths[0].points.map(({ x, y }) => ({ x, y })), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 1 }]);
    assert.deepEqual(result.paths[0].points[1].handleOut, { x: 0.5, y: 0 });
    assert.deepEqual(result.paths[0].points[2].handleIn, { x: -0.5, y: 0 });
    assert.equal(result.paths[0].pathMode, "bezier");
  });

  it("rejects a branch instead of guessing the physical Channel route", () => {
    const branch = channelPathsFromGeometries([
      { id: "left", kind: "path", x: 0, y: 0, width: 1, height: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], pathMode: "straight", closed: false },
      { id: "right", kind: "path", x: 1, y: 0, width: 1, height: 0, points: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathMode: "straight", closed: false },
      { id: "up", kind: "path", x: 1, y: -1, width: 0, height: 1, points: [{ x: 1, y: 0 }, { x: 1, y: -1 }], pathMode: "straight", closed: false }
    ], "center", 6);
    assert.equal(branch.issue, "branch");
  });

  it("keeps side-aligned Bezier paths editable while shifting their centerline by half the Channel width", () => {
    const source = { id: "curve", kind: "path" as const, x: 0, y: 0, width: 4, height: 2, points: [{ x: 0, y: 0, handleOut: { x: 1, y: 0 }, nodeType: "smooth" as const }, { x: 4, y: 2, handleIn: { x: -1, y: 0 }, nodeType: "smooth" as const }], pathMode: "bezier" as const, closed: false };
    const centered = channelPathsFromGeometries([source], "center", 10);
    const left = channelPathsFromGeometries([source], "left", 10);
    assert.equal(centered.issue, null);
    assert.equal(left.issue, null);
    assert.equal(left.paths[0].pathMode, "bezier");
    assert.deepEqual(left.paths[0].points.map((point) => point.handleIn ?? point.handleOut), centered.paths[0].points.map((point) => point.handleIn ?? point.handleOut));
    assert.ok(Math.hypot(left.paths[0].points[0].x - source.points[0].x, left.paths[0].points[0].y - source.points[0].y) > 0.49);
  });
});

describe("safe whole-object movement", () => {
  it("fixes movement to the selected axis and lets Ctrl temporarily release both axes", () => {
    assert.deepEqual(designerConstrainedMoveDelta("x", 4, 7, false), { x: 4, y: 0 });
    assert.deepEqual(designerConstrainedMoveDelta("y", 4, 7, false), { x: 0, y: 7 });
    assert.deepEqual(designerConstrainedMoveDelta("x", 4, 7, true), { x: 4, y: 7 });
  });

  it("promotes node and resize hits to their complete movable owner", () => {
    assert.deepEqual(designerWholeObjectHit({ type: "zone_point", id: "zone_1", pointIndex: 2 }), { type: "zone", id: "zone_1" });
    assert.deepEqual(designerWholeObjectHit({ type: "build_area_resize", id: "reference_1", handle: "se" }), { type: "build_area", id: "reference_1" });
    assert.deepEqual(designerWholeObjectHit({ type: "route_point", id: "route_1", pointIndex: 0 }), { type: "route", id: "route_1" });
  });

  it("exposes one Move tool with an explicit X/Y control", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    assert.match(workspaceSource, /active=\{tool === "move"\}[\s\S]*?icon=\{Move\}/);
    assert.match(workspaceSource, /label="Fixed axis"/);
    assert.match(workspaceSource, /<option value="x">X only<\/option>/);
    assert.match(workspaceSource, /<option value="y">Y only<\/option>/);
    assert.match(canvasSource, /tool !== "move" \|\| event\.ctrlKey \|\| event\.metaKey/);
    assert.match(canvasSource, /tool === "move" \? designerWholeObjectHit\(rawHit\) : rawHit/);
    assert.match(canvasSource, /tool === "select" && !pickedOwnerIsSelected \? pickedOwner : pickedHit/);
    assert.match(canvasSource, /if \(tool !== "move" \|\| designer\.layers\.zones\.locked\) return;\s*setDrag\(\{ type: "zone-move"/);
  });
});

describe("Channel Project Geometry", () => {
  it("resolves a linked Channel projection as its swept perimeter while retaining the original centerline", () => {
    const designer = createDefaultPartituraDocument("channel_projection").designer;
    const channel: DesignerChannelForm = { id: "channel_projected", name: "Projected", points: [{ x: 2, y: 3 }, { x: 12, y: 3 }], pathMode: "straight", widthMm: 10, closed: false, cap: "round", visible: true, locked: false, opacity: 1 };
    const canonical = canonicalizeDesignerGeometry({ ...designer, channels: [channel] });
    canonical.projections = [{ id: "channel_perimeter", name: "Projected perimeter", geometryId: "geometry_projection_channel_perimeter", sourceGeometryId: canonical.channels[0].geometryId!, targetLayer: "faceGraphic", linked: true, visible: true }];

    const centerline = resolveDesignerProjectionGeometry(canonical, "channel_perimeter").geometry!;
    const perimeter = resolveProjectedGeometry(canonical, "channel_perimeter").geometry!;
    assert.equal(centerline.closed, false);
    assert.equal(perimeter.closed, true);
    assert.ok(perimeter.height >= 0.99);
    assert.equal(canonical.channels[0].points.length, 2);
    assert.deepEqual(pickDesignerHit(canonical, "faceGraphic", { x: 7, y: 3.4 }, { x: 0, y: 0, width: 20, height: 10 }, { width: 1000, height: 500 }), { type: "projection", id: "channel_perimeter" });

    const widened = canonicalizeDesignerGeometry({ ...canonical, channels: canonical.channels.map((entry) => ({ ...entry, widthMm: 20 })) });
    const widenedPerimeter = resolveProjectedGeometry(widened, "channel_perimeter").geometry!;
    assert.ok(widenedPerimeter.height > perimeter.height);
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

  it("keeps the black and white vinyl preview transient and scoped to Design", async () => {
    const [workspaceSource, layersSource, canvasSource, rendererSource] = await Promise.all([
      readFile("components/lighting/partitura-workspace.tsx", "utf8"),
      readFile("components/lighting/designer/designer-ui.tsx", "utf8"),
      readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8"),
      readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8")
    ]);
    assert.match(workspaceSource, /useState\(false\)[\s\S]{0,120}faceGraphicVinylPreview|faceGraphicVinylPreview[\s\S]{0,120}useState\(false\)/);
    assert.match(layersSource, /Preview vinyl in black and white/);
    assert.match(canvasSource, /presentation === "animate"[\s\S]*?drawPaperAnimationMap[\s\S]*?else drawPaperDesigner/);
    assert.match(rendererSource, /faceGraphicVinylPreview && activeLayer === "faceGraphic"/);
    assert.match(rendererSource, /element\.passMode === "opaque" \? "#050505" : "#ffffff"/);
    assert.match(rendererSource, /selectedDerivedGeometryId === element\.id/);
  });
});

describe("Face Graphic optical renderer", () => {
  it("clips Front illumination to its owning zone", async () => {
    const zone = { id: "zone_front", kind: "zone" as const } as VisualShape;
    const channel = { id: "channel_front", kind: "channel" as const } as VisualShape;
    const unrelated = { id: "zone_other", kind: "zone" as const } as VisualShape;
    const source = { targetType: "zone" as const, targetId: "zone_front" };

    assert.equal(opticalTargetShape([unrelated, channel, zone], source), zone);
    assert.equal(opticalTargetShape([unrelated, channel], source), null);
    const boundaryChannel = { ...channel, x: 42.5, y: -0.5, width: 87, height: 41 } as VisualShape;
    const maskBounds = opticalTargetMaskBounds(boundaryChannel, { widthCm: 130, heightCm: 40 });
    assert.ok(maskBounds.y < -0.5);
    assert.ok(maskBounds.y + maskBounds.height > 40.5);

    const rendererSource = await readFile("components/lighting/player/gpu/webgl2-player-renderer.ts", "utf8");
    assert.equal(opticalTargetMaskMode("front"), 1);
    assert.match(rendererSource, /maskedTargetAlpha = uTargetMaskMode < -0\.5 \? 1\.0 - targetAlpha : targetAlpha/);
    assert.match(rendererSource, /targetUv = \(vWorld - uTargetMaskBounds\.xy\) \/ uTargetMaskBounds\.zw/);
  });

  it("rasterizes cropped Front and Face Graphic masks densely enough for zoomed curves", () => {
    assert.deepEqual(targetMaskTextureSize({ x: 30, y: 18, width: 3, height: 16 }), { width: 192, height: 1024 });
    assert.deepEqual(targetMaskTextureSize({ x: 48, y: 22, width: 16, height: 11 }), { width: 1024, height: 704 });
    assert.deepEqual(faceMaskTextureSize({ bounds: { widthCm: 170, heightCm: 40 } }), { width: 2048, height: 482 });
  });

  it("keeps Halo and Wall Wash off every zone and channel surface", async () => {
    assert.equal(opticalTargetMaskMode("halo"), -1);
    assert.equal(opticalTargetMaskMode("wall_wash"), -1);

    const owner = { id: "zone_owner", kind: "zone" as const } as VisualShape;
    const neighbor = { id: "zone_neighbor", kind: "zone" as const } as VisualShape;
    const channel = { id: "channel_neighbor", kind: "channel" as const } as VisualShape;
    const faceGraphic = { id: "face", kind: "face-graphic" as const } as VisualShape;
    const source = { mode: "halo" as const, targetType: "zone" as const, targetId: owner.id };
    assert.deepEqual(opticalOccluderShapes([faceGraphic, neighbor, channel, owner], source), [neighbor, channel, owner]);

    const rendererSource = await readFile("components/lighting/player/gpu/webgl2-player-renderer.ts", "utf8");
    assert.match(rendererSource, /for \(const occluder of occluders\)/);
    assert.match(rendererSource, /1\.0 - targetAlpha/);
    assert.doesNotMatch(rendererSource, /step\(0\.001, targetAlpha\)/);
    assert.match(rendererSource, /step\(0\.5, abs\(uTargetMaskMode\)\)/);
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

  it("keeps the black-and-white preview and physical Face Graphic mask visibility consistent", () => {
    const designer = createDefaultPartituraDocument("derived_face_graphic_optics").designer;
    const source = designer.zones[0];
    designer.faceGraphics = [
      { id: "visible_mask", name: "Visible", shape: "rect", x: 0, y: 0, width: 10, height: 10, passMode: "clear", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 },
      { id: "hidden_mask", name: "Hidden", shape: "rect", x: 0, y: 0, width: 20, height: 20, passMode: "translucent", filterColor: "#00FF00", visible: false, locked: false, opacity: 1 }
    ];
    designer.projections = [{ id: "projection", name: "Projection", geometryId: "geometry_projection", sourceGeometryId: source.geometryId!, targetLayer: "faceGraphic", linked: true, visible: false }];
    designer.derivedGeometries = [{ id: "red_offset", name: "Red offset", geometryId: "geometry_red_offset", sourceGeometryId: "geometry_projection", targetLayer: "faceGraphic", operation: "offset", distanceMm: 2, join: "round", miterLimit: 4, passMode: "translucent", filterColor: "#FF0000", visible: false }];

    const physical = resolvePhysicalFaceGraphics(designer);
    assert.equal(physical.length, 1);
    assert.equal(physical[0].id, "visible_mask");
    assert.deepEqual(faceGraphicTransmissionAtPoint(physical, { x: 1, y: 1 }), { passMode: "clear", filterColor: "#FFFFFF" });
  });
});

describe("Offset Path and legacy derived offsets", () => {
  it("materializes a native offset and directly recalculates it while the result remains selected", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const start = workspaceSource.indexOf("function createIndependentOffsetGeometry()");
    const end = workspaceSource.indexOf("function applyDirectFillet(", start);
    const offsetSource = workspaceSource.slice(start, end);
    assert.match(offsetSource, /distanceMm: designer\.offsetDistanceMm/);
    assert.match(offsetSource, /join: designer\.offsetJoin/);
    assert.match(offsetSource, /resolveDesignerDerivedGeometry\(\{ \.\.\.designer, derivedGeometries: \[\.\.\.designer\.derivedGeometries, ephemeralOffset\] \}, ephemeralOffset\.id\)/);
    assert.match(offsetSource, /Independent offset created/);
    assert.doesNotMatch(offsetSource, /updateDesigner\(\{ \.\.\.designer, derivedGeometries:/);
    assert.match(offsetSource, /editableNativeOffsetRef\.current = \{ target: "zone"/);
    assert.match(offsetSource, /function patchOffsetSettings\(/);
    assert.match(offsetSource, /selection\?\.type !== editable\.target \|\| selection\.id !== editable\.id/);
    assert.match(offsetSource, /resolveDesignerDerivedGeometry\(calculationDesigner, ephemeralId\)/);
    assert.match(offsetSource, /Offset updated to/);

    assert.match(workspaceSource, /label="Offset" value=\{designer\.offsetDistanceMm\}/);
    assert.match(workspaceSource, /patchOffsetSettings\(\{ offsetDistanceMm \}\)/);
    assert.match(workspaceSource, /patchOffsetSettings\(\{ offsetJoin:/);
    assert.match(workspaceSource, /onClick=\{createIndependentOffsetGeometry\}><Tally2 className="h-4 w-4" \/> Offset Path/);
    assert.match(workspaceSource, /selectedDerivedGeometry\.operation === "fillet" \? <Button[\s\S]*?>Break Link<\/Button> : null/);
  });
});

describe("Project Geometry and legacy linked projections", () => {
  it("materializes new projections without changing focus or creating a link", async () => {
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const start = workspaceSource.indexOf("function projectSelectedGeometry()");
    const end = workspaceSource.indexOf("function applyBooleanOperation(", start);
    const projectSource = workspaceSource.slice(start, end);
    assert.match(projectSource, /resolveDesignerProjectionGeometry\(\{ \.\.\.designer, projections: \[\.\.\.designer\.projections, projection\] \}, projection\.id\)/);
    assert.match(projectSource, /Independent projection created/);
    assert.doesNotMatch(projectSource, /updateDesigner\(\{ \.\.\.designer, projections:/);
    assert.doesNotMatch(projectSource, /setActiveLayer|setSelection|breakProjectionLink/);
    const legacyProjectionStart = workspaceSource.indexOf(") : editorMode === \"design\" && selectedProjection ? (");
    const legacyProjectionEnd = workspaceSource.indexOf(") : editorMode === \"design\" && selectedGeometryId ? (", legacyProjectionStart);
    assert.doesNotMatch(workspaceSource.slice(legacyProjectionStart, legacyProjectionEnd), /Break Link|breakProjectionLink/);
  });

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
  it("keeps a sharp Channel corner valid and applies its selected-node Fillet directly to the center trace", () => {
    const document = createDefaultPartituraDocument("channel_corner_fillet");
    if (!document.designer) assert.fail("default designer missing");
    const cornerChannel: DesignerChannelForm = {
      id: "channel_corner",
      name: "Corner channel",
      points: [
        { x: 0, y: 0, nodeType: "straight" },
        { x: 5, y: 0, nodeType: "corner" },
        { x: 5, y: 5, nodeType: "straight" }
      ],
      pathMode: "bezier",
      widthMm: 10,
      closed: false,
      cap: "round",
      visible: true,
      locked: false,
      opacity: 1
    };
    const canonical = canonicalizeDesignerGeometry({ ...document.designer, channels: [cornerChannel] });
    const sharpBorders = channelBorderPolylines(canonical.channels[0]);
    assert.ok(sharpBorders.left.some((point) => Math.abs(point.x - 4.5) < 1e-8 && Math.abs(point.y - 0.5) < 1e-8));
    const outsideJoin = sharpBorders.right.filter((point) => Math.hypot(point.x - 5, point.y) < 0.500001);
    assert.ok(outsideJoin.length > 2);
    outsideJoin.forEach((point) => assert.ok(Math.abs(Math.hypot(point.x - 5, point.y) - 0.5) < 1e-6));

    const rounded = canonicalizeDesignerGeometry({
      ...canonical,
      channels: canonical.channels.map((channel) => ({
        ...channel,
        points: channel.points.map((point, index) => index === 1 ? { ...point, radiusMm: 7 } : point)
      }))
    }).channels[0];
    const roundedCenter = channelCenterPolyline(rounded);
    assert.equal(rounded.closed, false);
    assert.ok(roundedCenter.length > cornerChannel.points.length);
    assert.ok(!roundedCenter.some((point) => Math.abs(point.x - 5) < 1e-8 && Math.abs(point.y) < 1e-8));
    assert.ok(roundedCenter.some((point) => Math.abs(point.x - 4.3) < 1e-8 && Math.abs(point.y) < 1e-8));
    assert.ok(roundedCenter.some((point) => Math.abs(point.x - 5) < 1e-8 && Math.abs(point.y - 0.7) < 1e-8));
    const mixedBezier = canonicalizeDesignerGeometry({
      ...canonical,
      channels: [{
        ...cornerChannel,
        points: [
          { ...cornerChannel.points[0], handleOut: { x: 2, y: 0 } },
          { ...cornerChannel.points[1], radiusMm: 7 },
          cornerChannel.points[2]
        ]
      }]
    }).channels[0];
    const mixedCenter = channelCenterPolyline(mixedBezier);
    assert.ok(mixedCenter.length > cornerChannel.points.length);
    assert.ok(!mixedCenter.some((point) => Math.abs(point.x - 5) < 1e-8 && Math.abs(point.y) < 1e-8));

    const constrainedBezier: DesignerChannelForm = {
      ...cornerChannel,
      points: [
        { x: 84.78749381416414, y: 35.17708416164228, nodeType: "smooth", handleOut: { x: 0.17767116704313363, y: -0.02526377465237741 } },
        { x: 85.21552102505045, y: 34.895068968984134, nodeType: "straight", radiusMm: 9 },
        { x: 86.316, y: 32.502, nodeType: "straight" }
      ]
    };
    const constrainedCenter = channelCenterPolyline(constrainedBezier);
    assert.ok(constrainedCenter.length > constrainedBezier.points.length);
    assert.ok(!constrainedCenter.some((point) => Math.hypot(point.x - constrainedBezier.points[1].x, point.y - constrainedBezier.points[1].y) < 1e-8));

    const constrainedResult = filletDesignerGeometry({
      id: "constrained_channel_center",
      kind: "path",
      x: 84,
      y: 32,
      width: 3,
      height: 4,
      points: constrainedBezier.points,
      pathMode: "bezier",
      closed: false
    }, 9, [1]);
    assert.match(constrainedResult.warnings.join(" "), /clamped to fit/);
  });

  it("projects the circular bit footprint symmetrically for right-hand corners", () => {
    const channel: DesignerChannelForm = {
      id: "right_corner",
      name: "Right corner",
      points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: -5 }],
      pathMode: "straight",
      widthMm: 10,
      closed: false,
      cap: "round",
      visible: true,
      locked: false,
      opacity: 1
    };
    const borders = channelBorderPolylines(channel);
    assert.ok(borders.right.some((point) => Math.abs(point.x - 4.5) < 1e-8 && Math.abs(point.y + 0.5) < 1e-8));
    const outsideJoin = borders.left.filter((point) => Math.hypot(point.x - 5, point.y) < 0.500001);
    assert.ok(outsideJoin.length > 2);
    outsideJoin.forEach((point) => assert.ok(Math.abs(Math.hypot(point.x - 5, point.y) - 0.5) < 1e-6));
  });

  it("builds an acute Channel border from the swept bit footprint without internal seams", async () => {
    paper.setup(new paper.Size(200, 200));
    const acuteChannel: DesignerChannelForm = {
      id: "acute_saved_channel",
      name: "Acute saved Channel",
      points: [
        { x: 71.195, y: 29.033, nodeType: "smooth", handleIn: { x: 0, y: -0.8964 }, handleOut: { x: 0, y: 0.8964 } },
        { x: 69.413, y: 31.048 },
        { x: 70.894, y: 33.856, nodeType: "corner", radiusMm: 3 },
        { x: 85.421, y: 33.822, nodeType: "corner", radiusMm: 3 },
        { x: 80.898, y: 29.089, nodeType: "smooth", handleIn: { x: -0.0612, y: 0.86598 }, handleOut: { x: 0.0612, y: -0.86598 } }
      ],
      pathMode: "bezier",
      widthMm: 6,
      closed: false,
      cap: "round",
      visible: true,
      locked: false,
      opacity: 1
    };
    const contours = sweptChannelOutlineContours(paper, channelCenterPolyline(acuteChannel), 0.6, false, true);
    assert.equal(contours.length, 1);
    assert.ok(contours[0].every((point) => distanceToChannelCenter(acuteChannel, point) > 0.25));

    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");
    assert.match(rendererSource, /strokeColor: options\.selected \? "rgba\(245,158,11,0\.30\)" : "rgba\(148,163,184,0\.16\)"/);
    assert.match(rendererSource, /strokeWidth: channelStrokeWidth,\s+strokeJoin: "round"/);
    assert.match(rendererSource, /resolveChannelOutlineContours\(channel\)/);
    assert.doesNotMatch(rendererSource, /openChannelOutline\(channel\)/);
    assert.doesNotMatch(rendererSource, /resolveCrossings/);
    assert.doesNotMatch(rendererSource, /strokeWidth: channelStrokeWidth \+ \(options\.selected \? 3\.2 : 2\)/);
  });

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
        assert.ok(borders.left.length >= center.length);
        assert.ok(borders.right.length >= center.length);
        assert.ok([...borders.left, ...borders.right].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
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
    assert.equal("minBendRadiusMm" in channel, false);
    assert.equal("bendDirection" in channel, false);
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

  it("uses Channels panel order as overlap selection precedence", () => {
    const designer = createDefaultPartituraDocument("channel_layer_order").designer!;
    const channel = (id: string): DesignerChannelForm => ({
      id,
      name: id,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      pathMode: "straight",
      widthMm: 10,
      closed: false,
      cap: "round",
      visible: true,
      locked: false,
      opacity: 1
    });
    designer.zones = [];
    designer.channels = [channel("channel_front"), channel("channel_back")];
    const viewport = { x: 0, y: -5, width: 20, height: 10 };
    const canvas = { width: 1000, height: 500 };

    assert.deepEqual(pickDesignerHit(designer, "zones", { x: 5, y: 0 }, viewport, canvas), { type: "channel", id: "channel_front" });
    assert.deepEqual(pickAnimationTarget(designer, { x: 5, y: 0 }, 0.1), { type: "channel", id: "channel_front" });

    designer.channels.reverse();
    assert.deepEqual(pickDesignerHit(designer, "zones", { x: 5, y: 0 }, viewport, canvas), { type: "channel", id: "channel_back" });
    assert.deepEqual(pickAnimationTarget(designer, { x: 5, y: 0 }, 0.1), { type: "channel", id: "channel_back" });
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

  it("maps a selected zone to all of its clip targets", () => {
    const designer = createDefaultPartituraDocument("zone_to_clip_selection").designer!;
    designer.zones = [{ id: "zone_logo", name: "Logo", shape: "rect", x: 0, y: 0, width: 10, height: 10, visible: true, locked: false, opacity: 1 }];
    designer.lightSources = [
      { ...createDefaultOpticalTreatment("zone", "zone_logo", "front"), id: "source_logo_front" },
      { ...createDefaultOpticalTreatment("zone", "zone_logo", "halo"), id: "source_logo_halo" }
    ];

    assert.deepEqual(
      designerClipTargetIdsForSelection(designer, { type: "zone", id: "zone_logo" }),
      ["source_logo_front", "source_logo_halo", "zone_logo"]
    );
  });

  it("offers separate clip creation targets for Front and Halo on the same zone", () => {
    const targets = [
      { id: "full_sign", name: "Full sign" },
      { id: "source_logo_front", name: "Logo · Front" },
      { id: "source_logo_halo", name: "Logo · Halo" }
    ];

    assert.deepEqual(
      clipTargetsForSelection(targets, ["source_logo_front", "source_logo_halo", "zone_logo"]),
      [targets[1], targets[2]]
    );
  });

  it("shows only the selected clip source calibration for a shared zone", () => {
    const sources = [
      { id: "source_logo_front", targetType: "zone" as const, targetId: "zone_logo", mode: "front" },
      { id: "source_logo_halo", targetType: "zone" as const, targetId: "zone_logo", mode: "halo" }
    ];

    assert.deepEqual(
      clipLightSourcesForTarget(sources, { type: "zone", id: "zone_logo" }, "source_logo_halo"),
      [sources[1]]
    );
    assert.deepEqual(
      clipLightSourcesForTarget(sources, { type: "zone", id: "zone_logo" }, null),
      sources
    );
  });

  it("offers only same-mode local and global scope targets", () => {
    const sources = [
      { id: "source_logo_front", name: "Logo · Front", mode: "front" as const },
      { id: "source_text_front", name: "Text · Front", mode: "front" as const },
      { id: "source_logo_halo", name: "Logo · Halo", mode: "halo" as const }
    ];

    assert.deepEqual(clipScopeTargets(sources, "source_logo_front"), [
      { id: "source_logo_front", name: "Logo · Front" },
      { id: "source_text_front", name: "Text · Front" },
      { id: "full_front", name: "All Front" }
    ]);
    assert.deepEqual(clipScopeTargets(sources, "full_halo"), [
      { id: "source_logo_halo", name: "Logo · Halo" },
      { id: "full_halo", name: "All Halo" }
    ]);
  });

  it("compiles separate global groups for Front and Halo sources", () => {
    const designer = createDefaultPartituraDocument("typed_global_targets").designer!;
    const target = designer.zones[0];
    const string = designer.routes.find((route) => route.kind === "led_string");
    assert.ok(target && string);
    designer.lightSources = [
      { ...createDefaultOpticalTreatment("zone", target.id, "front"), id: "source_front", stringIds: [string.id] },
      { ...createDefaultOpticalTreatment("zone", target.id, "halo"), id: "source_halo", stringIds: [string.id] }
    ];

    const groups = compileDesignerLayout(designer).groups;
    assert.deepEqual(groups.find((group) => group.id === "full_front")?.members, [{ type: "zone", id: "source_front" }]);
    assert.deepEqual(groups.find((group) => group.id === "full_halo")?.members, [{ type: "zone", id: "source_halo" }]);
  });

  it("requires a selected source with an assigned strip to create a clip", async () => {
    const source = await readFile("components/lighting/designer/designer-animate-timeline.tsx", "utf8");

    assert.match(source, /creatableSourceIds\.has\(targetId\)/);
    assert.match(source, /Select a zone with an assigned light strip/);
    assert.match(source, /Select label="Scope"/);
    assert.doesNotMatch(source, /clipCreationTargets\[0\]\?\.id \?\? "full_sign"/);
  });

  it("renames the selected clip from its inspector", async () => {
    const source = await readFile("components/lighting/designer/designer-animate-timeline.tsx", "utf8");

    assert.match(source, /Name[\s\S]*?value=\{clip\.name\}[\s\S]*?onChange=\{\(event\) => onChange\(\{ name: event\.target\.value \}\)\}/);
    assert.match(source, /placeholder="Letter or effect name"/);
  });

  it("keeps visible Front, Halo and Wall indicators on timeline clips", async () => {
    const source = await readFile("components/lighting/designer/designer-animate-timeline.tsx", "utf8");

    assert.match(source, /mode === "front"[\s\S]*?border-sky-500/);
    assert.match(source, /mode === "halo"[\s\S]*?border-violet-500/);
    assert.match(source, /mode === "wall_wash"[\s\S]*?border-amber-500/);
    assert.match(source, /const scope = globalMode \? "All " : ""/);
    assert.match(source, /targetId === "full_sign"[\s\S]*?label: "Full"/);
    assert.match(source, /absolute bottom-0 left-0 top-0 z-40[\s\S]*?onDrag\(event, "start"\)/);
    assert.match(source, /absolute bottom-0 right-0 top-0 z-40[\s\S]*?onDrag\(event, "end"\)/);
  });

  it("keeps the complete Front calibration visible for a selected clip", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const frontEditor = source.slice(source.indexOf('function LightingMountsEditor'), source.indexOf('function DiffuserSlider'));

    assert.match(frontEditor, /label="Intensity"/);
    assert.match(frontEditor, /label="Distance to diffusor"/);
    assert.match(frontEditor, /label="Softness"/);
    assert.match(frontEditor, /treatment\.material === "silicone"[\s\S]*?label="Transmission"[\s\S]*?label="Beam"/);
  });

  it("lays out lighting setup string assignments as a responsive matrix", async () => {
    const source = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const editor = source.slice(source.indexOf('function LightingMountsEditor'), source.indexOf('function DiffuserSlider'));

    assert.match(editor, /const ledStrings = designer\.routes\.filter\(\(route\) => route\.kind === "led_string"\)/);
    assert.match(editor, /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
    assert.match(editor, /checked=\{treatment\.stringIds\.includes\(route\.id\)\}/);
    assert.match(editor, /<span className="min-w-0 truncate" title=\{route\.name\}>\{route\.name\}<\/span>/);
  });

  it("preserves the selected clip when its source belongs to the selected zone", () => {
    const clips = [
      { id: "clip_front", target: "source_logo_front" },
      { id: "clip_halo", target: "source_logo_halo" }
    ] as ClipForm[];
    const targets = ["source_logo_front", "source_logo_halo", "zone_logo"];

    assert.equal(clipIdForSelectedTargets(clips, "clip_halo", targets), "clip_halo");
    assert.equal(clipIdForSelectedTargets(clips, undefined, targets), "clip_front");
    assert.equal(clipIdForSelectedTargets(clips, "clip_halo", ["zone_without_clips"]), undefined);
  });

  it("does not let stale canvas selection clear an explicitly clicked clip", () => {
    const clips = [
      { id: "clip_full_sign", target: "full_sign" },
      { id: "clip_zone", target: "source_logo_halo" }
    ] as ClipForm[];

    assert.equal(explicitClipTargetSelectionSettled(clips, "clip_full_sign", ["source_logo_halo", "zone_logo"]), false);
    assert.equal(explicitClipTargetSelectionSettled(clips, "clip_full_sign", []), true);
    assert.equal(explicitClipTargetSelectionSettled(clips, "clip_zone", ["source_logo_halo", "zone_logo"]), true);
  });
});

describe("work lines", () => {
  it("groups every existing and newly created Work Line in its own Artwork folder", async () => {
    const panelSource = await readFile("components/lighting/designer/designer-ui.tsx", "utf8");
    const canvasSource = await readFile("components/lighting/designer/designer-paper-canvas.tsx", "utf8");
    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");
    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const imagesFolder = panelSource.slice(panelSource.indexOf('label="Images"'), panelSource.indexOf("</RouteFolder>", panelSource.indexOf('label="Images"')));
    const referenceFolder = panelSource.slice(panelSource.indexOf('label="Reference"'), panelSource.indexOf("</RouteFolder>", panelSource.indexOf('label="Reference"')));
    const workLinesFolder = panelSource.slice(panelSource.indexOf('label="Work Lines"'), panelSource.indexOf("</RouteFolder>", panelSource.indexOf('label="Work Lines"')));

    assert.doesNotMatch(referenceFolder, /designer\.workLines/);
    assert.match(workLinesFolder, /count=\{designer\.workLines\.length\}/);
    assert.match(workLinesFolder, /<WorkLineRows designer=\{designer\}/);
    assert.match(workLinesFolder, /visible=\{designer\.workLinesVisible\}/);
    assert.match(imagesFolder, /visible=\{imagesVisible\}[\s\S]*?onSetArtworkFolderVisibility\("images"/);
    assert.match(referenceFolder, /visible=\{referenceVisible\}[\s\S]*?onSetArtworkFolderVisibility\("reference"/);
    assert.match(workLinesFolder, /onSetArtworkFolderVisibility\("workLines"/);
    assert.equal((panelSource.match(/<WorkLineRows designer=\{designer\}/g) ?? []).length, 1);
    assert.match(panelSource, /No Work Lines yet\./);
    assert.match(panelSource, /onSetArtworkVisibility\(patch\.visible\)/);
    assert.match(workspaceSource, /function setArtworkVisibility\(visible: boolean\)[\s\S]*?artwork: \{ \.\.\.designer\.layers\.artwork, visible \},[\s\S]*?reference: \{ \.\.\.designer\.layers\.reference, visible \}/);
    assert.match(workspaceSource, /function setArtworkFolderVisibility\(folder: "images" \| "reference" \| "workLines", visible: boolean\)/);
    assert.match(panelSource, /workLines: true/);
    assert.match(canvasSource, /name: `Work line \$\{next\}`,[\s\S]*?layer: "artwork"/);
    const workLineRenderer = rendererSource.slice(rendererSource.indexOf("function drawPaperWorkLine"), rendererSource.indexOf("function drawPaperBuildArea"));
    assert.doesNotMatch(workLineRenderer, /dashArray/);
    assert.match(rendererSource, /dashArray: draft\.target === "work_line" \? undefined : \[8, 5\]/);
    assert.match(workspaceSource, /activeLayer === "artwork" \|\| activeLayer === "reference" \|\| activeLayer === "zones" \|\| activeLayer === "faceGraphic" \? \([\s\S]*?Work line · continuous construction reference/);
    assert.equal(designerLayerForSelection({ type: "work_line", id: "work_line_1" }), "artwork");
  });

  it("persists open construction geometry without invalidating electrical compilation", () => {
    const document = createNewPartituraDocument("work_lines");
    const before = designerCompileSignature(normalizeDefaultSignLayout(document).designer);
    const normalized = normalizeDefaultSignLayout({
      ...document,
      designer: {
        ...document.designer,
        workLinesVisible: false,
        workLines: [{ id: "work_line_1", name: "Baseline", layer: "faceGraphic", points: [{ x: 2, y: 3 }, { x: 9, y: 3 }] }]
      }
    });

    assert.equal(normalized.designer.workLinesVisible, false);
    assert.deepEqual(normalized.designer.workLines, [{ id: "work_line_1", name: "Baseline", layer: "artwork", points: [{ x: 2, y: 3 }, { x: 9, y: 3 }] }]);
    assert.equal(designerCompileSignature(normalized.designer), before);
  });

  it("finds and deduplicates crossings for direct Face Graphic holes", async () => {
    const intersections = workLineIntersectionPoints([
      { id: "horizontal", name: "Horizontal", points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] },
      { id: "vertical", name: "Vertical", points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] },
      { id: "joined", name: "Joined", points: [{ x: 5, y: 5 }, { x: 9, y: 9 }] },
      { id: "parallel", name: "Parallel", points: [{ x: 0, y: 7 }, { x: 10, y: 7 }] }
    ]);
    assert.deepEqual(intersections, [{ x: 5, y: 5 }, { x: 5, y: 7 }, { x: 7, y: 7 }]);

    const existingHole = {
      id: "work_line_hole_1",
      name: "Hole 1",
      shape: "ellipse" as const,
      x: 4.8,
      y: 4.8,
      width: 0.4,
      height: 0.4,
      passMode: "clear" as const,
      filterColor: "#FFFFFF",
      visible: true,
      locked: false,
      opacity: 1
    };
    assert.deepEqual(missingWorkLineHolePoints(intersections, [existingHole]), [{ x: 5, y: 7 }, { x: 7, y: 7 }]);
    assert.deepEqual(missingWorkLineHolePoints(intersections, [{ ...existingHole, x: 4.80005 }]), [{ x: 5, y: 7 }, { x: 7, y: 7 }]);

    const normalized = normalizeDefaultSignLayout({
      ...createNewPartituraDocument("work_line_holes"),
      designer: { ...createNewPartituraDocument("work_line_holes").designer, holeDiameterMm: 4.2 }
    });
    assert.equal(normalized.designer.holeDiameterMm, 4.2);

    const workspaceSource = await readFile("components/lighting/partitura-workspace.tsx", "utf8");
    const rendererSource = await readFile("components/lighting/designer/designer-paper-renderer.ts", "utf8");
    assert.match(workspaceSource, /label="Hole diameter" value=\{designer\.holeDiameterMm\}/);
    assert.match(workspaceSource, /onClick=\{generateWorkLineHoles\}[\s\S]{0,160}Generate Holes/);
    assert.match(workspaceSource, /passMode: "clear"/);
    assert.match(workspaceSource, /missingWorkLineHolePoints\(intersections, designer\.faceGraphics\)/);
    assert.match(workspaceSource, /faceGraphics: \[\.\.\.designer\.faceGraphics, \.\.\.holes\]/);
    assert.match(rendererSource, /element\.passMode === "clear" && !element\.id\.startsWith\("work_line_hole_"\) \? \[5, 4\] : undefined/);
  });

  it("moves every point by one snapped delta and keeps individual nodes editable", () => {
    const line = { id: "work_line_1", name: "Angle", points: [{ x: 0.13, y: 0.17 }, { x: 2.63, y: 1.67 }, { x: 4.13, y: 1.67 }] };
    const moved = movedWorkLine(line, 1.11, 0.91, 0.5);
    assert.deepEqual(moved.points.map((point) => ({ x: point.x - moved.points[0].x, y: point.y - moved.points[0].y })), [
      { x: 0, y: 0 },
      { x: 2.5, y: 1.5 },
      { x: 4, y: 1.5 }
    ]);
    assert.deepEqual(updateWorkLinePoint(moved, 1, { x: 8.2, y: 7.8 }, 0.5).points[1], { x: 8, y: 8 });
  });

  it("keeps productive geometry ahead of work lines in canvas hit priority", () => {
    const designer = createNewPartituraDocument("work_line_hits").designer;
    designer.workLines = [{ id: "work_line_1", name: "Reference", points: [{ x: 10, y: 15 }, { x: 20, y: 15 }] }];
    designer.zones = [{ id: "zone_1", name: "Zone", shape: "rect", x: 10, y: 10, width: 20, height: 20, visible: true, locked: false, opacity: 1 }];
    const viewport = { x: 0, y: 0, width: 100, height: 50 };
    const canvas = { width: 1000, height: 500 };

    assert.deepEqual(pickDesignerHit(designer, "zones", { x: 15, y: 15 }, viewport, canvas), { type: "zone", id: "zone_1" });
    assert.deepEqual(pickDesignerHit(designer, "artwork", { x: 15, y: 15 }, viewport, canvas), { type: "work_line", id: "work_line_1" });
    designer.workLinesVisible = false;
    assert.equal(pickDesignerHit(designer, "artwork", { x: 15, y: 15 }, viewport, canvas), null);
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

describe("dense polygon node interaction", () => {
  it("selects the nearest node instead of the last node inside the hit radius", () => {
    const points = [{ x: 0, y: 0 }, { x: 0.12, y: 0 }, { x: 5, y: 5 }];

    assert.deepEqual(
      pickPolygonPointHit("face", points, { x: 0.02, y: 0 }, 0.15, "face_graphic_point"),
      { type: "face_graphic_point", id: "face", pointIndex: 0 }
    );
  });

  it("keeps hit tolerance screen-sized at high zoom", () => {
    assert.equal(
      worldHitTolerance({ x: 0, y: 0, width: 10, height: 5 }, { width: 1000, height: 500 }),
      0.09
    );
  });

  it("inserts only near an edge and never on top of an existing node", () => {
    const square = {
      shape: "polygon" as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      pathMode: "straight" as const
    };

    assert.equal(shapeInsertIndexAtPoint(square, { x: 0.02, y: 0.02 }, 0.1), null);
    assert.equal(shapeInsertIndexAtPoint(square, { x: 5, y: 0.05 }, 0.1), 1);
    assert.equal(shapeInsertIndexAtPoint(square, { x: 5, y: 5 }, 0.1), null);
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
