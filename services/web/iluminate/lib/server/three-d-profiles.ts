import { getPool } from "@/lib/server/postgres";
import { defaultThreeDModelDocument, type ThreeDModelDocument, validateThreeDModelDocument } from "@/lib/three-d-modeler/contracts";

export type ThreeDProfileRecord = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  document: ThreeDModelDocument;
  revision: number;
  updatedAt: string;
};

function actorId(userId?: string) {
  return userId && /^\d+$/.test(userId) ? userId : null;
}

function profileDocument(value: unknown): ThreeDModelDocument {
  const document = validateThreeDModelDocument(value);
  document.modelPaths = [];
  document.sweeps = [];
  return validateThreeDModelDocument(document);
}

type ProfileRow = { id: string; name: string; description: string; status: ThreeDProfileRecord["status"]; document_json: unknown; revision: number; updated_at: Date | string };

function mapRecord(row: ProfileRow): ThreeDProfileRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    document: profileDocument(row.document_json),
    revision: row.revision,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  };
}

const selectFields = "id::text, name, description, status, document_json, revision, updated_at";

export async function listThreeDProfiles() {
  const result = await getPool().query<ProfileRow>(`select ${selectFields} from iluminate.three_d_profiles where status <> 'archived' order by lower(name), id`);
  return result.rows.map(mapRecord);
}

export async function getThreeDProfile(id: string) {
  if (!/^\d+$/.test(id)) return null;
  const result = await getPool().query<ProfileRow>(`select ${selectFields} from iluminate.three_d_profiles where id = $1`, [id]);
  return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

export async function createThreeDProfile(nameValue: unknown, descriptionValue: unknown, userId?: string) {
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";
  if (!name || name.length > 80) throw new Error("Enter a Profile name of 1 to 80 characters.");
  if (description.length > 500) throw new Error("The Profile description is too long.");
  const result = await getPool().query<ProfileRow>(`insert into iluminate.three_d_profiles (name, description, document_json, created_by_user_id, updated_by_user_id)
    values ($1, $2, $3::jsonb, $4, $4)
    returning ${selectFields}`, [name, description, JSON.stringify(defaultThreeDModelDocument), actorId(userId)]);
  return mapRecord(result.rows[0]);
}

export async function saveThreeDProfile(id: string, documentValue: unknown, expectedRevision: number, userId?: string) {
  if (!/^\d+$/.test(id) || !Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("The Profile revision is invalid.");
  const document = profileDocument(documentValue);
  const result = await getPool().query<ProfileRow>(`update iluminate.three_d_profiles
    set document_json = $2::jsonb, revision = revision + 1, updated_by_user_id = $3, updated_at = now()
    where id = $1 and revision = $4 returning ${selectFields}`,
    [id, JSON.stringify(document), actorId(userId), expectedRevision]);
  if (!result.rows[0]) throw new Error("This Profile changed in another session. Reload it before saving again.");
  return mapRecord(result.rows[0]);
}
