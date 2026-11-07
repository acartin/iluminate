import { createHash } from "node:crypto";
import { getPool } from "@/lib/server/postgres";
import { deleteThreeDArtifacts, deleteThreeDSource, uploadThreeDSource } from "@/lib/server/r2-three-d-models";
import { modelPathsSvg, ThreeDModelDocument, validateThreeDModelDocument } from "@/lib/three-d-modeler/contracts";
import { analyzeFitClearance } from "@/lib/three-d-modeler/fit-clearance";
import { resolveProfileParameters } from "@/lib/three-d-modeler/profile-parameters";

export type ThreeDJob = { id: string; sweepId?: string; displayName?: string; status: string; sourceOriginMm?: { xMm: number; yMm: number; zMm: number }; fitClearanceMm: number; fitClearanceDirection: "outward" | "inward"; errorCode?: string; errorSummary?: string; manifest?: Record<string, unknown>; createdAt: string; completedAt?: string };

type ThreeDJobRow = { id: string; display_name: string | null; status: string; recipe_json: Record<string, unknown>; error_code: string | null; error_summary: string | null; manifest_json: Record<string, unknown> | null; created_at: Date | string; completed_at: Date | string | null };

const timestamp = (value: Date | string | null) => value ? (value instanceof Date ? value.toISOString() : String(value)) : undefined;
const checksum = (value: Uint8Array | string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const THREE_D_ENGINE_CONTRACT = "build123d-0.13.0-ocp-8.0.1.1.0-r7";

function pathSourceOrigin(path: ThreeDModelDocument["modelPaths"][number]) {
  const points = path.nodes.flatMap((node) => [
    { xMm: node.xMm, yMm: node.yMm },
    ...(node.handleIn ? [{ xMm: node.xMm + node.handleIn.xMm, yMm: node.yMm + node.handleIn.yMm }] : []),
    ...(node.handleOut ? [{ xMm: node.xMm + node.handleOut.xMm, yMm: node.yMm + node.handleOut.yMm }] : [])
  ]);
  return { xMm: Math.min(...points.map((point) => point.xMm)), yMm: Math.min(...points.map((point) => point.yMm)), zMm: 0 };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function validateSweepSvg(svg: string, requestedPathIds: unknown): string[] {
  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes < 1 || bytes > 2 * 1024 * 1024 || !/^\s*<svg\b/i.test(svg)) throw new Error("Upload a metric SVG smaller than 2 MB.");
  const behaviorScan = svg.replace(/\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i, "");
  if (/<!doctype|<!entity|<script|<foreignObject|<image|<style|\son\w+\s*=|\b(?:href|src)\s*=|url\s*\(|https?:|file:|data:/i.test(behaviorScan)) throw new Error("The SVG contains unsupported or external content.");
  const tags = Array.from(svg.matchAll(/<\/?\s*([A-Za-z][\w:-]*)\b/g)).map((match) => match[1].toLowerCase());
  if (tags.some((tag) => !["svg", "g", "path", "title", "metadata"].includes(tag))) throw new Error("The SVG must contain paths only.");
  if (!/\bwidth\s*=\s*["'][0-9.]+mm["']/i.test(svg) || !/\bheight\s*=\s*["'][0-9.]+mm["']/i.test(svg) || !/\bviewBox\s*=/i.test(svg)) throw new Error("The SVG requires width, height in millimeters and a viewBox.");
  if (!Array.isArray(requestedPathIds) || requestedPathIds.length < 1 || requestedPathIds.length > 128) throw new Error("Select at least one SVG path.");
  const present = new Set(Array.from(svg.matchAll(/<path\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi)).map((match) => match[1]));
  const pathIds = requestedPathIds.map(String);
  if (new Set(pathIds).size !== pathIds.length || pathIds.some((id) => !/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/.test(id) || !present.has(id))) throw new Error("A selected SVG path is missing or unsafe.");
  return pathIds;
}

export async function getThreeDDocument(clientId: string, projectId: string) {
  const result = await getPool().query<{ document_json: unknown; revision: number }>("select document_json, revision from iluminate.three_d_model_documents where client_id = $1 and project_id = $2", [clientId, projectId]);
  return result.rows[0] ? { document: validateThreeDModelDocument(result.rows[0].document_json), revision: result.rows[0].revision } : null;
}

export async function saveThreeDDocument(clientId: string, projectId: string, document: ThreeDModelDocument, userId?: string) {
  const valid = validateThreeDModelDocument(document);
  const actor = userId && /^\d+$/.test(userId) ? userId : null;
  const result = await getPool().query<{ revision: number }>(`insert into iluminate.three_d_model_documents (client_id, project_id, document_json, updated_by_user_id)
    values ($1, $2, $3::jsonb, $4) on conflict (project_id) do update set document_json = excluded.document_json, revision = iluminate.three_d_model_documents.revision + 1, updated_by_user_id = excluded.updated_by_user_id, updated_at = now()
    where iluminate.three_d_model_documents.client_id = excluded.client_id returning revision`, [clientId, projectId, JSON.stringify(valid), actor]);
  if (!result.rows[0]) throw new Error("The 3D document does not belong to this tenant.");
  return result.rows[0].revision;
}

export async function allocateThreeDJob(clientId: string, projectId: string, document: ThreeDModelDocument, sweepId: string, userId?: string) {
  const sweep = document.sweeps.find((item) => item.id === sweepId);
  if (!sweep) throw new Error("Select a valid Sweep relation.");
  const path = document.modelPaths.find((item) => item.id === sweep.pathId);
  const profile = document.profile.contours.find((item) => item.id === sweep.profileId);
  if (!path || !profile) throw new Error("The Sweep path or profile no longer exists.");
  const fitClearance = analyzeFitClearance(path, sweep.fitClearanceMm, sweep.fitClearanceDirection);
  if (!fitClearance.valid) throw new Error(fitClearance.summary);
  if (sweep.profileConnection.xMm !== 0 || sweep.profileConnection.yMm !== 0) throw new Error("Custom profile offsets are saved, but engine execution is not enabled yet.");
  const swapHandles = (nodes: typeof path.nodes) => nodes.map((node) => ({ ...node, handleIn: node.handleOut, handleOut: node.handleIn }));
  let pathNodes: typeof path.nodes;
  if (path.closed) {
    pathNodes = [...path.nodes.slice(path.connectionNodeIndex), ...path.nodes.slice(0, path.connectionNodeIndex)];
    if (sweep.direction === "reverse") pathNodes = [pathNodes[0], ...swapHandles(pathNodes.slice(1).reverse())].map((node, index) => index === 0 ? { ...node, handleIn: node.handleOut, handleOut: node.handleIn } : node);
  } else {
    const expectedDirection = path.connectionNodeIndex === 0 ? "forward" : "reverse";
    if (sweep.direction !== expectedDirection) throw new Error(`An open path connected at this endpoint must use ${expectedDirection} direction.`);
    pathNodes = path.connectionNodeIndex === 0 ? path.nodes : swapHandles([...path.nodes].reverse());
  }
  const effectivePath = { ...path, nodes: pathNodes };
  const resolvedProfile = resolveProfileParameters(profile, sweep.profileParameterValues);
  const profileOrigin = resolvedProfile.nodes[resolvedProfile.connectionNodeIndex];
  const profileNodes = resolvedProfile.nodes.map((node) => ({ ...node, xMm: node.xMm - profileOrigin.xMm, yMm: node.yMm - profileOrigin.yMm }));
  const svg = modelPathsSvg([effectivePath]);
  const pathIds = [path.id];
  const source = Buffer.from(svg, "utf8");
  const recipe = {
    operation: "profile_sweep",
    sweepId: sweep.id,
    pathIds,
    profile: { ...document.profile, contours: [{ id: profile.id, nodes: profileNodes }] },
    sourceOriginMm: pathSourceOrigin(path),
    profileYawDeg: sweep.profileConnection.yawDeg,
    fitClearanceMm: sweep.fitClearanceMm,
    fitClearanceDirection: sweep.fitClearanceDirection,
    cornerPolicy: document.setup.cornerPolicy,
    endCap: "flat",
    bodyPolicy: document.setup.bodyPolicy,
    outputs: document.setup.outputs,
    linearToleranceMm: 0.05,
    angularToleranceRad: 0.1
  };
  const recipeChecksum = checksum(canonicalJson(recipe));
  const database = await getPool().connect();
  let uploadedId: string | null = null;
  try {
    await database.query("begin");
    await database.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`3d-sweep:${clientId}:${projectId}:${sweep.id}`]);
    const existing = await database.query<{ id: string; status: string; recipe_checksum: string; engine_contract: string | null }>(`select id::text, status, recipe_checksum, manifest_json #>> '{engine,contract}' as engine_contract
      from iluminate.three_d_model_jobs
      where client_id = $1 and project_id = $2 and recipe_json ->> 'sweepId' = $3
      order by created_at desc limit 1 for update`, [clientId, projectId, sweep.id]);
    const current = existing.rows[0];
    if (current && (["queued", "leased", "processing"].includes(current.status) || (current.status === "succeeded" && current.recipe_checksum === recipeChecksum && current.engine_contract === THREE_D_ENGINE_CONTRACT))) {
      await database.query("commit");
      return { id: current.id, status: current.status, reused: true, recipe };
    }

    const id = (await database.query<{ id: string }>("select nextval(pg_get_serial_sequence('iluminate.three_d_model_jobs', 'id'))::text as id")).rows[0].id;
    const key = `clients/${clientId}/3d-models/${projectId}/${id}/source.svg`;
    await uploadThreeDSource(clientId, projectId, id, source);
    uploadedId = id;
    await database.query(`insert into iluminate.three_d_model_jobs (id, client_id, project_id, source_object_key, source_checksum, source_size_bytes, recipe_json, recipe_checksum, created_by_user_id)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`, [id, clientId, projectId, key, checksum(source), source.length, JSON.stringify(recipe), recipeChecksum, userId && /^\d+$/.test(userId) ? userId : null]);
    await database.query("commit");
    return { id, status: "queued", reused: false, key, source, recipe };
  } catch (error) {
    await database.query("rollback").catch(() => undefined);
    if (uploadedId) await deleteThreeDSource(clientId, projectId, uploadedId).catch(() => undefined);
    throw error;
  } finally {
    database.release();
  }
}

export async function listThreeDJobs(clientId: string, projectId: string): Promise<ThreeDJob[]> {
  const result = await getPool().query<ThreeDJobRow>(`select id::text, display_name, status, recipe_json, error_code, error_summary, manifest_json, created_at, completed_at from iluminate.three_d_model_jobs where client_id = $1 and project_id = $2 order by created_at desc limit 250`, [clientId, projectId]);
  return result.rows.map(threeDJobFromRow);
}

export function threeDJobFromRow(row: ThreeDJobRow): ThreeDJob {
  const clearance = row.recipe_json?.fitClearanceMm;
  const fitClearanceMm = typeof clearance === "number" && Number.isFinite(clearance) && clearance >= 0 && clearance <= 5 ? clearance : 0;
  const fitClearanceDirection = row.recipe_json?.fitClearanceDirection === "inward" ? "inward" : "outward";
  const origin = row.recipe_json?.sourceOriginMm;
  const sourceOriginMm = origin && typeof origin === "object" && ["xMm", "yMm", "zMm"].every((key) => typeof (origin as Record<string, unknown>)[key] === "number" && Number.isFinite((origin as Record<string, number>)[key]))
    ? { xMm: (origin as Record<string, number>).xMm, yMm: (origin as Record<string, number>).yMm, zMm: (origin as Record<string, number>).zMm }
    : undefined;
  return { id: row.id, sweepId: typeof row.recipe_json?.sweepId === "string" ? row.recipe_json.sweepId : undefined, displayName: row.display_name ?? undefined, status: row.status, sourceOriginMm, fitClearanceMm, fitClearanceDirection, errorCode: row.error_code ?? undefined, errorSummary: row.error_summary ?? undefined, manifest: row.manifest_json ?? undefined, createdAt: timestamp(row.created_at)!, completedAt: timestamp(row.completed_at) };
}

export async function renameThreeDSolidObject(clientId: string, projectId: string, jobId: string, displayName: string): Promise<string | null> {
  const name = displayName.trim();
  if (!/^\d+$/.test(jobId) || name.length < 1 || name.length > 80) return null;
  const updated = await getPool().query<{ display_name: string }>("update iluminate.three_d_model_jobs set display_name = $4, updated_at = now() where id = $1 and client_id = $2 and project_id = $3 and status = 'succeeded' returning display_name", [jobId, clientId, projectId, name]);
  return updated.rows[0]?.display_name ?? null;
}

export async function deleteThreeDSolidObject(clientId: string, projectId: string, jobId: string): Promise<boolean> {
  if (!/^\d+$/.test(jobId)) return false;
  const existing = await getPool().query("select id from iluminate.three_d_model_jobs where id = $1 and client_id = $2 and project_id = $3 and status = 'succeeded'", [jobId, clientId, projectId]);
  if (!existing.rows[0]) return false;
  await deleteThreeDArtifacts(clientId, projectId, jobId);
  const deleted = await getPool().query("delete from iluminate.three_d_model_jobs where id = $1 and client_id = $2 and project_id = $3 and status = 'succeeded' returning id", [jobId, clientId, projectId]);
  return deleted.rowCount !== null && deleted.rowCount > 0;
}
