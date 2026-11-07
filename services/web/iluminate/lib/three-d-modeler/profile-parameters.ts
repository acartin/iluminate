import type { ProfileContour, ProfileParameter } from "./contracts";

const coordinate = (node: ProfileContour["nodes"][number], axis: ProfileParameter["axis"]) => axis === "x" ? node.xMm : node.yMm;

export function profileParameterBaseValue(contour: ProfileContour, parameter: Pick<ProfileParameter, "axis" | "fixedNodeIndices" | "controlNodeIndices">): number | null {
  const fixed = parameter.fixedNodeIndices.map((index) => contour.nodes[index]).filter(Boolean);
  const control = parameter.controlNodeIndices.map((index) => contour.nodes[index]).filter(Boolean);
  if (!fixed.length || !control.length) return null;
  const mean = (nodes: typeof fixed) => nodes.reduce((total, node) => total + coordinate(node, parameter.axis), 0) / nodes.length;
  return Math.abs(mean(control) - mean(fixed));
}

export function defaultProfileParameterValues(contour: ProfileContour): Record<string, number> {
  return Object.fromEntries(contour.parameters.map((parameter) => [parameter.id, parameter.defaultMm]));
}

export function normalizedProfileParameterValues(contour: ProfileContour, values: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(contour.parameters.map((parameter) => {
    const candidate = values?.[parameter.id];
    return [parameter.id, typeof candidate === "number" && Number.isFinite(candidate) ? Math.max(parameter.minMm, Math.min(parameter.maxMm, candidate)) : parameter.defaultMm];
  }));
}

export function resolveProfileParameters(contour: ProfileContour, values?: Record<string, number>): ProfileContour {
  const resolved = structuredClone(contour);
  const normalized = normalizedProfileParameterValues(contour, values);
  for (const parameter of contour.parameters) {
    const fixed = parameter.fixedNodeIndices.map((index) => contour.nodes[index]).filter(Boolean);
    const control = parameter.controlNodeIndices.map((index) => contour.nodes[index]).filter(Boolean);
    if (!fixed.length || !control.length) continue;
    const mean = (nodes: typeof fixed) => nodes.reduce((total, node) => total + coordinate(node, parameter.axis), 0) / nodes.length;
    const direction = mean(control) >= mean(fixed) ? 1 : -1;
    const delta = (normalized[parameter.id] - parameter.defaultMm) * direction;
    for (const index of [...parameter.controlNodeIndices, ...parameter.followerNodeIndices]) {
      const node = resolved.nodes[index];
      if (!node) continue;
      if (parameter.axis === "x") node.xMm += delta;
      else node.yMm += delta;
    }
  }
  return resolved;
}
