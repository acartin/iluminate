"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoxSelect, Download, Maximize2, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { Button } from "@/components/ui/button";
import type { ModelPath, ProfileContour } from "@/lib/three-d-modeler/contracts";
import { fitClearancePreviewPoints, type FitClearanceDirection } from "@/lib/three-d-modeler/fit-clearance";
import type { SweepRiskCandidate } from "@/lib/three-d-modeler/sweep-diagnostics";

type ViewDirection = "iso" | "front" | "top" | "right";
type PrinterArea = { unit: "mm" | "cm" | "in"; widthMm: number; heightMm: number };
export type ThreeDViewportViewState = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  zoom: number;
};
export type ThreeDViewportResult = {
  id: string;
  translationMm: [number, number, number];
};

function printerAreaGrid(widthMm: number, heightMm: number, requestedStepMm: number) {
  const group = new THREE.Group();
  const maximumLinesPerAxis = 400;
  const stepMultiplier = Math.max(1, Math.ceil(Math.max(widthMm, heightMm) / requestedStepMm / maximumLinesPerAxis));
  const stepMm = requestedStepMm * stepMultiplier;
  const minor: number[] = [];
  const halfWidth = widthMm / 2;
  const halfHeight = heightMm / 2;
  for (let x = Math.ceil(-halfWidth / stepMm) * stepMm; x <= halfWidth + 1e-6; x += stepMm) minor.push(x, -halfHeight, 0, x, halfHeight, 0);
  for (let y = Math.ceil(-halfHeight / stepMm) * stepMm; y <= halfHeight + 1e-6; y += stepMm) minor.push(-halfWidth, y, 0, halfWidth, y, 0);
  const minorGeometry = new THREE.BufferGeometry();
  minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minor, 3));
  group.add(new THREE.LineSegments(minorGeometry, new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: .72 })));

  const boundary = [
    -halfWidth, -halfHeight, 0, halfWidth, -halfHeight, 0,
    halfWidth, -halfHeight, 0, halfWidth, halfHeight, 0,
    halfWidth, halfHeight, 0, -halfWidth, halfHeight, 0,
    -halfWidth, halfHeight, 0, -halfWidth, -halfHeight, 0,
    -halfWidth, 0, 0, halfWidth, 0, 0,
    0, -halfHeight, 0, 0, halfHeight, 0
  ];
  const boundaryGeometry = new THREE.BufferGeometry();
  boundaryGeometry.setAttribute("position", new THREE.Float32BufferAttribute(boundary, 3));
  group.add(new THREE.LineSegments(boundaryGeometry, new THREE.LineBasicMaterial({ color: 0x64748b })));
  return group;
}

function pathCurve(path: ModelPath) {
  const curve = new THREE.CurvePath<THREE.Vector3>();
  const edgeCount = path.closed ? path.nodes.length : path.nodes.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const node = path.nodes[index];
    const next = path.nodes[(index + 1) % path.nodes.length];
    const start = new THREE.Vector3(node.xMm, node.yMm, 0);
    const end = new THREE.Vector3(next.xMm, next.yMm, 0);
    if (node.handleOut || next.handleIn) {
      const out = node.handleOut ?? { xMm: 0, yMm: 0 };
      const incoming = next.handleIn ?? { xMm: 0, yMm: 0 };
      curve.add(new THREE.CubicBezierCurve3(start, new THREE.Vector3(node.xMm + out.xMm, node.yMm + out.yMm, 0), new THREE.Vector3(next.xMm + incoming.xMm, next.yMm + incoming.yMm, 0), end));
    } else curve.add(new THREE.LineCurve3(start, end));
  }
  return curve;
}

function riskLabel(number: number, sizeMm: number) {
  const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#dc2626"; context.beginPath(); context.arc(64, 64, 58, 0, Math.PI * 2); context.fill();
    context.lineWidth = 8; context.strokeStyle = "#fef3c7"; context.stroke();
    context.fillStyle = "#ffffff"; context.font = "700 64px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(String(number), 64, 68);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  sprite.scale.setScalar(sizeMm * 3.2); sprite.position.z = sizeMm * 2.6; sprite.renderOrder = 1001;
  return sprite;
}

function sweepRiskMarkers(path: ModelPath | null, riskCandidates: SweepRiskCandidate[]) {
  if (!path || !riskCandidates.length) return null;
  const riskGroup = new THREE.Group(); riskGroup.name = "sweep-risk-markers";
  const pathBox = new THREE.Box3().setFromPoints(path.nodes.map((node) => new THREE.Vector3(node.xMm, node.yMm, 0)));
  const markerSize = THREE.MathUtils.clamp(pathBox.getSize(new THREE.Vector3()).length() / 140, 1.5, 8);
  riskCandidates.forEach((candidate, index) => {
    const marker = new THREE.Group(); marker.name = `sweep-risk-node-${candidate.nodeIndex}`; marker.position.set(candidate.xMm, candidate.yMm, markerSize * .12); marker.userData.sweepRiskCandidate = candidate;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false, depthWrite: false, transparent: true, opacity: .95 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(markerSize * 1.65, markerSize * .2, 8, 40), ringMaterial); ring.renderOrder = 1000; marker.add(ring);
    const center = new THREE.Mesh(new THREE.SphereGeometry(markerSize * .52, 16, 10), new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false })); center.renderOrder = 1000; marker.add(center);
    marker.add(riskLabel(index + 1, markerSize)); riskGroup.add(marker);
  });
  return riskGroup;
}

function disposeThreeObject(object: THREE.Object3D) {
  object.traverse((item) => {
    if (item instanceof THREE.Mesh || item instanceof THREE.Line) item.geometry.dispose();
    if (!(item instanceof THREE.Mesh || item instanceof THREE.Line || item instanceof THREE.Sprite)) return;
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    materials.forEach((material) => { if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose(); });
  });
}

function measurementGroup(start: THREE.Vector3, end: THREE.Vector3, sceneRadius: number) {
  const group = new THREE.Group(); group.name = "xy-measurement";
  const lift = THREE.MathUtils.clamp(sceneRadius / 500, .15, 1.5);
  const a = new THREE.Vector3(start.x, start.y, lift); const b = new THREE.Vector3(end.x, end.y, lift);
  const material = new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), material); line.renderOrder = 1100; group.add(line);
  const pointRadius = THREE.MathUtils.clamp(sceneRadius / 180, .7, 3.5);
  for (const point of [a, b]) {
    const handle = new THREE.Mesh(new THREE.SphereGeometry(pointRadius, 16, 10), new THREE.MeshBasicMaterial({ color: 0xfbbf24, depthTest: false, depthWrite: false }));
    handle.position.copy(point); handle.renderOrder = 1101; group.add(handle);
  }
  const distance = a.distanceTo(b);
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(15,23,42,.94)"; context.roundRect(4, 12, 504, 104, 18); context.fill();
    context.lineWidth = 6; context.strokeStyle = "#f59e0b"; context.stroke();
    context.fillStyle = "#fef3c7"; context.font = "700 54px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(`${distance.toFixed(2)} mm`, 256, 66);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
  const labelHeight = pointRadius * 4.5; label.scale.set(labelHeight * 4, labelHeight, 1); label.position.copy(a).lerp(b, .5); label.position.z += labelHeight * .75; label.renderOrder = 1102; group.add(label);
  return group;
}

function clearanceComparisonGroup(path: ModelPath | null, clearanceMm: number, direction: FitClearanceDirection) {
  if (!path) return null;
  const comparison = fitClearancePreviewPoints(path, clearanceMm, direction);
  if (!comparison) return null;
  const group = new THREE.Group(); group.name = "fit-clearance-comparison";
  const line = (points: Array<{ xMm: number; yMm: number }>, material: THREE.LineBasicMaterial | THREE.LineDashedMaterial) => {
    const vertices = points.map((point) => new THREE.Vector3(point.xMm, point.yMm, .22));
    vertices.push(vertices[0].clone());
    const result = new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertices), material);
    if (material instanceof THREE.LineDashedMaterial) result.computeLineDistances();
    result.renderOrder = 900;
    return result;
  };
  group.add(line(comparison.original, new THREE.LineBasicMaterial({ color: 0x22d3ee, depthTest: false, depthWrite: false, transparent: true, opacity: .95 })));
  group.add(line(comparison.effective, new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: Math.max(clearanceMm * 5, 1.5), gapSize: Math.max(clearanceMm * 2.5, .75), depthTest: false, depthWrite: false })));
  return group;
}

function pathPreviewGroup(path: ModelPath, name: string) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.modelPathId = path.id;
  group.userData.geometryKey = JSON.stringify([path.nodes, path.closed]);
  const sampled = pathCurve(path).getPoints(Math.min(1000, Math.max(32, path.nodes.length * 24)));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sampled), new THREE.LineBasicMaterial({ color: 0x22d3ee })));
  sampled.forEach((point, index) => {
    if (index % Math.max(1, Math.floor(sampled.length / 40)) !== 0) return;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0891b2 }));
    marker.position.copy(point); group.add(marker);
  });
  return group;
}

function otherPathsPreviewGroup(paths: ModelPath[], selectedPathId: string | null) {
  const group = new THREE.Group();
  group.name = "other-preview-paths";
  syncOtherPathsPreviewGroup(group, paths, selectedPathId);
  return group;
}

function syncOtherPathsPreviewGroup(group: THREE.Group, paths: ModelPath[], selectedPathId: string | null) {
  const desired = new Map(paths.filter((path) => path.id !== selectedPathId).map((path) => [path.id, path]));
  for (const child of [...group.children]) {
    const id = typeof child.userData.modelPathId === "string" ? child.userData.modelPathId : "";
    if (desired.has(id)) continue;
    group.remove(child); disposeThreeObject(child);
  }
  for (const path of Array.from(desired.values())) {
    const geometryKey = JSON.stringify([path.nodes, path.closed]);
    let child = group.children.find((item) => item.userData.modelPathId === path.id);
    if (child?.userData.geometryKey !== geometryKey) {
      if (child) { group.remove(child); disposeThreeObject(child); }
      child = pathPreviewGroup(path, `preview-path-${path.id}`);
      group.add(child);
    }
    child.visible = path.visible;
  }
}

function previewGroup(path: ModelPath | null, profile: ProfileContour | null, yawDeg: number, fitClearanceMm: number, fitClearanceDirection: FitClearanceDirection) {
  const group = new THREE.Group();
  group.name = "assembly-preview";
  if (!path) return group;
  const pathGroup = pathPreviewGroup(path, "preview-path");
  group.add(pathGroup);
  const clearanceComparison = clearanceComparisonGroup(path, fitClearanceMm, fitClearanceDirection);
  if (clearanceComparison) group.add(clearanceComparison);
  if (!profile) return group;
  const profileGroup = new THREE.Group();
  profileGroup.name = "preview-profile";
  group.add(profileGroup);
  const connection = profile.nodes[profile.connectionNodeIndex] ?? profile.nodes[0];
  const start = path.nodes[path.connectionNodeIndex] ?? path.nodes[0];
  const adjacentIndex = path.closed ? (path.connectionNodeIndex + 1) % path.nodes.length : path.connectionNodeIndex === path.nodes.length - 1 ? Math.max(0, path.connectionNodeIndex - 1) : path.connectionNodeIndex + 1;
  const adjacent = path.nodes[adjacentIndex];
  const tangent = new THREE.Vector3(adjacent.xMm - start.xMm, adjacent.yMm - start.yMm, 0).normalize();
  if (!path.closed && path.connectionNodeIndex === path.nodes.length - 1) tangent.negate();
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(yawDeg));
  const horizontal = new THREE.Vector3(-tangent.y, tangent.x, 0).applyQuaternion(rotation);
  const vertical = new THREE.Vector3(0, 0, 1);
  const contact = new THREE.Vector3(start.xMm, start.yMm, 0);
  profileGroup.add(new THREE.ArrowHelper(horizontal.clone().normalize(), contact, 14, 0xef4444, 2.5, 1.4));
  profileGroup.add(new THREE.ArrowHelper(tangent.clone(), contact, 14, 0x22c55e, 2.5, 1.4));
  profileGroup.add(new THREE.ArrowHelper(vertical.clone(), contact, 14, 0x0ea5e9, 2.5, 1.4));
  const place = (xMm: number, zMm: number) => contact.clone().addScaledVector(horizontal, xMm - connection.xMm).addScaledVector(vertical, zMm - connection.yMm);
  const points = profile.nodes.map((node) => place(node.xMm, node.yMm));
  points.push(points[0].clone());
  profileGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xa855f7 })));
  const planeShape = new THREE.Shape(profile.nodes.map((node) => new THREE.Vector2(node.xMm - connection.xMm, node.yMm - connection.yMm)));
  const planeGeometry = new THREE.ShapeGeometry(planeShape);
  const positions = planeGeometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const placed = contact.clone().addScaledVector(horizontal, positions.getX(index)).addScaledVector(vertical, positions.getY(index));
    positions.setXYZ(index, placed.x, placed.y, placed.z);
  }
  positions.needsUpdate = true; planeGeometry.computeVertexNormals();
  profileGroup.add(new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: .18, side: THREE.DoubleSide })));
  return group;
}

export function ThreeDWorkspaceViewport({ projectId, results, selectedResultId, paths, path, profile, pathVisible, profileVisible, yawDeg, fitClearanceMm, fitClearanceDirection, gridVisible, clearanceComparisonVisible, printerArea, gridStepMm, printerAreaMoveActive, measureActive, measureResetRequest, snapEnabled, snapMm, riskCandidates, focusRiskNodeIndex, focusRiskRequest, onResultSelectionChange, viewStateRef }: { projectId: string; results: ThreeDViewportResult[]; selectedResultId: string | null; paths: ModelPath[]; path: ModelPath | null; profile: ProfileContour | null; pathVisible: boolean; profileVisible: boolean; yawDeg: number; fitClearanceMm: number; fitClearanceDirection: FitClearanceDirection; gridVisible: boolean; clearanceComparisonVisible: boolean; printerArea: PrinterArea; gridStepMm: number; printerAreaMoveActive: boolean; measureActive: boolean; measureResetRequest: number; snapEnabled: boolean; snapMm: number; riskCandidates: SweepRiskCandidate[]; focusRiskNodeIndex: number | null; focusRiskRequest: number; onResultSelectionChange: (id: string | null) => void; viewStateRef: { current: ThreeDViewportViewState | null } }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const riskMarkersRef = useRef<THREE.Group | null>(null);
  const printerAreaMoveActiveRef = useRef(printerAreaMoveActive);
  const printerAreaOffsetRef = useRef(new THREE.Vector3());
  const measureActiveRef = useRef(measureActive);
  const snapEnabledRef = useRef(snapEnabled);
  const snapMmRef = useRef(snapMm);
  const onResultSelectionChangeRef = useRef(onResultSelectionChange);
  const replacePreviewRef = useRef<((nextYawDeg: number) => void) | null>(null);
  const pathVisibleRef = useRef(pathVisible);
  const profileVisibleRef = useRef(profileVisible);
  const gridRef = useRef<THREE.Object3D | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const syncResultsRef = useRef<((nextResults: ThreeDViewportResult[]) => Promise<void>) | null>(null);
  const syncRiskMarkersRef = useRef<((nextCandidates: SweepRiskCandidate[]) => void) | null>(null);
  const resultObjectsRef = useRef(new Map<string, THREE.Object3D>());
  const solidSetRef = useRef<THREE.Group | null>(null);
  const hasResultsRef = useRef(results.length > 0);
  const previewStateRef = useRef({ yawDeg, fitClearanceMm, fitClearanceDirection, pathVisible, profileVisible, riskCandidates });
  const clearanceComparisonVisibleRef = useRef(true);
  const radiusRef = useRef(100);
  const targetRef = useRef(new THREE.Vector3());
  const [loading, setLoading] = useState(results.length > 0);
  const [error, setError] = useState("");
  const [measurementReadout, setMeasurementReadout] = useState<{ distance: number; dx: number; dy: number } | null>(null);
  const [modelRevision, setModelRevision] = useState(0);
  const pathGeometryKey = path ? JSON.stringify([path.id, path.nodes, path.closed, path.connectionNodeIndex]) : "";
  const otherPathsGeometryKey = JSON.stringify(paths.map((item) => [item.id, item.nodes, item.closed, item.visible]));
  const profileGeometryKey = profile ? JSON.stringify([profile.id, profile.nodes, profile.connectionNodeIndex]) : "";
  const riskGeometryKey = JSON.stringify(riskCandidates.map((candidate) => [candidate.nodeIndex, candidate.xMm, candidate.yMm]));
  const clearanceGeometryKey = `${fitClearanceMm}:${fitClearanceDirection}`;
  const resultGeometryKey = JSON.stringify(results);
  const hasResults = results.length > 0;
  useEffect(() => {
    previewStateRef.current = { yawDeg, fitClearanceMm, fitClearanceDirection, pathVisible, profileVisible, riskCandidates };
    pathVisibleRef.current = pathVisible;
    profileVisibleRef.current = profileVisible;
    measureActiveRef.current = measureActive;
    printerAreaMoveActiveRef.current = printerAreaMoveActive;
    snapEnabledRef.current = snapEnabled;
    snapMmRef.current = snapMm;
    hasResultsRef.current = hasResults;
    clearanceComparisonVisibleRef.current = clearanceComparisonVisible;
    onResultSelectionChangeRef.current = onResultSelectionChange;
  }, [clearanceComparisonVisible, fitClearanceDirection, fitClearanceMm, hasResults, measureActive, onResultSelectionChange, pathVisible, printerAreaMoveActive, profileVisible, riskCandidates, snapEnabled, snapMm, yawDeg]);

  const setView = useCallback((view: ViewDirection) => {
    const camera = cameraRef.current; const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = Math.max(radiusRef.current * 2.7, 30);
    const direction = view === "front" ? new THREE.Vector3(0, -1, .15) : view === "top" ? new THREE.Vector3(0, 0, 1) : view === "right" ? new THREE.Vector3(1, 0, .15) : new THREE.Vector3(1, -1, .8);
    const target = targetRef.current.clone();
    camera.position.copy(target).add(direction.normalize().multiplyScalar(distance)); camera.up.set(0, 0, 1); controls.target.copy(target); controls.update();
    viewStateRef.current = { position: [camera.position.x, camera.position.y, camera.position.z], target: [controls.target.x, controls.target.y, controls.target.z], up: [camera.up.x, camera.up.y, camera.up.z], zoom: camera.zoom };
  }, [viewStateRef]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let disposed = false; let frame: number | null = null;
    const scene = new THREE.Scene(); sceneRef.current = scene; scene.background = new THREE.Color(document.documentElement.classList.contains("dark") ? 0x101826 : 0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(42, 1, .01, 100000); camera.up.set(0, 0, 1); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.zoomToCursor = true; controls.maxPolarAngle = Math.PI; controlsRef.current = controls;
    const render = () => { frame = null; controls.update(); renderer.render(scene, camera); };
    const invalidate = () => { if (frame === null) frame = window.requestAnimationFrame(render); };
    invalidateRef.current = invalidate;
    const persistView = () => {
      viewStateRef.current = { position: [camera.position.x, camera.position.y, camera.position.z], target: [controls.target.x, controls.target.y, controls.target.z], up: [camera.up.x, camera.up.y, camera.up.z], zoom: camera.zoom };
    };
    controls.addEventListener("change", invalidate);
    controls.addEventListener("change", persistView);
    const grid = printerAreaGrid(printerArea.widthMm, printerArea.heightMm, gridStepMm); gridRef.current = grid; scene.add(grid);
    const axes = new THREE.AxesHelper(60); scene.add(axes); scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(120, -160, 220); scene.add(key);
    const fill = new THREE.DirectionalLight(0x93c5fd, 1.5); fill.position.set(-180, 80, 100); scene.add(fill);
    const resize = () => { const width = Math.max(host.clientWidth, 1); const height = Math.max(host.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); invalidate(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    let selectionStart: { x: number; y: number } | null = null;
    let printerAreaDrag: { start: THREE.Vector3; origin: THREE.Vector3 } | null = null;
    let measurementStart: THREE.Vector3 | null = null;
    const applyPreviewVisibility = (object: THREE.Object3D, nextPathVisible = pathVisibleRef.current, nextProfileVisible = profileVisibleRef.current) => {
      const previewPath = object.getObjectByName("preview-path");
      const previewProfile = object.getObjectByName("preview-profile");
      if (previewPath) previewPath.visible = nextPathVisible;
      if (previewProfile) previewProfile.visible = nextProfileVisible;
    };
    replacePreviewRef.current = (nextYawDeg: number) => {
      if (!path || !modelRef.current) return;
      const previous = modelRef.current.getObjectByName("assembly-preview");
      if (previous) { previous.parent?.remove(previous); disposeThreeObject(previous); }
      const previewState = previewStateRef.current;
      const object = previewGroup(path, profile, nextYawDeg, previewState.fitClearanceMm, previewState.fitClearanceDirection);
      applyPreviewVisibility(object, previewState.pathVisible, previewState.profileVisible);
      const comparison = object.getObjectByName("fit-clearance-comparison");
      if (comparison) comparison.visible = previewState.pathVisible && !hasResultsRef.current && clearanceComparisonVisibleRef.current;
      modelRef.current.add(object);
      invalidate();
    };
    const syncRiskMarkers = (nextCandidates: SweepRiskCandidate[]) => {
      if (riskMarkersRef.current) { scene.remove(riskMarkersRef.current); disposeThreeObject(riskMarkersRef.current); riskMarkersRef.current = null; }
      const markers = sweepRiskMarkers(path, nextCandidates);
      if (markers) { riskMarkersRef.current = markers; scene.add(markers); }
      invalidate();
    };
    syncRiskMarkersRef.current = syncRiskMarkers;
    syncRiskMarkers(previewStateRef.current.riskCandidates);
    const planePoint = (event: PointerEvent, allowSnap = true) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      if (!point) return null;
      const previewPath = modelRef.current?.getObjectByName("preview-path");
      if (allowSnap && previewPath && path) {
        previewPath.updateWorldMatrix(true, false);
        let nearest: { point: THREE.Vector3; pixels: number } | null = null;
        for (const node of path.nodes) {
          const world = previewPath.localToWorld(new THREE.Vector3(node.xMm, node.yMm, 0));
          const projected = world.clone().project(camera);
          const x = bounds.left + (projected.x + 1) * bounds.width / 2; const y = bounds.top + (1 - projected.y) * bounds.height / 2;
          const pixels = Math.hypot(event.clientX - x, event.clientY - y);
          if (!nearest || pixels < nearest.pixels) nearest = { point: world, pixels };
        }
        if (nearest && nearest.pixels <= 12) return nearest.point.setZ(0);
      }
      if (allowSnap && snapEnabledRef.current && snapMmRef.current > 0) {
        point.x = Math.round(point.x / snapMmRef.current) * snapMmRef.current;
        point.y = Math.round(point.y / snapMmRef.current) * snapMmRef.current;
      }
      return point.setZ(0);
    };
    const updateMeasurement = (start: THREE.Vector3, end: THREE.Vector3) => {
      if (measurementGroupRef.current) { scene.remove(measurementGroupRef.current); disposeThreeObject(measurementGroupRef.current); }
      const group = measurementGroup(start, end, radiusRef.current); measurementGroupRef.current = group; scene.add(group);
      setMeasurementReadout({ distance: start.distanceTo(end), dx: end.x - start.x, dy: end.y - start.y });
      invalidate();
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (printerAreaMoveActiveRef.current) {
        const point = planePoint(event, false); if (!point) return;
        event.preventDefault(); event.stopPropagation();
        printerAreaDrag = { start: point, origin: grid.position.clone() };
        renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }
      if (measureActiveRef.current) {
        const point = planePoint(event); if (!point) return;
        event.preventDefault(); event.stopPropagation(); measurementStart = point; updateMeasurement(point, point); renderer.domElement.setPointerCapture(event.pointerId); return;
      }
      selectionStart = { x: event.clientX, y: event.clientY };
    };
    const pointerMove = (event: PointerEvent) => {
      if (printerAreaDrag && printerAreaMoveActiveRef.current) {
        const point = planePoint(event, false);
        if (point) {
          grid.position.set(
            printerAreaDrag.origin.x + point.x - printerAreaDrag.start.x,
            printerAreaDrag.origin.y + point.y - printerAreaDrag.start.y,
            0,
          );
          printerAreaOffsetRef.current.copy(grid.position);
          invalidate();
        }
        return;
      }
      if (!measurementStart || !measureActiveRef.current) return;
      const point = planePoint(event); if (point) updateMeasurement(measurementStart, point);
    };
    const pointerUp = (event: PointerEvent) => {
      if (printerAreaDrag) {
        printerAreaDrag = null;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
        return;
      }
      if (measurementStart) {
        const point = planePoint(event); if (point) updateMeasurement(measurementStart, point);
        measurementStart = null; if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); return;
      }
      if (!selectionStart || !hasResultsRef.current || Math.hypot(event.clientX - selectionStart.x, event.clientY - selectionStart.y) > 4) { selectionStart = null; return; }
      selectionStart = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, camera);
      const hit = modelRef.current ? raycaster.intersectObject(modelRef.current, true)[0]?.object : null;
      let candidate: THREE.Object3D | null = hit;
      while (candidate && typeof candidate.userData.solidObjectId !== "string") candidate = candidate.parent;
      onResultSelectionChangeRef.current(candidate?.userData.solidObjectId ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("pointercancel", pointerUp);
    invalidate();

    const loadSolidResult = async (result: ThreeDViewportResult) => {
      const base = `/api/3d-modeler/projects/${projectId}/jobs/${result.id}/view`;
      const threeMfResponse = await fetch(`${base}/model.3mf`, { cache: "no-store" });
      let solid: THREE.Object3D;
      if (threeMfResponse.ok) solid = new ThreeMFLoader().parse(await threeMfResponse.arrayBuffer());
      else {
        const stlResponse = await fetch(`${base}/model.stl`, { cache: "no-store" });
        if (!stlResponse.ok) throw new Error(`Solid Object #${result.id} is unavailable.`);
        const geometry = new STLLoader().parse(await stlResponse.arrayBuffer()); geometry.computeVertexNormals();
        solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: .58 }));
      }
      const root = new THREE.Group();
      root.name = `solid-object-${result.id}`;
      root.userData.solidObjectId = result.id;
      root.position.fromArray(result.translationMm);
      root.add(solid);
      return root;
    };
    const updateSceneMetrics = (object: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.isEmpty() ? new THREE.Vector3(100, 100, 20) : box.getSize(new THREE.Vector3());
      const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      grid.position.copy(printerAreaOffsetRef.current);
      axes.position.set(0, 0, 0);
      const printerRadius = Math.hypot(printerArea.widthMm, printerArea.heightMm) / 2;
      const radius = Math.max(size.length() / 2, printerRadius, 10); radiusRef.current = radius; targetRef.current.copy(center); camera.near = Math.max(radius / 1000, .01); camera.far = Math.max(radius * 100, 1000); camera.updateProjectionMatrix(); axes.scale.setScalar(Math.max(radius / 100, .02));
    };
    let ready = false;
    let pendingResults: ThreeDViewportResult[] | null = null;
    let syncVersion = 0;
    const syncResults = async (nextResults: ThreeDViewportResult[]) => {
      if (!ready) { pendingResults = nextResults; return; }
      const version = ++syncVersion;
      const desired = new Map(nextResults.map((result) => [result.id, result]));
      const current = modelRef.current;
      const existingSet = solidSetRef.current;
      const existingIds = new Set(resultObjectsRef.current.keys());
      try {
        const additions = await Promise.all(nextResults.filter((result) => !existingIds.has(result.id)).map(loadSolidResult));
        if (disposed || version !== syncVersion) { additions.forEach(disposeThreeObject); return; }
        additions.forEach((solid) => resultObjectsRef.current.set(String(solid.userData.solidObjectId), solid));
        if (!current) return;
        const solidSet = existingSet ?? new THREE.Group(); solidSet.name = "solid-object-set"; solidSetRef.current = solidSet;
        if (solidSet.parent !== current) current.add(solidSet);
        for (const child of [...solidSet.children]) if (!desired.has(String(child.userData.solidObjectId))) solidSet.remove(child);
        for (const id of Array.from(desired.keys())) {
          const solid = resultObjectsRef.current.get(id);
          if (solid && solid.parent !== solidSet) solidSet.add(solid);
        }
        solidSet.traverse((child) => { if (child instanceof THREE.Mesh && !child.material) child.material = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: .58 }); });
        const comparison = current.getObjectByName("fit-clearance-comparison");
        if (comparison) comparison.visible = previewStateRef.current.pathVisible && !desired.size && clearanceComparisonVisibleRef.current;
        updateSceneMetrics(current);
        setError(""); setModelRevision((value) => value + 1); invalidate();
      } catch (value) { if (!disposed && version === syncVersion) setError(value instanceof Error ? value.message : "The 3D view could not be loaded."); }
    };
    syncResultsRef.current = syncResults;

    async function load() {
      setLoading(hasResults); setError("");
      try {
        const object = new THREE.Group(); object.name = "assembly-root";
        const preview = previewGroup(path, profile, yawDeg, fitClearanceMm, fitClearanceDirection); applyPreviewVisibility(preview, pathVisible, profileVisible); object.add(preview); object.add(otherPathsPreviewGroup(paths, path?.id ?? null));
        if (hasResults) {
          const solidSet = new THREE.Group(); solidSet.name = "solid-object-set"; solidSetRef.current = solidSet; object.add(solidSet);
          const loaded = await Promise.all(results.map(loadSolidResult));
          loaded.forEach((solid) => resultObjectsRef.current.set(String(solid.userData.solidObjectId), solid));
          loaded.forEach((solid) => solidSet.add(solid));
        } else { const solidSet = new THREE.Group(); solidSet.name = "solid-object-set"; solidSetRef.current = solidSet; object.add(solidSet); }
        if (disposed) return;
        object.traverse((child) => { if (child instanceof THREE.Mesh && !child.material) child.material = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: .58 }); });
        const clearanceComparison = object.getObjectByName("fit-clearance-comparison");
        if (clearanceComparison) clearanceComparison.visible = pathVisible && !hasResults && clearanceComparisonVisible;
        updateSceneMetrics(object);
        modelRef.current = object; scene.add(object);
        const savedView = viewStateRef.current;
        if (savedView) {
          camera.position.fromArray(savedView.position); camera.up.fromArray(savedView.up); camera.zoom = savedView.zoom; camera.updateProjectionMatrix(); controls.target.fromArray(savedView.target); controls.update();
        } else setView("iso");
        setLoading(false); ready = true; setModelRevision((value) => value + 1); invalidate();
        if (pendingResults && JSON.stringify(pendingResults) !== resultGeometryKey) void syncResults(pendingResults);
      } catch (value) { if (!disposed) { setError(value instanceof Error ? value.message : "The 3D view could not be loaded."); setLoading(false); } }
    }
    void load();
    return () => { disposed = true; syncVersion += 1; if (syncResultsRef.current === syncResults) syncResultsRef.current = null; if (syncRiskMarkersRef.current === syncRiskMarkers) syncRiskMarkersRef.current = null; if (frame !== null) window.cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("pointercancel", pointerUp); controls.removeEventListener("change", invalidate); controls.removeEventListener("change", persistView); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); for (const object of Array.from(resultObjectsRef.current.values())) { object.parent?.remove(object); disposeThreeObject(object); } resultObjectsRef.current.clear(); solidSetRef.current = null; disposeThreeObject(scene); cameraRef.current = null; controlsRef.current = null; modelRef.current = null; gridRef.current = null; invalidateRef.current = null; targetRef.current.set(0, 0, 0); selectionHelperRef.current = null; measurementGroupRef.current = null; riskMarkersRef.current = null; sceneRef.current = null; replacePreviewRef.current = null; };
  }, [pathGeometryKey, profileGeometryKey, printerArea.heightMm, printerArea.widthMm, gridStepMm, projectId, setView, viewStateRef]);

  useEffect(() => { void syncResultsRef.current?.(results); }, [resultGeometryKey, results]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || loading) return;
    let group = model.getObjectByName("other-preview-paths") as THREE.Group | undefined;
    if (!group) { group = new THREE.Group(); group.name = "other-preview-paths"; model.add(group); }
    syncOtherPathsPreviewGroup(group, paths, path?.id ?? null);
    invalidateRef.current?.();
  }, [loading, otherPathsGeometryKey, path?.id, paths]);

  useEffect(() => { replacePreviewRef.current?.(yawDeg); }, [clearanceGeometryKey, yawDeg]);
  useEffect(() => { syncRiskMarkersRef.current?.(riskCandidates); }, [riskCandidates, riskGeometryKey]);
  useEffect(() => {
    const model = modelRef.current;
    const previewPath = model?.getObjectByName("preview-path");
    const comparison = model?.getObjectByName("fit-clearance-comparison");
    if (previewPath) previewPath.visible = pathVisible;
    if (comparison) comparison.visible = pathVisible && !hasResults && clearanceComparisonVisible;
    invalidateRef.current?.();
  }, [clearanceComparisonVisible, hasResults, pathVisible]);
  useEffect(() => { const previewProfile = modelRef.current?.getObjectByName("preview-profile"); if (previewProfile) { previewProfile.visible = profileVisible; invalidateRef.current?.(); } }, [profileVisible]);
  useEffect(() => { if (controlsRef.current) controlsRef.current.enableRotate = !measureActive && !printerAreaMoveActive; }, [measureActive, printerAreaMoveActive]);
  useEffect(() => {
    printerAreaMoveActiveRef.current = printerAreaMoveActive;
    if (printerAreaMoveActive) return;
    printerAreaOffsetRef.current.set(0, 0, 0);
    if (gridRef.current) gridRef.current.position.set(0, 0, 0);
    invalidateRef.current?.();
  }, [printerAreaMoveActive]);
  useEffect(() => {
    if (!measureResetRequest) return;
    const group = measurementGroupRef.current;
    if (group) { sceneRef.current?.remove(group); disposeThreeObject(group); measurementGroupRef.current = null; }
    setMeasurementReadout(null);
    invalidateRef.current?.();
  }, [measureResetRequest]);
  useEffect(() => {
    if (!focusRiskRequest || focusRiskNodeIndex === null || loading) return;
    const camera = cameraRef.current; const controls = controlsRef.current;
    const marker = sceneRef.current?.getObjectByName(`sweep-risk-node-${focusRiskNodeIndex}`);
    if (!camera || !controls || !marker) return;
    marker.updateWorldMatrix(true, false);
    const target = marker.getWorldPosition(new THREE.Vector3());
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = THREE.MathUtils.clamp(radiusRef.current * .42, 24, 140);
    controls.target.copy(target); camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target); controls.update();
  }, [focusRiskNodeIndex, focusRiskRequest, loading]);

  useEffect(() => { if (gridRef.current) { gridRef.current.visible = gridVisible; invalidateRef.current?.(); } }, [gridVisible]);
  useEffect(() => { const comparison = modelRef.current?.getObjectByName("fit-clearance-comparison"); if (comparison) { comparison.visible = pathVisible && !hasResults && clearanceComparisonVisible; invalidateRef.current?.(); } }, [clearanceComparisonVisible, hasResults, loading, pathVisible]);
  useEffect(() => {
    const scene = sceneRef.current; const model = modelRef.current;
    if (selectionHelperRef.current) { scene?.remove(selectionHelperRef.current); selectionHelperRef.current.geometry.dispose(); selectionHelperRef.current.material.dispose(); selectionHelperRef.current = null; }
    const selected = selectedResultId ? model?.getObjectByName(`solid-object-${selectedResultId}`) : null;
    if (selected && scene) { const helper = new THREE.BoxHelper(selected, 0xf59e0b); selectionHelperRef.current = helper; scene.add(helper); }
    invalidateRef.current?.();
  }, [loading, modelRevision, selectedResultId]);

  const downloadBase = selectedResultId ? `/api/3d-modeler/projects/${projectId}/jobs/${selectedResultId}/download` : null;
  return <div className="relative flex h-full min-h-0 flex-col">
    <div className="flex h-10 shrink-0 items-center justify-end gap-1 border-b bg-card px-2 text-body-sm"><Button density="compact" variant="outline" onClick={() => setView("iso")}><BoxSelect className="h-4 w-4"/>Isometric</Button><Button density="compact" variant="outline" onClick={() => setView("front")}>Front</Button><Button density="compact" variant="outline" onClick={() => setView("top")}>Top</Button><Button density="compact" variant="outline" onClick={() => setView("right")}>Right</Button><Button density="compact" variant="outline" className="w-8 px-0" aria-label="Fit view" onClick={() => setView("iso")}><Maximize2 className="h-4 w-4"/></Button></div>
    <div className="relative min-h-0 flex-1"><div ref={hostRef} className={printerAreaMoveActive ? "h-full w-full cursor-move" : measureActive ? "h-full w-full cursor-crosshair" : "h-full w-full"}/>{loading ? <div className="absolute inset-0 flex items-center justify-center bg-background/60"><div className="rounded-md border bg-card px-4 py-3 text-body-sm shadow"><RotateCcw className="mr-2 inline h-4 w-4 animate-spin"/>Loading generated model…</div></div> : null}{error ? <div className="absolute left-1/2 top-8 w-[min(560px,90%)] -translate-x-1/2 rounded-md border border-destructive/40 bg-card p-4 text-body-sm text-destructive shadow">{error}</div> : null}{!path && !hasResults ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-body-sm text-muted-foreground">Select a Path in Layers, then select a Profile.</div> : null}{measurementReadout ? <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-amber-500/50 bg-card/95 px-3 py-2 font-mono text-body-sm shadow-xl"><span className="font-semibold text-amber-600">{measurementReadout.distance.toFixed(2)} mm</span><span className="ml-3 text-muted-foreground">ΔX {measurementReadout.dx.toFixed(2)} · ΔY {measurementReadout.dy.toFixed(2)}</span></div> : null}
      {downloadBase ? <div className="absolute bottom-4 right-4 flex gap-1 rounded-lg border bg-card/95 p-2 shadow-xl">{[["STEP", "model.step"], ["3MF", "model.3mf"], ["STL", "model.stl"], ["Manifest", "manifest.json"]].map(([label, artifact]) => <Button key={artifact} asChild density="compact" variant="outline"><a href={`${downloadBase}/${artifact}`}><Download className="h-3.5 w-3.5"/>{label}</a></Button>)}</div> : null}
    </div>
  </div>;
}
