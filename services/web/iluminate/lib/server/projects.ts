import { PoolClient } from "pg";
import { getPool } from "@/lib/server/postgres";

type ProjectRow = {
  id: string | number;
  client_id: string | number;
  client_name: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  active_partitura_id: string | number | null;
  partitura_count: string | number;
  asset_count: string | number;
  controller_count: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

export type PersistedProject = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  activePartituraId?: string;
  partituraCount: number;
  assetCount: number;
  controllerCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PersistedAsset = {
  id: string;
  projectId?: string;
  assetType: string;
  storageUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  createdAt: string;
};

type AssetRow = {
  id: string | number;
  client_id: string | number;
  project_id: string | number | null;
  asset_type: string;
  storage_uri: string;
  file_name: string;
  mime_type: string;
  metadata: { sizeBytes?: number } | string;
  created_at: Date | string;
};

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapProject(row: ProjectRow): PersistedProject {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    clientName: row.client_name,
    name: row.name,
    description: row.description,
    status: row.status,
    activePartituraId: row.active_partitura_id === null ? undefined : String(row.active_partitura_id),
    partituraCount: Number(row.partitura_count),
    assetCount: Number(row.asset_count),
    controllerCount: Number(row.controller_count),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

function mapAsset(row: AssetRow): PersistedAsset {
  const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
  return {
    id: String(row.id),
    projectId: row.project_id === null ? undefined : String(row.project_id),
    assetType: row.asset_type,
    storageUri: row.storage_uri,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: typeof metadata.sizeBytes === "number" ? metadata.sizeBytes : undefined,
    createdAt: timestamp(row.created_at)
  };
}

const projectSelect = `select project.id,
  project.client_id,
  client.name as client_name,
  project.name,
  project.description,
  project.status,
  project.active_partitura_id,
  project.created_at,
  project.updated_at,
  (select count(*) from iluminate.partituras partitura where partitura.project_id = project.id and partitura.deleted_at is null) as partitura_count,
  (select count(*) from iluminate.assets asset where asset.client_id = project.client_id and asset.project_id is not distinct from project.id and asset.deleted_at is null) as asset_count,
  (select count(*) from iluminate.controllers controller where controller.project_id = project.id and controller.deleted_at is null) as controller_count
from iluminate.projects project
join public.auth_clients client on client.id = project.client_id`;

export async function listProjects() {
  const result = await getPool().query<ProjectRow>(`${projectSelect} where project.deleted_at is null order by project.updated_at desc, project.id desc`);
  return result.rows.map(mapProject);
}

export async function getProject(id: string) {
  const result = await getPool().query<ProjectRow>(`${projectSelect} where project.id = $1 and project.deleted_at is null limit 1`, [id]);
  return result.rows[0] ? mapProject(result.rows[0]) : null;
}

export async function createProject({ name, description }: { name: string; description?: string }) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const defaultClient = await client.query<{ id: string | number }>("select id from public.auth_clients where client_key = $1 limit 1", ["iluminate"]);
    if (!defaultClient.rows[0]) throw new Error("Default Iluminate client does not exist");
    const inserted = await client.query<{ id: string | number }>(
      "insert into iluminate.projects (client_id, name, description, status) values ($1, $2, $3, 'draft') returning id",
      [Number(defaultClient.rows[0].id), name.trim(), description?.trim() ?? ""]
    );
    const result = await client.query<ProjectRow>(`${projectSelect} where project.id = $1`, [inserted.rows[0].id]);
    await client.query("commit");
    return mapProject(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProject(id: string, patch: { name?: string; description?: string; status?: PersistedProject["status"] }) {
  const current = await getProject(id);
  if (!current) return null;
  await getPool().query(
    `update iluminate.projects set name = $2, description = $3, status = $4, updated_at = now() where id = $1`,
    [id, patch.name?.trim() || current.name, patch.description?.trim() ?? current.description, patch.status ?? current.status]
  );
  return getProject(id);
}

export async function deleteProject(id: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const project = await getProject(id);
    if (!project) return false;
    await client.query("update iluminate.partituras set deleted_at = now(), updated_at = now() where project_id = $1 and deleted_at is null", [id]);
    await client.query("update iluminate.assets set project_id = null where project_id = $1", [id]);
    await client.query("update iluminate.projects set deleted_at = now(), updated_at = now(), active_partitura_id = null where id = $1", [id]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listProjectAssets(projectId: string) {
  const result = await getPool().query<AssetRow>(
    `select id, client_id, project_id, asset_type, storage_uri, file_name, mime_type, metadata, created_at
       from iluminate.assets
      where project_id = $1 and deleted_at is null
      order by created_at desc, id desc`,
    [projectId]
  );
  return result.rows.map(mapAsset);
}

export async function createProjectAsset({ clientId, projectId, assetType, storageUri, fileName, mimeType, sizeBytes }: { clientId: string; projectId: string; assetType: string; storageUri: string; fileName: string; mimeType: string; sizeBytes: number }) {
  const result = await getPool().query<AssetRow>(
    `insert into iluminate.assets (client_id, project_id, asset_type, storage_uri, file_name, mime_type, metadata)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     returning id, client_id, project_id, asset_type, storage_uri, file_name, mime_type, metadata, created_at`,
    [clientId, projectId, assetType, storageUri, fileName, mimeType, JSON.stringify({ sizeBytes })]
  );
  return mapAsset(result.rows[0]);
}

export async function getProjectAsset(projectId: string, assetId: string) {
  const result = await getPool().query<AssetRow>(
    `select id, client_id, project_id, asset_type, storage_uri, file_name, mime_type, metadata, created_at
       from iluminate.assets
      where id = $1 and project_id = $2 and deleted_at is null
      limit 1`,
    [assetId, projectId]
  );
  return result.rows[0] ? { clientId: String(result.rows[0].client_id), asset: mapAsset(result.rows[0]) } : null;
}

export async function softDeleteProjectAsset(projectId: string, assetId: string) {
  const result = await getPool().query(
    "update iluminate.assets set deleted_at = now() where id = $1 and project_id = $2 and deleted_at is null",
    [assetId, projectId]
  );
  return result.rowCount === 1;
}

export async function resolveProjectForPartitura(client: PoolClient, projectId: string) {
  const result = await client.query<{ id: string | number; client_id: string | number }>(
    "select id, client_id from iluminate.projects where id = $1 and deleted_at is null limit 1",
    [projectId]
  );
  return result.rows[0] ? { id: Number(result.rows[0].id), clientId: Number(result.rows[0].client_id) } : null;
}
