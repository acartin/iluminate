import { PoolClient } from "pg";
import { createNewPartituraDocument, normalizeDefaultSignLayout, PartituraDocument, PersistedPartitura } from "@/lib/lighting/partitura-model";
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

export type PartituraSummary = {
  id: string;
  projectId: string;
  partituraKey: string;
  name: string;
  clientName: string;
  status: PersistedPartitura["status"];
  canvasWidthCm: number;
  canvasHeightCm: number;
  pixelsPerMeter: number;
  ledsPerMeter: number;
  zones: number;
  routes: number;
  pixels: number;
  updatedAt: string;
};

export type PartituraSaveResult = Pick<PersistedPartitura, "id" | "name" | "status" | "updatedAt"> & {
  generatedPartituraCleared: boolean;
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

export async function listPartituraSummaries(trustedClientId: string) {
  const rows = await getPool().query<{
    id: string | number;
    project_id: string | number;
    partitura_key: string;
    name: string;
    client_name: string;
    status: PersistedPartitura["status"];
    canvas_width_cm: string | number | null;
    canvas_height_cm: string | number | null;
    pixels_per_meter: string | number | null;
    leds_per_meter: string | number | null;
    zone_count: string | number;
    route_count: string | number;
    pixel_count: string | number;
    updated_at: Date | string;
  }>(
    `select p.id,
            p.project_id,
            p.partitura_key,
            p.name,
            c.name as client_name,
            p.status,
            (p.document_json #>> '{designer,canvasWidthCm}')::numeric as canvas_width_cm,
            (p.document_json #>> '{designer,canvasHeightCm}')::numeric as canvas_height_cm,
            coalesce((p.document_json #>> '{designer,addressablePixelsPerMeter}')::numeric, (p.document_json #>> '{designer,ledDensityPerMeter}')::numeric, 0) as pixels_per_meter,
            coalesce((p.document_json #>> '{designer,ledsPerMeter}')::numeric, (p.document_json #>> '{designer,addressablePixelsPerMeter}')::numeric, (p.document_json #>> '{designer,ledDensityPerMeter}')::numeric, 0) as leds_per_meter,
            coalesce(jsonb_array_length(p.document_json #> '{designer,zones}'), 0) as zone_count,
            coalesce(jsonb_array_length(p.document_json #> '{designer,routes}'), 0) as route_count,
            coalesce(jsonb_array_length(p.document_json #> '{compiledLayout,pixelMap}'), 0) as pixel_count,
            p.updated_at
       from iluminate.partituras p
       join public.auth_clients c on c.id = p.client_id
      where p.deleted_at is null
        and (c.id::text = $1 or c.client_key = $1)
      order by p.updated_at desc, p.id desc`,
    [trustedClientId]
  );
  return rows.rows.map((row): PartituraSummary => ({
    id: String(row.id),
    projectId: String(row.project_id),
    partituraKey: row.partitura_key,
    name: row.name,
    clientName: row.client_name,
    status: row.status,
    canvasWidthCm: Number(row.canvas_width_cm ?? 0),
    canvasHeightCm: Number(row.canvas_height_cm ?? 0),
    pixelsPerMeter: Number(row.pixels_per_meter ?? 0),
    ledsPerMeter: Number(row.leds_per_meter ?? 0),
    zones: Number(row.zone_count),
    routes: Number(row.route_count),
    pixels: Number(row.pixel_count),
    updatedAt: timestamp(row.updated_at)
  }));
}

export async function savePartituraDocument(
  id: string,
  input: {
    name: string;
    status: PersistedPartitura["status"];
    document: PartituraDocument;
    clearGeneratedPartitura: boolean;
  },
  trustedClientId: string
): Promise<PartituraSaveResult | null> {
  const document = normalizeDefaultSignLayout(input.document);
  const rows = await getPool().query<{
    id: string | number;
    name: string;
    status: PersistedPartitura["status"];
    updated_at: Date | string;
  }>(
    `update iluminate.partituras p
        set name = $2,
            status = $3,
            document_json = $4::jsonb,
            generated_json = case when $5 then null else generated_json end,
            validation_report = case when $5 then '{}'::jsonb else validation_report end,
            updated_at = now()
      where p.id = $1
        and p.deleted_at is null
        and p.client_id in (
          select id from public.auth_clients where id::text = $6 or client_key = $6
        )
      returning p.id, p.name, p.status, p.updated_at`,
    [id, input.name.trim(), input.status, JSON.stringify(document), input.clearGeneratedPartitura, trustedClientId]
  );
  const row = rows.rows[0];
  return row ? {
    id: String(row.id),
    name: row.name,
    status: row.status,
    updatedAt: timestamp(row.updated_at),
    generatedPartituraCleared: input.clearGeneratedPartitura
  } : null;
}

export async function persistGeneratedPartitura(
  id: string,
  generatedPartitura: unknown,
  validationReport: unknown,
  trustedClientId: string
) {
  const rows = await getPool().query<{ updated_at: Date | string }>(
    `update iluminate.partituras p
        set status = 'validated',
            generated_json = $2::jsonb,
            validation_report = $3::jsonb,
            updated_at = now()
      where p.id = $1
        and p.deleted_at is null
        and p.client_id in (
          select id from public.auth_clients where id::text = $4 or client_key = $4
        )
      returning p.updated_at`,
    [id, JSON.stringify(generatedPartitura), JSON.stringify(validationReport), trustedClientId]
  );
  return rows.rows[0] ? { updatedAt: timestamp(rows.rows[0].updated_at) } : null;
}

export async function getPartituraForClient(id: string, trustedClientId: string) {
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
        and (c.id::text = $2 or c.client_key = $2)
      limit 1`,
    [id, trustedClientId]
  );
  return rows.rows[0] ? mapPartitura(rows.rows[0]) : null;
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
  duplicateOf,
  trustedClientId
}: {
  projectId: string;
  name?: string;
  duplicateOf?: string;
  trustedClientId: string;
}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const projectResult = await client.query<{ id: string | number; client_id: string | number }>(
      `select project.id, project.client_id
         from iluminate.projects project
         join public.auth_clients auth_client on auth_client.id = project.client_id
        where project.id = $1
          and project.deleted_at is null
          and (auth_client.id::text = $2 or auth_client.client_key = $2)
        limit 1`,
      [projectId, trustedClientId]
    );
    const project = projectResult.rows[0];
    if (!project) throw new Error("Project not found.");
    const source = duplicateOf ? await getPartituraForClient(duplicateOf, trustedClientId) : null;
    if (source && source.projectId !== String(project.id)) throw new Error("Partitura belongs to a different project.");
    const partituraName = name?.trim() || (source ? `${source.name} copy` : "Default installation");
    const partituraKey = await uniquePartituraKey(client, Number(project.client_id), slugify(partituraName));
    const document = source
      ? normalizeDefaultSignLayout({ ...source.document, projectId: String(project.id) })
      : createNewPartituraDocument(String(project.id));

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

export async function deletePartitura(id: string, trustedClientId: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ project_id: string | number }>(
      `update iluminate.partituras
          set deleted_at = now(), updated_at = now()
        where id = $1
          and deleted_at is null
          and client_id in (
            select id from public.auth_clients where id::text = $2 or client_key = $2
          )
        returning project_id`,
      [id, trustedClientId]
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
