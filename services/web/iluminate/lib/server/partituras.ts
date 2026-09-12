import { PoolClient } from "pg";
import { createDefaultPartituraDocument, normalizeDefaultSignLayout, PartituraDocument, PersistedPartitura } from "@/lib/lighting/partitura-model";
import { getPool } from "@/lib/server/postgres";

type PartituraRow = {
  id: string | number;
  project_id: string | number;
  partitura_key: string;
  name: string;
  client_name: string;
  status: PersistedPartitura["status"];
  document_json: PartituraDocument;
  generated_json: unknown;
  validation_report: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function timestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "partitura";
}

export function mapPartitura(row: PartituraRow): PersistedPartitura {
  // `project_id` is the relational source of truth. Older designer documents
  // used a human-readable key here, which breaks project-scoped resources.
  const document = normalizeDefaultSignLayout({
    ...row.document_json,
    projectId: String(row.project_id)
  });

  return {
    id: String(row.id),
    projectId: String(row.project_id),
    partituraKey: row.partitura_key,
    name: row.name,
    clientName: row.client_name,
    status: row.status,
    document,
    generatedPartitura: row.generated_json ?? undefined,
    validationReport: row.validation_report ?? undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at)
  };
}

export async function getDefaultClient(client: PoolClient) {
  const result = await client.query<{ id: string | number; name: string }>(
    "select id, name from public.auth_clients where client_key = $1 limit 1",
    ["iluminate"]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Default Iluminate client does not exist");
  return { id: Number(row.id), name: row.name };
}

export async function listPartituras() {
  const rows = await getPool().query<PartituraRow>(
    `select p.id,
            p.project_id,
            p.partitura_key,
            p.name,
            c.name as client_name,
            p.status,
            p.document_json,
            p.generated_json,
            p.validation_report,
            p.created_at,
            p.updated_at
       from iluminate.partituras p
       join public.auth_clients c on c.id = p.client_id
      where p.deleted_at is null
      order by p.updated_at desc, p.id desc`
  );
  return rows.rows.map(mapPartitura);
}

export async function listProjectPartituras(projectId: string) {
  const rows = await getPool().query<PartituraRow>(
    `select p.id, p.project_id, p.partitura_key, p.name, c.name as client_name, p.status, p.document_json, p.generated_json, p.validation_report, p.created_at, p.updated_at
       from iluminate.partituras p join public.auth_clients c on c.id = p.client_id
      where p.project_id = $1 and p.deleted_at is null order by p.updated_at desc, p.id desc`,
    [projectId]
  );
  return rows.rows.map(mapPartitura);
}

export async function getPartitura(id: string) {
  const rows = await getPool().query<PartituraRow>(
    `select p.id,
            p.project_id,
            p.partitura_key,
            p.name,
            c.name as client_name,
            p.status,
            p.document_json,
            p.generated_json,
            p.validation_report,
            p.created_at,
            p.updated_at
       from iluminate.partituras p
       join public.auth_clients c on c.id = p.client_id
      where p.id = $1
        and p.deleted_at is null
      limit 1`,
    [id]
  );
  return rows.rows[0] ? mapPartitura(rows.rows[0]) : null;
}

export async function getGeneratedPartituraByKey(partituraKey: string) {
  const rows = await getPool().query<{
    id: string | number;
    partitura_key: string;
    status: PersistedPartitura["status"];
    generated_json: unknown;
    updated_at: Date | string;
  }>(
    `select id,
            partitura_key,
            status,
            generated_json,
            updated_at
       from iluminate.partituras
      where partitura_key = $1
        and deleted_at is null
      limit 1`,
    [partituraKey]
  );

  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    partituraKey: row.partitura_key,
    status: row.status,
    generatedPartitura: row.generated_json,
    updatedAt: timestamp(row.updated_at)
  };
}

async function uniquePartituraKey(client: PoolClient, clientId: number, baseKey: string) {
  let candidate = baseKey;
  for (let index = 2; index < 1000; index += 1) {
    const exists = await client.query("select 1 from iluminate.partituras where client_id = $1 and partitura_key = $2 limit 1", [
      clientId,
      candidate
    ]);
    if (!exists.rowCount) return candidate;
    candidate = `${baseKey}_${index}`;
  }
  return `${baseKey}_${Date.now()}`;
}

export async function createPartitura({
  projectId,
  name,
  duplicateOf
}: {
  projectId: string;
  name?: string;
  duplicateOf?: string;
}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const projectResult = await client.query<{ id: string | number; client_id: string | number }>(
      "select id, client_id from iluminate.projects where id = $1 and deleted_at is null limit 1", [projectId]
    );
    const project = projectResult.rows[0];
    if (!project) throw new Error("Project not found.");
    const source = duplicateOf ? await getPartitura(duplicateOf) : null;
    if (source && source.projectId !== String(project.id)) throw new Error("Partitura belongs to a different project.");
    const partituraName = name?.trim() || (source ? `${source.name} copy` : "Default installation");
    const partituraKey = await uniquePartituraKey(client, Number(project.client_id), slugify(partituraName));
    const document = source
      ? normalizeDefaultSignLayout({ ...source.document, projectId: String(project.id) })
      : createDefaultPartituraDocument(String(project.id));

    const created = await client.query<PartituraRow>(
      `insert into iluminate.partituras (client_id, project_id, partitura_key, name, status, document_json)
       values ($1, $2, $3, $4, 'draft', $5::jsonb)
       returning id,
                 project_id,
                 partitura_key,
                 name,
                 (select name from public.auth_clients where id = $1) as client_name,
                 status,
                 document_json,
                 generated_json,
                 validation_report,
                 created_at,
                 updated_at`,
      [Number(project.client_id), Number(project.id), partituraKey, partituraName, JSON.stringify(document)]
    );
    await client.query("commit");
    return mapPartitura(created.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePartitura(
  id: string,
  patch: {
    name?: string;
    status?: PersistedPartitura["status"];
    document?: PartituraDocument;
    generatedPartitura?: unknown;
    validationReport?: unknown;
  }
) {
  const current = await getPartitura(id);
  if (!current) return null;

  const name = patch.name?.trim() || current.name;
  const status = patch.status ?? current.status;
  const document = normalizeDefaultSignLayout(patch.document ?? current.document);
  const generated = Object.prototype.hasOwnProperty.call(patch, "generatedPartitura") ? patch.generatedPartitura : current.generatedPartitura ?? null;
  const validation = Object.prototype.hasOwnProperty.call(patch, "validationReport") ? patch.validationReport : current.validationReport ?? {};

  const rows = await getPool().query<PartituraRow>(
    `update iluminate.partituras
        set name = $2,
            status = $3,
            document_json = $4::jsonb,
            generated_json = $5::jsonb,
            validation_report = $6::jsonb,
            updated_at = now()
      where id = $1
        and deleted_at is null
      returning id,
                project_id,
                partitura_key,
                name,
                (select name from public.auth_clients where id = iluminate.partituras.client_id) as client_name,
                status,
                document_json,
                generated_json,
                validation_report,
                created_at,
                updated_at`,
    [id, name, status, JSON.stringify(document), generated === null ? null : JSON.stringify(generated), JSON.stringify(validation)]
  );
  return rows.rows[0] ? mapPartitura(rows.rows[0]) : null;
}

export async function deletePartitura(id: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ project_id: string | number }>(
      "update iluminate.partituras set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null returning project_id", [id]
    );
    if (!result.rows[0]) { await client.query("rollback"); return false; }
    await client.query("update iluminate.projects set active_partitura_id = null, updated_at = now() where id = $1 and active_partitura_id = $2", [result.rows[0].project_id, id]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function activatePartitura(projectId: string, partituraId: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const target = await client.query<{ id: string | number }>(
      "select id from iluminate.partituras where id = $1 and project_id = $2 and deleted_at is null limit 1", [partituraId, projectId]
    );
    if (!target.rows[0]) {
      await client.query("rollback");
      return false;
    }
    await client.query("update iluminate.partituras set status = 'validated', updated_at = now() where project_id = $1 and status = 'active' and deleted_at is null", [projectId]);
    await client.query("update iluminate.partituras set status = 'active', updated_at = now() where id = $1", [partituraId]);
    await client.query("update iluminate.projects set active_partitura_id = $2, updated_at = now() where id = $1", [projectId, partituraId]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
