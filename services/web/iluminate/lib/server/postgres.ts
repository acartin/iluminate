import { Pool } from "pg";

const connectionString = process.env.ILUMINATE_DATABASE_URL;

declare global {
  // eslint-disable-next-line no-var
  var iluminatePgPool: Pool | undefined;
}

export function getPool() {
  if (!connectionString) {
    throw new Error("ILUMINATE_DATABASE_URL is not configured");
  }

  globalThis.iluminatePgPool ??= new Pool({ connectionString });
  return globalThis.iluminatePgPool;
}

export async function query<TRecord extends Record<string, unknown>>(sql: string, values: unknown[] = []) {
  const result = await getPool().query<TRecord>(sql, values);
  return result.rows;
}
