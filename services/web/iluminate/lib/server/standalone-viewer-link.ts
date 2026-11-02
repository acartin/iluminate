import "server-only";

import { randomBytes } from "node:crypto";
import { buildOwnerPlayerBundle } from "@/lib/server/owner-player-bundle";
import { getPartituraForClient } from "@/lib/server/partituras";
import { getPool } from "@/lib/server/postgres";

const assets = new Set(["manifest.json", "partitura.v2.json", "visual-scene.v1.bin"]);

export async function createStandaloneViewerLink(input: {
  partituraId: string;
  trustedClientId: string;
  actorId?: string;
}) {
  const record = await getPartituraForClient(input.partituraId, input.trustedClientId);
  if (!record) throw new Error("Partitura not found in the active client.");
  const bundle = buildOwnerPlayerBundle(record, "unlisted");
  const slug = randomBytes(24).toString("base64url");
  const actorId = /^\d+$/.test(input.actorId ?? "") ? Number(input.actorId) : null;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const clientResult = await client.query<{ id: string | number }>(
      `select id from public.auth_clients where id::text = $1 or client_key = $1 limit 1`,
      [input.trustedClientId]
    );
    const clientId = clientResult.rows[0]?.id;
    if (!clientId) throw new Error("Active client not found.");
    await client.query(
      `insert into iluminate.viewer_bundles
         (bundle_hash, manifest_bytes, partitura_bytes, visual_scene_bytes)
       values ($1, $2, $3, $4)
       on conflict (bundle_hash) do nothing`,
      [
        bundle.manifest.bundleHash,
        Buffer.from(bundle.files.get("manifest.json")!.bytes),
        Buffer.from(bundle.files.get("partitura.v2.json")!.bytes),
        Buffer.from(bundle.files.get("visual-scene.v1.bin")!.bytes)
      ]
    );
    const link = await client.query<{ id: string | number }>(
      `insert into iluminate.viewer_links
         (client_id, partitura_id, bundle_hash, opaque_slug, access_policy, created_by)
       values ($1, $2, $3, $4, 'unlisted', $5)
       returning id`,
      [clientId, record.id, bundle.manifest.bundleHash, slug, actorId]
    );
    await client.query(
      `insert into iluminate.publication_audit
         (client_id, actor_id, action, target_type, target_id, to_policy, metadata)
       values ($1, $2, 'viewer_link.created', 'viewer_link', $3, 'unlisted', $4::jsonb)`,
      [clientId, actorId, link.rows[0].id, JSON.stringify({ bundleHash: bundle.manifest.bundleHash })]
    );
    await client.query("commit");
    return { slug, url: `/viewer/${slug}`, bundleHash: bundle.manifest.bundleHash };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getStandaloneViewerLink(slug: string) {
  if (!validSlug(slug)) return null;
  const result = await getPool().query<{ title: string; access_policy: "review" | "unlisted"; bundle_hash: string }>(
    `select p.name as title, l.access_policy, l.bundle_hash
       from iluminate.viewer_links l
       join iluminate.partituras p on p.id = l.partitura_id and p.client_id = l.client_id
      where l.opaque_slug = $1
        and l.revoked_at is null
        and (l.expires_at is null or l.expires_at > now())
      limit 1`,
    [slug]
  );
  const row = result.rows[0];
  return row ? { title: row.title, policy: row.access_policy, bundleHash: row.bundle_hash } : null;
}

export async function getStandaloneViewerAsset(slug: string, asset: string) {
  if (!validSlug(slug) || !assets.has(asset)) return null;
  const column = asset === "manifest.json" ? "manifest_bytes" : asset === "partitura.v2.json" ? "partitura_bytes" : "visual_scene_bytes";
  const result = await getPool().query<{ bytes: Buffer }>(
    `select b.${column} as bytes
       from iluminate.viewer_links l
       join iluminate.viewer_bundles b on b.bundle_hash = l.bundle_hash
      where l.opaque_slug = $1
        and l.revoked_at is null
        and (l.expires_at is null or l.expires_at > now())
      limit 1`,
    [slug]
  );
  return result.rows[0]?.bytes ?? null;
}

function validSlug(slug: string) {
  return /^[a-zA-Z0-9_-]{20,128}$/.test(slug);
}
