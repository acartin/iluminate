import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canonicalJson, threeDJobFromRow, validateSweepSvg } from "@/lib/server/three-d-models";
import { defaultThreeDModelDocument, modelPathsSvg, profilePath, validateThreeDModelDocument, type ThreeDModelDocument } from "@/lib/three-d-modeler/contracts";
import { assignObjectToLayer, nextLayerFolder, objectLayerState } from "@/lib/three-d-modeler/layers";
import { validateProfilesBeforeSave } from "@/lib/three-d-modeler/profile-save-validation";
import { diagnoseRoundSweepRisk, diagnoseSweepRisk } from "@/lib/three-d-modeler/sweep-diagnostics";
import { analyzeFitClearance, fitClearancePreviewPoints } from "@/lib/three-d-modeler/fit-clearance";
import { profileParameterBaseValue, resolveProfileParameters } from "@/lib/three-d-modeler/profile-parameters";
import { changeProfileNodeType, findNearestStraightSegment, findProfileAngularSnap, insertNodeOnNearestSegment, prepareClosedProfileNodes, profileSegmentSnapAngle, removeProfileNode, resizeStraightSegment, updateProfileNodeHandle } from "@/lib/three-d-modeler/vector-editing";

describe("3D Modeler bounded contracts", () => {
  it("accepts a metric path-only SVG and rejects external behavior", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="route-1" d="M 0 0 L 10 0"/></svg>';
    assert.deepEqual(validateSweepSvg(svg, ["route-1"]), ["route-1"]);
    assert.throws(() => validateSweepSvg(svg.replace("</svg>", '<script src="https://example.com/x.js"/></svg>'), ["route-1"]), /unsupported/);
  });

  it("keeps recipe hashing order deterministic", () => {
    assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("validates the independent profile and serializes its closed path", () => {
    const document = validateThreeDModelDocument(defaultThreeDModelDocument);
    assert.match(profilePath(document.profile.contours[0]), /^M .* Z$/);
    const invalid = structuredClone(document);
    invalid.profile.contours[0].nodes = invalid.profile.contours[0].nodes.slice(0, 2);
    assert.throws(() => validateThreeDModelDocument(invalid), /3 to 128/);
  });

  it("inserts nodes on straight and Bezier segments without changing the curve split point", () => {
    const line = insertNodeOnNearestSegment([
      { xMm: 0, yMm: 0, nodeType: "corner" },
      { xMm: 10, yMm: 0, nodeType: "corner" }
    ], false, { xMm: 5, yMm: 0.05 }, 0.1);
    assert.equal(line?.index, 1);
    assert.deepEqual(line?.nodes[1], { xMm: 5, yMm: 0, nodeType: "corner" });

    const curve = insertNodeOnNearestSegment([
      { xMm: 0, yMm: 0, nodeType: "smooth", handleOut: { xMm: 0, yMm: 10 } },
      { xMm: 10, yMm: 0, nodeType: "smooth", handleIn: { xMm: 0, yMm: 10 } }
    ], false, { xMm: 5, yMm: 7.5 }, 0.1);
    assert.equal(curve?.index, 1);
    assert.ok(Math.abs((curve?.nodes[1].xMm ?? 0) - 5) < 0.001);
    assert.ok(Math.abs((curve?.nodes[1].yMm ?? 0) - 7.5) < 0.001);
    assert.ok(curve?.nodes[1].handleIn);
    assert.ok(curve?.nodes[1].handleOut);

    const persisted = structuredClone(defaultThreeDModelDocument);
    persisted.profile.contours[0].nodes = curve!.nodes.concat([
      { xMm: 10, yMm: -5, nodeType: "corner" },
      { xMm: 0, yMm: -5, nodeType: "corner" }
    ]);
    const roundTrip = validateThreeDModelDocument(JSON.parse(JSON.stringify(persisted)));
    assert.equal(roundTrip.profile.contours[0].nodes.length, 5);
    assert.deepEqual(roundTrip.profile.contours[0].nodes[1], curve?.nodes[1]);
  });

  it("selects a straight Profile segment and assigns its metric length", () => {
    const nodes = [
      { xMm: 0, yMm: 0, nodeType: "corner" as const },
      { xMm: 3, yMm: 4, nodeType: "straight" as const },
      { xMm: 10, yMm: 4, nodeType: "smooth" as const, handleIn: { xMm: -2, yMm: 0 } }
    ];
    assert.deepEqual(findNearestStraightSegment(nodes, false, { xMm: 1.5, yMm: 2.05 }, 0.1), { segmentIndex: 0, lengthMm: 5 });
    assert.equal(findNearestStraightSegment(nodes, false, { xMm: 7, yMm: 4 }, 0.1), null);

    const resized = resizeStraightSegment(nodes, false, 0, 10);
    assert.deepEqual(resized?.[0], nodes[0]);
    assert.deepEqual(resized?.[1], { xMm: 6, yMm: 8, nodeType: "straight" });
    const resizedFromEnd = resizeStraightSegment(nodes, false, 0, 10, "end");
    assert.deepEqual(resizedFromEnd?.[0], { xMm: -3, yMm: -4, nodeType: "corner" });
    assert.deepEqual(resizedFromEnd?.[1], nodes[1]);
    assert.deepEqual(nodes[1], { xMm: 3, yMm: 4, nodeType: "straight" });
    assert.equal(resizeStraightSegment(nodes, false, 1, 12), null);
    assert.equal(resizeStraightSegment(nodes, false, 0, 0), null);
  });

  it("allows deep zoom for precise Profile editing", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /const PROFILE_MAX_ZOOM = 32/);
    assert.match(studio, /Math\.min\(\s*PROFILE_MAX_ZOOM,\s*value/);
  });

  it("gives every straight Profile segment a direct hit target and toggles its fixed node", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /pointerEvents="stroke"/);
    assert.match(studio, /objectPointerDown\(\s*event,\s*contour\.id,\s*index,?\s*\)/);
    assert.match(studio, /title="Switch fixed node"/);
    assert.match(studio, /Fixed: Point \{activeSegment\.fixedNodeIndex \+ 1\} ↔/);
    assert.match(studio, /onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}[\s\S]{0,80}onClick=\{\(event\) => event\.currentTarget\.select\(\)\}/);
  });

  it("snaps Profile nodes to common fabrication angles and keeps unsnapped movement free", () => {
    const anchor = { xMm: 0, yMm: 0, nodeIndex: 2 };
    const vertical = findProfileAngularSnap({ xMm: .2, yMm: 10 }, [anchor]);
    assert.equal(vertical?.snapped, true);
    assert.equal(vertical?.angleDeg, 90);
    assert.ok(Math.abs(vertical?.point.xMm ?? 1) < 1e-9);
    assert.equal(vertical?.anchor.nodeIndex, 2);

    const diagonal = findProfileAngularSnap({ xMm: 10, yMm: 9.5 }, [anchor]);
    assert.equal(diagonal?.angleDeg, 45);
    assert.equal(diagonal?.snapped, true);
    assert.ok(Math.abs((diagonal?.point.xMm ?? 0) - (diagonal?.point.yMm ?? 1)) < 1e-9);

    const free = findProfileAngularSnap({ xMm: 10, yMm: Math.tan(20 * Math.PI / 180) * 10 }, [anchor]);
    assert.equal(free?.snapped, false);
    assert.deepEqual(free?.point, { xMm: 10, yMm: Math.tan(20 * Math.PI / 180) * 10 });
    assert.equal(profileSegmentSnapAngle({ xMm: 0, yMm: 0 }, { xMm: 10, yMm: Math.tan(30 * Math.PI / 180) * 10 }), 30);
    assert.equal(profileSegmentSnapAngle({ xMm: 0, yMm: 0 }, { xMm: 10, yMm: 4 }), null);
  });

  it("renders the angular-snap toggle, live X/Z guides, and persistent snapped segment color", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /Toggle angular snap for 0, 30, 45, 60, and 90 degrees/);
    assert.match(studio, /X \/ Z · \{angularGuide\.angleDeg\}°/);
    assert.match(studio, /profileSegmentSnapAngle\(node, end\)/);
    assert.match(studio, /segment-snap-/);
  });

  it("resolves independent Profile height and wall-width parameters without changing fixed dimensions", () => {
    const contour = {
      id: "channel-wall",
      name: "Channel wall",
      visible: true,
      locked: false,
      connectionNodeIndex: 0,
      nodes: [
        { xMm: 0, yMm: 0, nodeType: "corner" as const },
        { xMm: 0, yMm: 100, nodeType: "corner" as const },
        { xMm: 20, yMm: 100, nodeType: "corner" as const },
        { xMm: 20, yMm: 90, nodeType: "corner" as const },
        { xMm: 5, yMm: 90, nodeType: "corner" as const },
        { xMm: 5, yMm: 0, nodeType: "corner" as const }
      ],
      parameters: [
        { id: "height", name: "Height", axis: "y" as const, defaultMm: 100, minMm: 40, maxMm: 200, fixedNodeIndices: [0, 5], controlNodeIndices: [1, 2], followerNodeIndices: [3, 4] },
        { id: "wall-width", name: "Wall width", axis: "x" as const, defaultMm: 5, minMm: 2, maxMm: 12, fixedNodeIndices: [0, 1], controlNodeIndices: [5], followerNodeIndices: [4] }
      ]
    };
    assert.equal(profileParameterBaseValue(contour, contour.parameters[0]), 100);
    assert.equal(profileParameterBaseValue(contour, contour.parameters[1]), 5);
    const resolved = resolveProfileParameters(contour, { height: 120, "wall-width": 8 });
    assert.deepEqual(resolved.nodes.map(({ xMm, yMm }) => [xMm, yMm]), [[0, 0], [0, 120], [20, 120], [20, 110], [8, 110], [8, 0]]);
    assert.equal(Math.hypot(resolved.nodes[3].xMm - resolved.nodes[2].xMm, resolved.nodes[3].yMm - resolved.nodes[2].yMm), 10);
    assert.equal(resolved.nodes[2].xMm - resolved.nodes[1].xMm, 20);

    const document = structuredClone(defaultThreeDModelDocument);
    document.profile.contours = [contour];
    document.layers.rootObjectIds = [contour.id];
    document.sweeps = [];
    assert.deepEqual(validateThreeDModelDocument(document).profile.contours[0].parameters, contour.parameters);
  });

  it("infers negative parameter movement from Fixed and Control positions", () => {
    const contour = {
      id: "downward-wall",
      name: "Downward wall",
      visible: true,
      locked: false,
      connectionNodeIndex: 0,
      nodes: [
        { xMm: 0, yMm: 10, nodeType: "corner" as const },
        { xMm: 0, yMm: 0, nodeType: "corner" as const },
        { xMm: 5, yMm: 0, nodeType: "corner" as const },
        { xMm: 5, yMm: 10, nodeType: "corner" as const }
      ],
      parameters: [
        { id: "depth", name: "Depth", axis: "y" as const, defaultMm: 10, minMm: 1, maxMm: 30, fixedNodeIndices: [0, 3], controlNodeIndices: [1], followerNodeIndices: [2] }
      ]
    };

    const resolved = resolveProfileParameters(contour, { depth: 15 });
    assert.deepEqual(resolved.nodes.map(({ xMm, yMm }) => [xMm, yMm]), [[0, 10], [0, -5], [5, -5], [5, 10]]);
  });

  it("persists Profile parameter authoring in Profile and parameter values in Sweep", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const server = readFileSync("lib/server/three-d-models.ts", "utf8");
    assert.match(studio, /Profile parameters/);
    assert.match(studio, /aria-label="Select Fixed nodes"/);
    assert.match(studio, /aria-label="Select Control nodes"/);
    assert.match(studio, /aria-label="Select Follower nodes"/);
    assert.doesNotMatch(studio, /Base distance/);
    assert.doesNotMatch(studio, /Choose a group, then click nodes/);
    assert.match(studio, /profileParameterValues: assemblyProfileParameterValues/);
    assert.match(studio, /Sweep parameter \$\{parameter\.name\}/);
    assert.match(server, /resolveProfileParameters\(profile, sweep\.profileParameterValues\)/);
  });

  it("keeps the Profile selected while configuring parameters and focuses an incomplete group before save", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /if \(mode === "path"\) setSelectedPathId\(null\);\s*setSelectedNode\(null\)/);
    assert.doesNotMatch(studio, /else setSelectedObjectId\(null\)/);
    assert.match(studio, /const incompleteParameter =/);
    assert.match(studio, /setParameterGroupMode\(missingGroup\)/);
    assert.match(studio, /Click the \$\{missingGroup\} nodes in the canvas, then save again/);
  });

  it("deletes a selected Profile node and keeps its connection point valid", () => {
    const nodes = structuredClone(defaultThreeDModelDocument.profile.contours[0].nodes);
    const removed = removeProfileNode(nodes, 1, 3);
    assert.deepEqual(removed, {
      nodes: [nodes[0], nodes[2], nodes[3]],
      connectionNodeIndex: 2
    });
    assert.equal(removeProfileNode(nodes, 1, 1)?.connectionNodeIndex, 0);
    assert.equal(removeProfileNode(nodes.slice(0, 3), 1, 0), null);
    assert.equal(removeProfileNode(nodes, 8, 0), null);
    assert.equal(nodes.length, 4);

    const saved = structuredClone(defaultThreeDModelDocument);
    saved.profile.contours[0].nodes = removed!.nodes;
    saved.profile.contours[0].connectionNodeIndex = removed!.connectionNodeIndex;
    assert.deepEqual(validateThreeDModelDocument(JSON.parse(JSON.stringify(saved))).profile.contours[0], saved.profile.contours[0]);
  });

  it("matches Designer node creation, conversion, and Bezier handle rules", () => {
    const mixed = prepareClosedProfileNodes([
      { xMm: 0, yMm: 0, nodeType: "corner" },
      { xMm: 10, yMm: 0, nodeType: "smooth" },
      { xMm: 10, yMm: 10, nodeType: "symmetric" },
      { xMm: 0, yMm: 10, nodeType: "straight" }
    ]);
    assert.equal(mixed[0].handleIn, undefined);
    assert.equal(mixed[3].handleIn, undefined);
    assert.deepEqual(mixed[1].handleIn, { xMm: -2.2, yMm: -2.2 });
    assert.deepEqual(mixed[1].handleOut, { xMm: 2.2, yMm: 2.2 });

    const curved = changeProfileNodeType(mixed, 0, "smooth");
    assert.ok(curved[0].handleIn && curved[0].handleOut);
    const straightened = changeProfileNodeType(curved, 0, "corner");
    assert.equal(straightened[0].handleIn, undefined);
    assert.equal(straightened[0].handleOut, undefined);
    const explicitStraight = changeProfileNodeType(curved, 0, "straight");
    assert.equal(explicitStraight[0].nodeType, "straight");
    assert.equal(explicitStraight[0].handleIn, undefined);
    assert.equal(explicitStraight[0].handleOut, undefined);
    const persistedStraight = structuredClone(defaultThreeDModelDocument);
    persistedStraight.profile.contours[0].nodes[0] = explicitStraight[0];
    assert.equal(validateThreeDModelDocument(persistedStraight).profile.contours[0].nodes[0].nodeType, "straight");

    const smooth = updateProfileNodeHandle(curved, 0, "handleOut", { xMm: 3, yMm: 4 });
    assert.equal(Math.hypot(smooth[0].handleIn!.xMm, smooth[0].handleIn!.yMm), Math.hypot(curved[0].handleIn!.xMm, curved[0].handleIn!.yMm));
    assert.ok(smooth[0].handleIn!.xMm < 0 && smooth[0].handleIn!.yMm < 0);
    const symmetric = updateProfileNodeHandle(changeProfileNodeType(mixed, 0, "symmetric"), 0, "handleOut", { xMm: 3, yMm: 4 });
    assert.equal(Math.hypot(symmetric[0].handleIn!.xMm, symmetric[0].handleIn!.yMm), 5);
  });

  it("identifies and explains likely Round-transition conflict areas", () => {
    const path = {
      id: "dense-corner",
      name: "Dense corner",
      closed: true,
      visible: true,
      locked: false,
      connectionNodeIndex: 0,
      source: { type: "fabrication-plan" as const, sourceName: "fixture" },
      nodes: [
        { xMm: 0, yMm: 0, nodeType: "corner" as const },
        { xMm: 1, yMm: 0, nodeType: "corner" as const },
        { xMm: 1, yMm: 20, nodeType: "corner" as const },
        { xMm: 0, yMm: 20, nodeType: "corner" as const }
      ]
    };
    const profile = structuredClone(defaultThreeDModelDocument.profile.contours[0]);
    profile.nodes[1].xMm = 5;
    profile.nodes[2].xMm = 5;
    const diagnostic = diagnoseRoundSweepRisk(path, profile);
    assert.ok(diagnostic);
    assert.equal(diagnostic.shortestSegmentMm, 1);
    assert.equal(diagnostic.lateralReachMm, 7);
    assert.ok(diagnostic.candidates.some((candidate) => candidate.adjacentSegmentMm === 1));
    assert.match(diagnostic.candidates[0].reason, /shorter than the profile/);
    assert.ok(diagnostic.suggestions.some((suggestion) => suggestion.includes("Miter")));
    const miterDiagnostic = diagnoseSweepRisk(path, profile, "miter");
    assert.equal(miterDiagnostic?.title, "Likely profile-overlap conflict");
    assert.ok(miterDiagnostic?.suggestions.some((suggestion) => suggestion.includes("Flip")));
  });

  it("migrates the configurable snap and Printer area for existing v2 documents", () => {
    const persisted = structuredClone(defaultThreeDModelDocument) as Omit<ThreeDModelDocument, "setup"> & { setup: Omit<ThreeDModelDocument["setup"], "snapMm" | "printerArea"> & { snapMm?: number; printerArea?: ThreeDModelDocument["setup"]["printerArea"] } };
    delete persisted.setup.snapMm;
    delete persisted.setup.printerArea;
    const migrated = validateThreeDModelDocument(persisted);
    assert.equal(migrated.setup.snapMm, 0.5);
    assert.deepEqual(migrated.setup.printerArea, { unit: "mm", widthMm: 220, heightMm: 220 });

    const invalid = structuredClone(defaultThreeDModelDocument);
    invalid.setup.printerArea.widthMm = 0;
    assert.throws(() => validateThreeDModelDocument(invalid), /setup is invalid/);
  });

  it("allows an intentionally blank profile canvas", () => {
    const document = structuredClone(defaultThreeDModelDocument);
    document.profile.contours = [];
    document.layers.rootObjectIds = [];
    assert.deepEqual(validateThreeDModelDocument(document).profile.contours, []);
  });

  it("warns before saving a self-intersecting Profile and repairs its even-odd face", () => {
    const document = structuredClone(defaultThreeDModelDocument);
    document.profile.contours[0].nodes = [
      { xMm: 0, yMm: 0, nodeType: "corner" },
      { xMm: 0.053, yMm: 34.902, nodeType: "corner" },
      { xMm: 15.064, yMm: 34.936, nodeType: "corner" },
      { xMm: 15.064, yMm: 29.936, nodeType: "corner" },
      { xMm: 5.064, yMm: 29.936, nodeType: "corner" },
      { xMm: 5.064, yMm: -0.064, nodeType: "corner" },
      { xMm: -0.129, yMm: 0.129, nodeType: "corner" }
    ];
    const result = validateProfilesBeforeSave(document);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].code, "self-intersection");
    assert.equal(result.canAutoCorrect, true);
    assert.equal(result.repairedDocument.profile.contours[0].nodes.length, 6);
    assert.deepEqual(validateProfilesBeforeSave(result.repairedDocument).issues, []);
    assert.equal(document.profile.contours[0].nodes.length, 7);
  });

  it("keeps every profile in one free Layers location and inherits folder masks", () => {
    const document = structuredClone(defaultThreeDModelDocument);
    const folder = nextLayerFolder(document);
    document.layers.folders.push(folder);
    assignObjectToLayer(document, "outer", { type: "folder", id: folder.id });
    assert.deepEqual(document.layers.rootObjectIds, []);
    assert.deepEqual(document.layers.folders[0].objectIds, ["outer"]);
    document.layers.folders[0].locked = true;
    document.layers.folders[0].visible = false;
    assert.deepEqual(objectLayerState(document, "outer"), { visible: false, locked: true });
    assert.doesNotThrow(() => validateThreeDModelDocument(document));
  });

  it("migrates persisted v1 documents created before the free Layers tree", () => {
    const legacy = structuredClone(defaultThreeDModelDocument) as unknown as Record<string, unknown>;
    legacy.version = "3d-model-document.v1";
    delete legacy.modelPaths;
    delete legacy.sweeps;
    delete legacy.layers;
    const migrated = validateThreeDModelDocument(legacy);
    assert.equal(migrated.version, "3d-model-document.v2");
    assert.deepEqual(migrated.modelPaths, []);
    assert.deepEqual(migrated.sweeps, []);
    assert.deepEqual(migrated.layers.rootObjectIds, ["outer"]);
  });

  it("migrates legacy vertical roll into horizontal profile yaw", () => {
    const document = structuredClone(defaultThreeDModelDocument);
    document.modelPaths.push({ id: "closed-path", name: "Closed Path", closed: true, visible: true, locked: false, connectionNodeIndex: 0, source: { type: "asset-svg", sourceName: "shape.svg" }, nodes: [{ xMm: 0, yMm: 0, nodeType: "corner" }, { xMm: 20, yMm: 0, nodeType: "corner" }, { xMm: 20, yMm: 20, nodeType: "corner" }] });
    const legacy = document as unknown as { sweeps: Array<Record<string, unknown>> };
    legacy.sweeps.push({ id: "sweep-legacy", name: "Legacy", pathId: "closed-path", profileId: "outer", direction: "forward", pathConnection: "start", profileConnection: { xMm: 0, yMm: 0, rollDeg: 30 }, visible: true, locked: false });
    const migrated = validateThreeDModelDocument(legacy);
    assert.equal(migrated.sweeps[0].profileConnection.yawDeg, 30);
    assert.equal(migrated.sweeps[0].fitClearanceMm, 0);
    assert.equal(migrated.sweeps[0].fitClearanceDirection, "outward");
    assert.equal("rollDeg" in migrated.sweeps[0].profileConnection, false);
  });

  it("persists the common Model Path and its profile Sweep relation", () => {
    const document = structuredClone(defaultThreeDModelDocument);
    document.modelPaths.push({ id: "letter-i", name: "Letter I", closed: false, visible: true, locked: false, connectionNodeIndex: 0, source: { type: "asset-svg", assetId: "42", sourceName: "letter.svg" }, nodes: [{ xMm: 0, yMm: 0, nodeType: "corner" }, { xMm: 40, yMm: 0, nodeType: "corner" }] });
    document.sweeps.push({ id: "sweep-1", name: "Letter I + Outer", pathId: "letter-i", profileId: "outer", direction: "forward", pathConnection: "start", profileConnection: { xMm: 0, yMm: 0, yawDeg: 0 }, fitClearanceMm: 0.25, fitClearanceDirection: "inward", visible: true, locked: false });
    const valid = validateThreeDModelDocument(document);
    const svg = modelPathsSvg(valid.modelPaths);
    assert.match(svg, /viewBox="0 0 40 0\.001"/);
    assert.match(svg, /<path id="letter-i"/);
    assert.equal(valid.sweeps[0].profileId, "outer");
    assert.equal(valid.sweeps[0].fitClearanceMm, 0.25);
    assert.equal(valid.sweeps[0].fitClearanceDirection, "inward");
    assert.equal(valid.profile.contours[0].connectionNodeIndex, 0);
    const invalid = structuredClone(valid);
    invalid.modelPaths[0].nodes.splice(1, 0, { xMm: 20, yMm: 0, nodeType: "corner" });
    invalid.modelPaths[0].connectionNodeIndex = 1;
    assert.throws(() => validateThreeDModelDocument(invalid), /must be an endpoint/);
  });

  it("uses the operator-selected Fit clearance direction for arbitrary contours", () => {
    const source = { type: "asset-svg" as const, sourceName: "letter-a.svg" };
    const outer = { id: "outer-path", name: "Outer", closed: true, visible: true, locked: false, connectionNodeIndex: 0, source, nodes: [{ xMm: 0, yMm: 0, nodeType: "corner" as const }, { xMm: 40, yMm: 0, nodeType: "corner" as const }, { xMm: 40, yMm: 40, nodeType: "corner" as const }, { xMm: 0, yMm: 40, nodeType: "corner" as const }] };
    const hole = { id: "hole-path", name: "Hole", closed: true, visible: true, locked: false, connectionNodeIndex: 0, source, nodes: [{ xMm: 10, yMm: 10, nodeType: "corner" as const }, { xMm: 30, yMm: 10, nodeType: "corner" as const }, { xMm: 30, yMm: 30, nodeType: "corner" as const }, { xMm: 10, yMm: 30, nodeType: "corner" as const }] };
    assert.equal(analyzeFitClearance(outer, 0.25, "inward").direction, "inward");
    const interior = analyzeFitClearance(hole, 0.25, "inward");
    assert.equal(interior.direction, "inward");
    assert.match(interior.summary, /contract/);
    assert.equal(analyzeFitClearance({ ...hole, closed: false }, 0.25, "outward").valid, false);
    const outward = fitClearancePreviewPoints(outer, 0.25, "outward");
    assert.deepEqual(outward?.effective[0], { xMm: -0.25, yMm: -0.25 });
    const inward = fitClearancePreviewPoints(hole, 0.25, "inward");
    assert.deepEqual(inward?.effective[0], { xMm: 10.25, yMm: 10.25 });
    assert.equal(fitClearancePreviewPoints({ ...outer, closed: false }, 0.25, "outward"), null);
  });

  it("keeps compound Fabrication Plan contours independent from clearance direction", () => {
    const source = { type: "fabrication-plan" as const, sourceName: "partitura:47/fabrication_path_9" };
    const outer = { id: "letter-a", name: "A", closed: true, visible: true, locked: false, connectionNodeIndex: 0, source, nodes: [{ xMm: 0, yMm: 0, nodeType: "corner" as const }, { xMm: 40, yMm: 0, nodeType: "corner" as const }, { xMm: 40, yMm: 50, nodeType: "corner" as const }, { xMm: 0, yMm: 50, nodeType: "corner" as const }] };
    const counter = { id: "letter-a-2", name: "A · 2", closed: true, visible: true, locked: false, connectionNodeIndex: 0, source: { ...source, sourceName: `${source.sourceName}/2` }, nodes: [{ xMm: 12, yMm: 15, nodeType: "corner" as const }, { xMm: 28, yMm: 15, nodeType: "corner" as const }, { xMm: 28, yMm: 32, nodeType: "corner" as const }, { xMm: 12, yMm: 32, nodeType: "corner" as const }] };
    assert.notEqual(outer.id, counter.id);
    assert.equal(analyzeFitClearance(outer, 0.25, "inward").direction, "inward");
    assert.equal(analyzeFitClearance(counter, 0.25, "outward").direction, "outward");
  });

  it("keeps Height and Fit clearance controls together outside Setup and persists them in the Sweep", () => {
    const viewport = readFileSync("components/three-d-modeler/three-d-workspace-viewport.tsx", "utf8");
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const contextualBarStart = studio.indexOf('<div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-2 text-body-sm">');
    const contextualBar = studio.slice(contextualBarStart, studio.indexOf('{mode === "profile" ? (', contextualBarStart));
    const setup = studio.slice(studio.indexOf('aria-expanded={setupOpen}'), studio.indexOf('{mode === "profile" ? (', studio.indexOf('aria-expanded={setupOpen}')));
    assert.match(contextualBar, /parameter\.name[\s\S]{0,1800}Compare clearance[\s\S]{0,1800}aria-label="Fit clearance direction"[\s\S]{0,1800}aria-label="Fit clearance"/);
    assert.doesNotMatch(setup, /label="Fit clearance"|aria-label="Fit clearance"/);
    assert.match(contextualBar, /option value="outward">OUT<[\s\S]{0,120}option value="inward">IN</);
    assert.doesNotMatch(viewport, /Offset preview ·|Original Path/);
    assert.match(studio, /sweep\.fitClearanceMm = assemblyFitClearanceMm/);
    assert.match(studio, /sweep\.fitClearanceDirection = assemblyFitClearanceDirection/);
  });

  it("gives the compact 3D bar Designer-style rhythm and direct numeric replacement", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const layers = readFileSync("components/three-d-modeler/three-d-layers-panel.tsx", "utf8");
    assert.match(studio, /aria-label=\{`Sweep parameter \$\{parameter\.name\}`\}[\s\S]{0,220}onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}[\s\S]{0,120}onClick=\{\(event\) => event\.currentTarget\.select\(\)\}/);
    assert.match(studio, /aria-label="Fit clearance"[\s\S]{0,180}onFocus=\{\(event\) => event\.currentTarget\.select\(\)\}[\s\S]{0,120}onClick=\{\(event\) => event\.currentTarget\.select\(\)\}/);
    assert.ok((studio.match(/h-8 w-20 rounded-md border border-input bg-background/g) ?? []).length >= 2);
    assert.doesNotMatch(studio, /aria-label="Layers"|>\s*Layers\s*<\/Button>/);
    assert.match(layers, /label="all Layers"/);
    assert.match(studio, /variant="outline"[\s\S]{0,120}aria-label="Undo"[\s\S]{0,500}variant="outline"[\s\S]{0,120}aria-label="Redo"[\s\S]{0,1400}<Save/);
    assert.match(studio, /variant="destructive"[\s\S]{0,180}aria-label="Delete selection"/);
  });

  it("keeps Sweep policy fields inside the bounded Setup panel", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /w-72 max-w-\[calc\(100vw-1rem\)\][^\n]*overflow-hidden/);
    assert.match(studio, /Corner transition[\s\S]{0,500}w-full min-w-0 max-w-full/);
    assert.match(studio, /Body policy[\s\S]{0,500}w-full min-w-0 max-w-full/);
  });

  it("keeps Path visibility independent while hiding clearance helpers from generated Solid Objects", () => {
    const viewport = readFileSync("components/three-d-modeler/three-d-workspace-viewport.tsx", "utf8");
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const resultSync = viewport.slice(viewport.indexOf("const syncResults = async"), viewport.indexOf("syncResultsRef.current = syncResults"));
    const pathVisibilitySync = viewport.slice(viewport.indexOf('let group = model.getObjectByName("other-preview-paths")'), viewport.indexOf("useEffect(() => { replacePreviewRef"));
    assert.match(studio, /visibleResults\.length === 0 && clearanceComparisonVisible/);
    assert.match(studio, /visibleResults\.length > 0 \|\|\s*assemblyFitClearanceMm <= 0/);
    assert.match(viewport, /object\.name = "assembly-root"/);
    assert.match(viewport, /group\.name = "assembly-preview"/);
    assert.match(viewport, /object\.add\(preview\)/);
    assert.match(viewport, /object\.add\(solidSet\)/);
    assert.match(viewport, /comparison\.visible = previewStateRef\.current\.pathVisible && !desired\.size && clearanceComparisonVisibleRef\.current/);
    assert.match(viewport, /applyPreviewVisibility\(object, previewState\.pathVisible, previewState\.profileVisible\)/);
    assert.doesNotMatch(resultSync, /previousPreview|previewGroup|assembly-preview/);
    assert.match(viewport, /comparison\.visible = pathVisible && !hasResults && clearanceComparisonVisible/);
    assert.match(studio, /paths=\{document\.modelPaths\}/);
    assert.match(viewport, /paths\.filter\(\(path\) => path\.id !== selectedPathId\)/);
    assert.match(viewport, /otherPathsPreviewGroup\(paths, path\?\.id \?\? null\)/);
    assert.match(viewport, /child\.visible = path\.visible/);
    assert.match(viewport, /child\?\.userData\.geometryKey !== geometryKey/);
    assert.doesNotMatch(pathVisibilitySync, /parent\?\.remove|disposeThreeObject/);
  });

  it("keeps the 3D toolbar free of unsolicited status and metadata labels", () => {
    const viewport = readFileSync("components/three-d-modeler/three-d-workspace-viewport.tsx", "utf8");
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.doesNotMatch(viewport, /<Badge>\{format\}|Drag to orbit above or below|Printer area \{printerArea\.widthMm|dimensions\.x\.toFixed/);
    assert.doesNotMatch(studio, /Current Sweep ·|Fit clearance · \{displayedFitClearanceMm/);
    assert.match(studio, /busy \|\| assemblyProcessing\s*\?\s*\([\s\S]{0,80}<LoaderCircle className="h-4 w-4 animate-spin"/);
  });

  it("exposes immutable Fit clearance metadata for current and legacy Solid Objects", () => {
    const base = { id: "42", display_name: "Receiver", status: "succeeded", error_code: null, error_summary: null, manifest_json: null, created_at: "2026-11-04T00:00:00.000Z", completed_at: null };
    const current = threeDJobFromRow({ ...base, recipe_json: { sweepId: "sweep-1", sourceOriginMm: { xMm: 12, yMm: 34, zMm: 0 }, fitClearanceMm: 0.25, fitClearanceDirection: "inward" } });
    assert.equal(current.fitClearanceMm, 0.25);
    assert.equal(current.fitClearanceDirection, "inward");
    assert.deepEqual(current.sourceOriginMm, { xMm: 12, yMm: 34, zMm: 0 });
    const legacy = threeDJobFromRow({ ...base, recipe_json: { sweepId: "sweep-1" } });
    assert.equal(legacy.fitClearanceMm, 0);
    assert.equal(legacy.fitClearanceDirection, "outward");
  });

  it("keeps the 3D workspace outside Designer and Animate", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const designer = readFileSync("components/lighting/partitura-workspace.tsx", "utf8");
    assert.doesNotMatch(studio, /components\/lighting|designer\.geometries|partitura/);
    assert.doesNotMatch(designer, /3d-modeler|three-d-modeler|3d-worker/);
  });

  it("captures drag history before clearing the pointer reference", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /const completedDrag = dragRef\.current;\s+dragRef\.current = null;/);
    assert.doesNotMatch(studio, /dragRef\.current!\.before/);
  });

  it("keeps the Model Path canvas interactive after materializing a Fabrication Plan", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(studio, /ref=\{canvasRef\}[^>]*onPointerDown=\{canvasPointerDown\}[^>]*onPointerMove=\{pointerMove\}/);
    assert.match(studio, /pathPointerDown\(event, path\.id\)/);
    assert.match(studio, /pathNodePointerDown\(event, path\.id, index\)/);
  });

  it("matches Designer vector selection, insertion, pan, and configurable snap gestures", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const nodeTypePicker = readFileSync("components/ui/node-type-picker.tsx", "utf8");
    assert.match(studio, /onDoubleClick=\{canvasDoubleClick\}/);
    assert.match(studio, /insertNodeOnNearestSegment/);
    assert.match(studio, /tool === "select" && !alreadySelected/);
    assert.match(studio, /event\.button === 2[\s\S]{0,100}startPanDrag\(event\)/);
    assert.match(studio, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/);
    assert.match(studio, /<SetupNumber[\s\S]{0,180}label="Snap"[\s\S]{0,180}suffix=\{printerArea\.unit\}/);
    assert.match(studio, /document\.setup\.snapMm/);
    assert.match(studio, />\s*Printer area\s*<\/div>/);
    assert.match(studio, /document\.setup\.printerArea/);
    assert.match(studio, /width=\{printerUnitMm\}[\s\S]{0,80}height=\{printerUnitMm\}/);
    assert.match(studio, /horizontalRulerMarks/);
    assert.match(studio, /verticalRulerMarks/);
    assert.match(studio, /const profileNodeRadius = screenMmPerPixel \* 4\.5/);
    assert.match(studio, /r=\{\s*selectedNode === index\s*\? profileSelectedNodeRadius\s*: profileNodeRadius,?\s*\}/);
    assert.match(studio, /r=\{profileHandleRadius\}/);
    assert.match(studio, /const profileMeasurementFont = screenMmPerPixel \* 13/);
    assert.match(studio, /paintOrder="stroke"/);
    assert.doesNotMatch(studio, /selectedNode === index \? 1 : \.72/);
    assert.match(studio, /Fit printer area/);
    assert.match(studio, /useState<Feedback \| null>/);
    assert.match(studio, /<FeedbackAlert feedback=\{feedback\}/);
    assert.doesNotMatch(studio, /<FeedbackAlert feedback=\{\{ type:/);
    assert.match(studio, /aria-label="Close Setup"/);
    assert.match(studio, /setupRef\.current\?\.contains/);
    assert.match(studio, /setSetupOpen\(false\)/);
    assert.match(studio, /plane === "profile" \? 0\.65 : 1\.5/);
    assert.doesNotMatch(studio, /message: "Node inserted\."/);
    assert.match(studio, /modifier && key === "z"/);
    assert.match(studio, /modifier && key === "y"/);
    assert.match(studio, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
    assert.match(studio, /deleteSelectedProfileNode\(\)/);
    assert.match(studio, /<Badge>Point \{selectedNode! \+ 1\}<\/Badge>/);
    assert.match(studio, /import \{ NodeTypePicker \} from "@\/components\/ui\/node-type-picker"/);
    assert.match(studio, /<NodeTypePicker\s*value=\{activeNode\.nodeType\}/);
    assert.match(studio, /<NodeTypePicker\s*value=\{nodeCreationType\}/);
    assert.match(studio, /X \{roundCoordinate\(activeNode\.xMm \/ printerUnitMm\)\}[\s\S]{0,40}\{printerArea\.unit\} · Z/);
    assert.match(nodeTypePicker, /"corner" \| "straight" \| "smooth" \| "symmetric"/);
    assert.match(studio, /key === "v"/);
    assert.match(studio, /key === "m"/);
    assert.match(studio, /key === "h"/);
    assert.match(studio, /key === "r"/);
    assert.match(studio, /key === "e"/);
    assert.match(studio, /key === "p"/);
    assert.match(studio, /key === "b"/);
    assert.match(studio, /closeToleranceMm/);
    assert.match(studio, /Fixed axis/);
    assert.match(studio, /modifier && key === "c"/);
    assert.match(studio, /modifier && key === "v"/);
    assert.match(studio, /aria-label="Copy selected object"[\s\S]*aria-label="Paste copied object"[\s\S]*aria-label="Delete selection"/);
    assert.match(studio, /assignObjectToLayer\(next, id,[\s\S]*selectedObject\.id\)/);
    assert.match(studio, /diagnoseSweepRisk/);
    assert.match(studio, /model_envelope_invalid/);
    assert.match(studio, /fit_clearance_invalid/);
    assert.match(studio, /Show #1 in 3D/);
    assert.match(studio, /showSweepRiskIn3D\(candidate\.nodeIndex\)/);
    assert.match(studio, /diagnosticJob = assemblyJob\?\.id === activeJobId \? assemblyJob : null/);
    assert.match(studio, /nextJobs\.find\(\(job\) => job\.status === "succeeded"\)\?\.id \?\? null/);
    assert.match(studio, /title="Sweep errors"/);
    assert.match(studio, />\s*Errors\s*<Badge>\{sweepDiagnostic\.candidates\.length\}<\/Badge>/);
    assert.match(studio, /riskCandidates=\{[\s\S]{0,120}showSweepRiskMarkers \? \(sweepDiagnostic\?\.candidates \?\? \[\]\) : \[\][\s\S]{0,20}\}/);
    assert.match(studio, /Use Miter/);
    assert.match(studio, /candidate\.reason/);
    assert.match(studio, /sweepDiagnostic\.candidates\.map/);
    assert.doesNotMatch(studio, /shrink-0 border-b border-amber-500\/50 bg-amber-500\/10/);
    const viewport = readFileSync("components/three-d-modeler/three-d-workspace-viewport.tsx", "utf8");
    assert.match(viewport, /sweep-risk-markers/);
    assert.match(viewport, /sweep-risk-node-/);
    assert.match(viewport, /sceneRef\.current\?\.getObjectByName\(`sweep-risk-node-/);
    assert.match(viewport, /controls\.target\.copy\(target\)/);
    assert.match(studio, /label="Measure distance on XY plane"\s*icon=\{Ruler\}/);
    assert.match(studio, /measureActive=\{tool === "measure"\}/);
    assert.match(viewport, /intersectPlane\(new THREE\.Plane\(new THREE\.Vector3\(0, 0, 1\), 0\)/);
    assert.doesNotMatch(viewport, /snaps to Path nodes|Drag to orbit above or below/);
    assert.match(viewport, /measurementReadout\.distance\.toFixed\(2\)/);
    assert.doesNotMatch(studio, /Remove profile node|tool === "scissors"/);
    assert.match(studio, /const hasPendingJobs = jobs\.some\([\s\S]*"queued", "leased", "processing"/);
    assert.match(studio, /mode !== "preview" \|\| !hasPendingJobs/);
    assert.match(studio, /refreshJobs\(\)/);
    assert.match(studio, /visibilitychange/);
  });

  it("uses direct Path/Profile assembly selection and exposes every successful result independently", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const layers = readFileSync("components/three-d-modeler/three-d-layers-panel.tsx", "utf8");
    const repository = readFileSync("lib/server/three-d-models.ts", "utf8");
    const deleteRoute = readFileSync("app/api/3d-modeler/projects/[id]/jobs/[jobId]/route.ts", "utf8");
    assert.doesNotMatch(studio, /Create Sweep command|activeField/);
    assert.match(studio, /:\s*"Sweep"\}\s*<\/Button>/);
    assert.match(studio, /materializeAssembly/);
    assert.match(studio, /3D assembly saved/);
    assert.doesNotMatch(studio, /jobs\.slice\(/);
    assert.match(studio, /solidObjects/);
    assert.doesNotMatch(studio, /seen\.has\(job\.sweepId\)/);
    assert.match(studio, /Result #\$\{job\.id\}/);
    assert.match(studio, /Solid Object is ready/);
    assert.match(studio, /setAssemblyYaw/);
    assert.doesNotMatch(layers, /Delete selected Solid Object|Delete selected Path/);
    assert.match(studio, /title="Delete selection"\s*aria-label="Delete selection"[\s\S]{0,160}disabled=\{!canDeleteLayerSelection \|\| busy\}/);
    assert.match(studio, /setPendingLayerDelete\(layerSelection\)/);
    assert.match(studio, /selectedResultId=\{selectedSolidObjectId\}/);
    assert.match(studio, /visibleSolidObjectIds\.has\(job\.id\)/);
    assert.match(studio, /if \(next\.has\(id\)\)\s*next\.delete\(id\);\s*else next\.add\(id\)/);
    assert.match(layers, /Paths/);
    assert.match(layers, /allPathsVisible[\s\S]*onSetAllPathVisibility\(!allPathsVisible\)/);
    assert.match(layers, /allSolidObjectsVisible[\s\S]*onSetAllSolidObjectVisibility\(!allSolidObjectsVisible\)/);
    assert.match(studio, /next\.modelPaths\.forEach\(\(path\) => \{\s*path\.visible = visible/);
    assert.match(studio, /visible \? new Set\(solidObjects\.map\(\(solid\) => solid\.id\)\) : new Set\(\)/);
    assert.doesNotMatch(layers, />Root\s*</);
    assert.match(layers, /Solid Objects/);
    assert.match(layers, /InlineName/);
    assert.match(layers, /onRenameSolidObject/);
    assert.doesNotMatch(layers, /window\.prompt/);
    assert.doesNotMatch(layers, />Sweeps/);
    assert.match(layers, /onClick=\{\(\) => \{ onSelect\(\); onBeginEdit\(\); \}\}/);
    assert.match(layers, /aria-label=\{`Rename \$\{value\}`\}[\s\S]*onBlur=\{commit\}/);
    assert.match(layers, /event\.key === "Enter"[\s\S]*event\.currentTarget\.blur\(\)[\s\S]*event\.key === "Escape"[\s\S]*onEditingChange\(false\)/);
    assert.doesNotMatch(layers, /window\.prompt\("Object name"/);
    assert.match(repository, /pg_advisory_xact_lock/);
    assert.match(repository, /recipe_json ->> 'sweepId'/);
    assert.match(repository, /reused: true/);
    assert.match(repository, /const id = \(await database\.query/);
    assert.doesNotMatch(repository, /update iluminate\.three_d_model_jobs set[\s\S]*status = 'queued'/);
    assert.match(studio, /title="Confirm delete"/);
    assert.match(studio, /bg-\[var\(--red-bg\)\]/);
    assert.match(deleteRoute, /deleteThreeDSolidObject/);
    assert.match(deleteRoute, /renameThreeDSolidObject/);
    assert.match(repository, /display_name/);
    assert.match(repository, /delete from iluminate\.three_d_model_jobs where id = \$1/);
  });

  it("loads the current successful Sweep in the integrated 3D workspace and keeps the authenticated standalone viewer", () => {
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    const workspaceViewport = readFileSync("components/three-d-modeler/three-d-workspace-viewport.tsx", "utf8");
    const viewer = readFileSync("components/three-d-modeler/three-d-model-viewer.tsx", "utf8");
    const viewerPage = readFileSync("app/3d-modeler/[id]/viewer/[jobId]/page.tsx", "utf8");
    const viewRoute = readFileSync("app/api/3d-modeler/projects/[id]/jobs/[jobId]/view/[artifact]/route.ts", "utf8");
    const artifactStore = readFileSync("lib/server/r2-three-d-models.ts", "utf8");
    assert.match(studio, /ThreeDWorkspaceViewport/);
    assert.match(studio, /results=\{visibleResults\}/);
    assert.match(studio, /label="Move printer area temporarily"/);
    assert.match(studio, /icon=\{Grid3X3\}/);
    assert.match(studio, /printerAreaMoveActive=\{tool === "move-printer-area"\}/);
    assert.doesNotMatch(studio, /Adjust the parameters, then Save/);
    assert.match(workspaceViewport, /Promise\.all\(results\.map/);
    assert.match(workspaceViewport, /syncResultsRef\.current\?\.\(results\)/);
    assert.match(workspaceViewport, /resultObjectsRef\.current\.get\(id\)/);
    assert.doesNotMatch(workspaceViewport, /grid\.position\.set\(center\.x, center\.y, 0\)/);
    assert.match(workspaceViewport, /axes\.position\.set\(0, 0, 0\)/);
    assert.match(workspaceViewport, /printerAreaOffsetRef\.current\.set\(0, 0, 0\)/);
    assert.match(workspaceViewport, /gridRef\.current\.position\.set\(0, 0, 0\)/);
    assert.match(workspaceViewport, /printerAreaDrag = \{ start: point, origin: grid\.position\.clone\(\) \}/);
    assert.match(workspaceViewport, /printerAreaOffsetRef\.current\.copy\(grid\.position\)/);
    assert.doesNotMatch(workspaceViewport, /projectId, resultGeometryKey, setView/);
    assert.match(workspaceViewport, /solidObjectId/);
    assert.match(workspaceViewport, /OrbitControls/);
    assert.match(workspaceViewport, /ThreeMFLoader/);
    assert.match(workspaceViewport, /controls\.addEventListener\("change", invalidate\)/);
    assert.match(workspaceViewport, /controls\.addEventListener\("change", persistView\)/);
    assert.match(workspaceViewport, /const savedView = viewStateRef\.current/);
    assert.match(workspaceViewport, /camera\.position\.fromArray\(savedView\.position\)/);
    assert.match(workspaceViewport, /controls\.target\.fromArray\(savedView\.target\)/);
    assert.match(studio, /viewStateRef=\{threeDViewStateRef\}/);
    assert.match(workspaceViewport, /if \(frame === null\) frame = window\.requestAnimationFrame\(render\)/);
    assert.doesNotMatch(workspaceViewport, /renderer\.render\(scene, camera\); frame = window\.requestAnimationFrame\(render\)/);
    assert.match(workspaceViewport, /controls\.maxPolarAngle = Math\.PI/);
    assert.match(studio, /checked=\{threeDGridVisible\}[\s\S]{0,300}Show printer area/);
    assert.match(workspaceViewport, /targetRef\.current\.copy\(center\)/);
    assert.doesNotMatch(workspaceViewport, /Drag horizontally to rotate Profile|rotationEnabled|onYawChange/);
    assert.match(workspaceViewport, /pathPreviewGroup\(path, "preview-path"\)/);
    assert.match(workspaceViewport, /profileGroup\.name = "preview-profile"/);
    assert.doesNotMatch(workspaceViewport, /positionPreview/);
    assert.match(workspaceViewport, /replacePreviewRef\.current\?\.\(yawDeg\)/);
    assert.match(workspaceViewport, /previewGroup\(path, profile, nextYawDeg, previewState\.fitClearanceMm/);
    assert.match(studio, /ThreeDToolButton[\s\S]{0,220}label="Rotate Profile"[\s\S]{0,220}onClick=\{activateProfileRotation\}/);
    assert.match(studio, /profile=\{resolvedAssemblyProfile\}[\s\S]{0,220}profileVisible=\{selectedState\.visible\}/);
    assert.match(studio, /tool === "rotate-profile"/);
    assert.match(studio, /const assemblyDirty = Boolean\(\s*mode === "preview"[\s\S]{0,500}assemblySweep\.profileConnection\.yawDeg !== assemblyYawDeg/);
    assert.match(studio, /const dirty =\s*confirmed !== JSON\.stringify\(document\) \|\| assemblyDirty/);
    assert.match(studio, /dirty\s*\? "border-amber-500 bg-amber-500 text-slate-950/);
    assert.match(studio, /dirty\s*\? "Save pending changes"\s*: "All changes are saved"/);
    assert.match(studio, /validateProfilesBeforeSave\(assembly\.document\)/);
    assert.match(studio, /title="Profile geometry warning"/);
    assert.match(studio, />\s*Save anyway\s*<\/Button>/);
    assert.match(studio, />\s*Correct automatically\s*<\/Button>/);
    assert.doesNotMatch(studio, /<Button[^>]*onClick=\{activateProfileRotation\}/);
    assert.doesNotMatch(studio, />3D assembly</);
    assert.doesNotMatch(studio, /rotationEnabled=/);
    assert.match(studio, /title="Confirm delete"/);
    assert.match(studio, /sweep\.profileConnection\.yawDeg = assemblyYawDeg/);
    assert.match(workspaceViewport, /targetRef\.current\.copy\(center\)/);
    assert.doesNotMatch(workspaceViewport, /object\.position\.sub\(new THREE\.Vector3\(center\.x, center\.y, 0\)\)/);
    assert.match(workspaceViewport, /printerAreaGrid\(printerArea\.widthMm, printerArea\.heightMm, gridStepMm\)/);
    assert.match(workspaceViewport, /Math\.hypot\(printerArea\.widthMm, printerArea\.heightMm\) \/ 2/);
    assert.doesNotMatch(workspaceViewport, /new THREE\.GridHelper\(1000, 100/);
    assert.match(studio, /printerArea=\{printerArea\}\s*gridStepMm=\{printerUnitMm\}/);
    assert.match(workspaceViewport, /setFromAxisAngle\(new THREE\.Vector3\(0, 0, 1\)/);
    assert.match(studio, /Flip Profile Side/);
    assert.match(viewer, /OrbitControls/);
    assert.match(viewer, /ThreeMFLoader/);
    assert.match(viewer, /STLLoader/);
    assert.match(viewer, /controls\.addEventListener\("change", invalidate\)/);
    assert.doesNotMatch(viewer, /renderer\.render\(scene, camera\); frame = window\.requestAnimationFrame\(render\)/);
    assert.match(viewer, /Isometric/);
    assert.doesNotMatch(workspaceViewport, /SurfaceMode|>Surface<|wireframe/);
    assert.doesNotMatch(viewer, /SurfaceMode|>Surface<|wireframe/);
    assert.match(viewer, /controls\.maxPolarAngle = Math\.PI/);
    assert.match(viewer, /checked=\{gridVisible\}[\s\S]*Show grid/);
    assert.doesNotMatch(workspaceViewport, /maxPolarAngle = Math\.PI \/ 2/);
    assert.doesNotMatch(viewer, /maxPolarAngle = Math\.PI \/ 2/);
    assert.match(viewerPage, /status = 'succeeded'/);
    assert.match(viewRoute, /readThreeDViewArtifact/);
    assert.match(viewRoute, /"content-length": String\(result\.contentLength\)/);
    assert.match(artifactStore, /transformToWebStream\(\)/);
    assert.doesNotMatch(artifactStore, /transformToByteArray\(\)/);
    assert.doesNotMatch(viewer, /components\/lighting|designer\.geometries|partitura/);
  });

  it("keeps the global Profile catalog separate from project assembly", () => {
    const menu = readFileSync("lib/api.ts", "utf8");
    const libraryPage = readFileSync("app/profiles/page.tsx", "utf8");
    const profileRoute = readFileSync("app/api/profiles/[id]/route.ts", "utf8");
    const repository = readFileSync("lib/server/three-d-profiles.ts", "utf8");
    const studio = readFileSync("components/three-d-modeler/three-d-modeler-studio.tsx", "utf8");
    assert.match(menu, /label: "Profiles"[\s\S]*href: "\/profiles"[\s\S]*required_permission: "three-d:profiles:manage"/);
    assert.match(libraryPage, /ProfileThumbnail/);
    assert.match(profileRoute, /menu\.user\.role === "system-admin"/);
    assert.match(repository, /document\.modelPaths = \[\][\s\S]*document\.sweeps = \[\]/);
    assert.match(repository, /where id = \$1 and revision = \$4/);
    assert.match(studio, /catalogProfile\s*\? `\/api\/profiles\/\$\{catalogProfile\.id\}`/);
    assert.match(studio, /catalogProfile \? "\/profiles" : "\/3d-modeler"/);
    assert.match(studio, /fetch\("\/api\/profiles", \{ cache: "no-store" \}\)/);
    assert.match(studio, /mergeGlobalProfiles\(payload\.document, profilesPayload\.profiles\)/);
    assert.match(studio, /mode === "profile" && source && globalProfile/);
    assert.match(studio, /"Global Profile saved\."/);
    assert.match(studio, /legacyStarterIds/);
  });
});
