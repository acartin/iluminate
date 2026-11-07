export type ProfileNodeType = "corner" | "straight" | "smooth" | "symmetric";
export type PrinterUnit = "mm" | "cm" | "in";

export type ProfileVector = { xMm: number; yMm: number };

export type ProfileNode = ProfileVector & {
  nodeType: ProfileNodeType;
  handleIn?: ProfileVector;
  handleOut?: ProfileVector;
};

export type ProfileParameter = {
  id: string;
  name: string;
  axis: "x" | "y";
  defaultMm: number;
  minMm: number;
  maxMm: number;
  fixedNodeIndices: number[];
  controlNodeIndices: number[];
  followerNodeIndices: number[];
};

export type ProfileContour = {
  id: string;
  name: string;
  nodes: ProfileNode[];
  visible: boolean;
  locked: boolean;
  connectionNodeIndex: number;
  parameters: ProfileParameter[];
  source?: {
    type: "global-profile";
    profileId: string;
    contourId: string;
    revision: number;
  };
};

export type ModelPath = {
  id: string;
  name: string;
  nodes: ProfileNode[];
  closed: boolean;
  visible: boolean;
  locked: boolean;
  connectionNodeIndex: number;
  source: {
    type: "asset-svg" | "fabrication-plan";
    assetId?: string;
    sourceName: string;
  };
};

export type SweepDefinition = {
  id: string;
  name: string;
  pathId: string;
  profileId: string;
  direction: "forward" | "reverse";
  pathConnection: "start" | "end";
  profileConnection: { xMm: number; yMm: number; yawDeg: number };
  fitClearanceMm: number;
  fitClearanceDirection: "outward" | "inward";
  profileParameterValues?: Record<string, number>;
  visible: boolean;
  locked: boolean;
};

export type ThreeDLayerFolder = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  objectIds: string[];
};

export type ThreeDModelDocument = {
  version: "3d-model-document.v2";
  modelPaths: ModelPath[];
  sweeps: SweepDefinition[];
  profile: {
    type: "vector";
    catalogId: "custom-vector.v1";
    fillRule: "evenodd";
    contours: ProfileContour[];
  };
  layers: {
    rootObjectIds: string[];
    folders: ThreeDLayerFolder[];
  };
  setup: {
    snapMm: number;
    printerArea: {
      unit: PrinterUnit;
      widthMm: number;
      heightMm: number;
    };
    cornerPolicy: "miter" | "round";
    bodyPolicy: "separate" | "union";
    outputs: Array<"step" | "3mf" | "stl">;
  };
};

export const defaultThreeDModelDocument: ThreeDModelDocument = {
  version: "3d-model-document.v2",
  modelPaths: [],
  sweeps: [],
  profile: {
    type: "vector",
    catalogId: "custom-vector.v1",
    fillRule: "evenodd",
    contours: [{
      id: "outer",
      name: "Outer profile",
      visible: true,
      locked: false,
      connectionNodeIndex: 0,
      parameters: [],
      nodes: [
        { xMm: -2, yMm: 0, nodeType: "corner" },
        { xMm: 2, yMm: 0, nodeType: "corner" },
        { xMm: 2, yMm: 8, nodeType: "corner" },
        { xMm: -2, yMm: 8, nodeType: "corner" }
      ]
    }]
  },
  layers: { rootObjectIds: ["outer"], folders: [] },
  setup: {
    snapMm: 1,
    printerArea: { unit: "mm", widthMm: 220, heightMm: 220 },
    cornerPolicy: "round",
    bodyPolicy: "separate",
    outputs: ["step", "3mf", "stl"]
  }
};

export const emptyThreeDModelDocument: ThreeDModelDocument = {
  ...structuredClone(defaultThreeDModelDocument),
  profile: { ...structuredClone(defaultThreeDModelDocument.profile), contours: [] },
  layers: { rootObjectIds: [], folders: [] }
};

const safeId = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;
const finiteCoordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= -1000 && value <= 1000;
const finitePathCoordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= -10000 && value <= 10000;

export function validateThreeDModelDocument(value: unknown): ThreeDModelDocument {
  if (!value || typeof value !== "object") throw new Error("The 3D document is invalid.");
  const incoming = structuredClone(value) as Record<string, unknown> & { version?: string; modelPaths?: ModelPath[]; sweeps?: SweepDefinition[] };
  if (incoming.version === "3d-model-document.v1") {
    incoming.version = "3d-model-document.v2";
    incoming.modelPaths = [];
    incoming.sweeps = [];
  }
  const document = incoming as unknown as ThreeDModelDocument;
  if (document.version !== "3d-model-document.v2" || document.profile?.type !== "vector" || document.profile.catalogId !== "custom-vector.v1" || document.profile.fillRule !== "evenodd") {
    throw new Error("The 3D document contract is unsupported.");
  }
  if (!Array.isArray(document.profile.contours) || document.profile.contours.length > 64) throw new Error("A 3D document may contain at most 64 Profile entries.");
  let totalNodes = 0;
  const contourIds = new Set<string>();
  for (const contour of document.profile.contours) {
    if (!safeId.test(contour.id) || contourIds.has(contour.id) || typeof contour.name !== "string" || contour.name.length > 80) throw new Error("A profile contour is invalid.");
    contourIds.add(contour.id);
    contour.visible = contour.visible !== false;
    contour.locked = contour.locked === true;
    contour.parameters ??= [];
    if (contour.source !== undefined && (contour.source.type !== "global-profile" || !/^\d+$/.test(contour.source.profileId) || !safeId.test(contour.source.contourId) || !Number.isInteger(contour.source.revision) || contour.source.revision < 1)) throw new Error("A global Profile reference is invalid.");
    if (!Array.isArray(contour.nodes) || contour.nodes.length < 3 || contour.nodes.length > 128) throw new Error("Each contour requires 3 to 128 nodes.");
    totalNodes += contour.nodes.length;
    if (new Set(contour.nodes.map((node) => `${node.xMm}:${node.yMm}`)).size < 3) throw new Error("Each contour requires three distinct nodes.");
    for (const node of contour.nodes) {
      if (!finiteCoordinate(node.xMm) || !finiteCoordinate(node.yMm) || !["corner", "straight", "smooth", "symmetric"].includes(node.nodeType)) throw new Error("A profile node is invalid.");
      if ((node.nodeType === "corner" || node.nodeType === "straight") && (node.handleIn || node.handleOut)) throw new Error("Corner and straight nodes cannot contain handles.");
      for (const handle of [node.handleIn, node.handleOut]) if (handle && (!finiteCoordinate(handle.xMm) || !finiteCoordinate(handle.yMm))) throw new Error("A Bezier handle is invalid.");
    }
    contour.connectionNodeIndex ??= 0;
    if (!Number.isInteger(contour.connectionNodeIndex) || contour.connectionNodeIndex < 0 || contour.connectionNodeIndex >= contour.nodes.length) throw new Error("A profile connection point is invalid.");
    if (!Array.isArray(contour.parameters) || contour.parameters.length > 16) throw new Error("A Profile may contain at most 16 parameters.");
    const parameterIds = new Set<string>();
    const drivenAxes = new Set<string>();
    for (const parameter of contour.parameters) {
      if (!safeId.test(parameter.id) || parameterIds.has(parameter.id) || typeof parameter.name !== "string" || !parameter.name.trim() || parameter.name.length > 80 || !["x", "y"].includes(parameter.axis)) throw new Error("A Profile parameter is invalid.");
      parameterIds.add(parameter.id);
      if (![parameter.defaultMm, parameter.minMm, parameter.maxMm].every((item) => typeof item === "number" && Number.isFinite(item)) || parameter.minMm < 0.01 || parameter.maxMm > 2000 || parameter.minMm > parameter.defaultMm || parameter.defaultMm > parameter.maxMm) throw new Error("A Profile parameter range is invalid.");
      const validGroup = (indices: unknown, required: boolean) => Array.isArray(indices) && (!required || indices.length > 0) && new Set(indices).size === indices.length && indices.every((index) => Number.isInteger(index) && index >= 0 && index < contour.nodes.length);
      if (!validGroup(parameter.fixedNodeIndices, true) || !validGroup(parameter.controlNodeIndices, true) || !validGroup(parameter.followerNodeIndices, false)) throw new Error("A Profile parameter requires valid fixed, control and follower node groups.");
      const memberships = [...parameter.fixedNodeIndices, ...parameter.controlNodeIndices, ...parameter.followerNodeIndices];
      if (new Set(memberships).size !== memberships.length) throw new Error("A Profile parameter node may belong to only one group.");
      for (const index of [...parameter.controlNodeIndices, ...parameter.followerNodeIndices]) {
        const key = `${parameter.axis}:${index}`;
        if (drivenAxes.has(key)) throw new Error("Two Profile parameters cannot drive the same node on the same axis.");
        drivenAxes.add(key);
      }
    }
  }
  if (totalNodes > 4096) throw new Error("A 3D document may contain at most 4096 Profile nodes.");
  if (!Array.isArray(document.modelPaths) || document.modelPaths.length > 128) throw new Error("A 3D document may contain at most 128 Model Paths.");
  const pathIds = new Set<string>();
  let totalPathNodes = 0;
  for (const path of document.modelPaths) {
    if (!safeId.test(path.id) || pathIds.has(path.id) || typeof path.name !== "string" || !path.name.trim() || path.name.length > 80) throw new Error("A Model Path is invalid.");
    pathIds.add(path.id);
    path.visible = path.visible !== false;
    path.locked = path.locked === true;
    if (!Array.isArray(path.nodes) || path.nodes.length < (path.closed ? 3 : 2) || path.nodes.length > 512) throw new Error("A Model Path has an invalid node count.");
    totalPathNodes += path.nodes.length;
    for (const node of path.nodes) {
      if (!finitePathCoordinate(node.xMm) || !finitePathCoordinate(node.yMm) || !["corner", "straight", "smooth", "symmetric"].includes(node.nodeType)) throw new Error("A Model Path node is invalid.");
      if ((node.nodeType === "corner" || node.nodeType === "straight") && (node.handleIn || node.handleOut)) throw new Error("Corner and straight Model Path nodes cannot contain handles.");
      for (const handle of [node.handleIn, node.handleOut]) if (handle && (!finitePathCoordinate(handle.xMm) || !finitePathCoordinate(handle.yMm))) throw new Error("A Model Path handle is invalid.");
    }
    path.connectionNodeIndex ??= 0;
    if (!Number.isInteger(path.connectionNodeIndex) || path.connectionNodeIndex < 0 || path.connectionNodeIndex >= path.nodes.length || (!path.closed && path.connectionNodeIndex !== 0 && path.connectionNodeIndex !== path.nodes.length - 1)) throw new Error("A Model Path connection point must be an endpoint when the path is open.");
    if (!path.source || !["asset-svg", "fabrication-plan"].includes(path.source.type) || typeof path.source.sourceName !== "string" || path.source.sourceName.length > 160 || (path.source.assetId !== undefined && !safeId.test(path.source.assetId))) throw new Error("A Model Path source is invalid.");
  }
  if (totalPathNodes > 4096) throw new Error("A 3D document may contain at most 4096 Model Path nodes.");
  if (!Array.isArray(document.sweeps) || document.sweeps.length > 128) throw new Error("A 3D document may contain at most 128 Sweeps.");
  const sweepIds = new Set<string>();
  for (const sweep of document.sweeps) {
    if (!safeId.test(sweep.id) || sweepIds.has(sweep.id) || typeof sweep.name !== "string" || !sweep.name.trim() || sweep.name.length > 80 || !pathIds.has(sweep.pathId) || !contourIds.has(sweep.profileId)) throw new Error("A Sweep relation is invalid.");
    sweepIds.add(sweep.id);
    const legacyConnection = sweep.profileConnection as SweepDefinition["profileConnection"] & { rollDeg?: number };
    if (legacyConnection.yawDeg === undefined && typeof legacyConnection.rollDeg === "number") legacyConnection.yawDeg = legacyConnection.rollDeg;
    delete legacyConnection.rollDeg;
    sweep.fitClearanceMm ??= 0;
    if (typeof sweep.fitClearanceMm !== "number" || !Number.isFinite(sweep.fitClearanceMm) || sweep.fitClearanceMm < 0 || sweep.fitClearanceMm > 5) throw new Error("Fit clearance must be between 0 and 5 mm.");
    sweep.fitClearanceDirection ??= "outward";
    if (!["outward", "inward"].includes(sweep.fitClearanceDirection)) throw new Error("Fit clearance direction must be outward or inward.");
    if (!["forward", "reverse"].includes(sweep.direction) || !["start", "end"].includes(sweep.pathConnection) || !finiteCoordinate(sweep.profileConnection?.xMm) || !finiteCoordinate(sweep.profileConnection?.yMm) || typeof sweep.profileConnection.yawDeg !== "number" || !Number.isFinite(sweep.profileConnection.yawDeg) || Math.abs(sweep.profileConnection.yawDeg) > 180) throw new Error("A Sweep connection is invalid.");
    sweep.profileParameterValues ??= {};
    const profile = document.profile.contours.find((contour) => contour.id === sweep.profileId)!;
    const parameters = new Map(profile.parameters.map((parameter) => [parameter.id, parameter]));
    if (!sweep.profileParameterValues || typeof sweep.profileParameterValues !== "object" || Array.isArray(sweep.profileParameterValues)) throw new Error("Sweep Profile parameter values are invalid.");
    for (const [id, value] of Object.entries(sweep.profileParameterValues)) {
      const parameter = parameters.get(id);
      if (!parameter || typeof value !== "number" || !Number.isFinite(value) || value < parameter.minMm || value > parameter.maxMm) throw new Error("A Sweep Profile parameter value is invalid.");
    }
    sweep.visible = sweep.visible !== false;
    sweep.locked = sweep.locked === true;
  }
  if (document.setup && document.setup.snapMm === undefined) document.setup.snapMm = 0.5;
  if (document.setup && document.setup.printerArea === undefined) document.setup.printerArea = { unit: "mm", widthMm: 220, heightMm: 220 };
  const printerArea = document.setup?.printerArea;
  if (typeof document.setup?.snapMm !== "number" || !Number.isFinite(document.setup.snapMm) || document.setup.snapMm < 0.01 || document.setup.snapMm > 100 || !printerArea || !["mm", "cm", "in"].includes(printerArea.unit) || typeof printerArea.widthMm !== "number" || !Number.isFinite(printerArea.widthMm) || printerArea.widthMm < 10 || printerArea.widthMm > 2000 || typeof printerArea.heightMm !== "number" || !Number.isFinite(printerArea.heightMm) || printerArea.heightMm < 10 || printerArea.heightMm > 2000 || !["miter", "round"].includes(document.setup.cornerPolicy) || !["separate", "union"].includes(document.setup.bodyPolicy)) throw new Error("The sweep setup is invalid.");
  if (!Array.isArray(document.setup.outputs) || !document.setup.outputs.includes("step") || new Set(document.setup.outputs).size !== document.setup.outputs.length || document.setup.outputs.some((item) => !["step", "3mf", "stl"].includes(item))) throw new Error("STEP is required and outputs must be unique and supported.");
  const layers = document.layers ?? { rootObjectIds: Array.from(contourIds), folders: [] };
  if (!Array.isArray(layers.rootObjectIds) || !Array.isArray(layers.folders) || layers.folders.length > 64) throw new Error("The Layers tree is invalid.");
  const folderIds = new Set<string>();
  const assigned = new Set<string>();
  const validateObjectIds = (ids: unknown) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !contourIds.has(id) || assigned.has(id))) throw new Error("The Layers tree contains an invalid object assignment.");
    ids.forEach((id) => assigned.add(id));
  };
  validateObjectIds(layers.rootObjectIds);
  for (const folder of layers.folders) {
    if (!safeId.test(folder.id) || folderIds.has(folder.id) || typeof folder.name !== "string" || !folder.name.trim() || folder.name.length > 80) throw new Error("A Layers folder is invalid.");
    folderIds.add(folder.id);
    folder.visible = folder.visible !== false;
    folder.locked = folder.locked === true;
    validateObjectIds(folder.objectIds);
  }
  if (assigned.size !== contourIds.size) throw new Error("Every profile object must belong to the Layers root or one folder.");
  document.layers = layers;
  return structuredClone(document);
}

export function profilePath(contour: ProfileContour): string {
  if (!contour.nodes.length) return "";
  const commands = [`M ${contour.nodes[0].xMm} ${-contour.nodes[0].yMm}`];
  for (let index = 0; index < contour.nodes.length; index += 1) {
    const node = contour.nodes[index];
    const next = contour.nodes[(index + 1) % contour.nodes.length];
    if (node.handleOut || next.handleIn) {
      const a = node.handleOut ?? { xMm: 0, yMm: 0 };
      const b = next.handleIn ?? { xMm: 0, yMm: 0 };
      commands.push(`C ${node.xMm + a.xMm} ${-(node.yMm + a.yMm)} ${next.xMm + b.xMm} ${-(next.yMm + b.yMm)} ${next.xMm} ${-next.yMm}`);
    } else commands.push(`L ${next.xMm} ${-next.yMm}`);
  }
  return `${commands.join(" ")} Z`;
}

export function modelPathData(path: Pick<ModelPath, "nodes" | "closed">): string {
  if (!path.nodes.length) return "";
  const commands = [`M ${path.nodes[0].xMm} ${-path.nodes[0].yMm}`];
  const edgeCount = path.closed ? path.nodes.length : path.nodes.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const node = path.nodes[index];
    const next = path.nodes[(index + 1) % path.nodes.length];
    if (node.handleOut || next.handleIn) {
      const a = node.handleOut ?? { xMm: 0, yMm: 0 };
      const b = next.handleIn ?? { xMm: 0, yMm: 0 };
      commands.push(`C ${node.xMm + a.xMm} ${-(node.yMm + a.yMm)} ${next.xMm + b.xMm} ${-(next.yMm + b.yMm)} ${next.xMm} ${-next.yMm}`);
    } else commands.push(`L ${next.xMm} ${-next.yMm}`);
  }
  return `${commands.join(" ")}${path.closed ? " Z" : ""}`;
}

export function modelPathsSvg(paths: ModelPath[]): string {
  if (!paths.length) throw new Error("At least one Model Path is required.");
  const points = paths.flatMap((path) => path.nodes.flatMap((node) => [node, ...(node.handleIn ? [{ xMm: node.xMm + node.handleIn.xMm, yMm: node.yMm + node.handleIn.yMm }] : []), ...(node.handleOut ? [{ xMm: node.xMm + node.handleOut.xMm, yMm: node.yMm + node.handleOut.yMm }] : [])]));
  const minX = Math.min(...points.map((point) => point.xMm));
  const maxX = Math.max(...points.map((point) => point.xMm));
  const minY = Math.min(...points.map((point) => point.yMm));
  const maxY = Math.max(...points.map((point) => point.yMm));
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const normalized = paths.map((path) => ({ ...path, nodes: path.nodes.map((node) => ({ ...node, xMm: node.xMm - minX, yMm: node.yMm - maxY })) }));
  const body = normalized.map((path) => `<path id="${path.id}" d="${modelPathData(path)}" fill="none"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
