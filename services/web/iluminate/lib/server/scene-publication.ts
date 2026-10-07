import "server-only";

import { randomBytes } from "node:crypto";
import type { Partitura } from "@iluminate/lighting-core";
import { validatePartitura } from "@iluminate/lighting-core";
import { buildPlayerBundle, type PlayerBundlePrivacy } from "@/lib/lighting/player-bundle-builder";
import { normalizeDefaultSignLayout, type PartituraDocument } from "@/lib/lighting/partitura-model";
import { computeAuthoringSourceChecksum } from "@/lib/server/partitura-checksum";
import { getPool } from "@/lib/server/postgres";
import { deletePublicShareManifest, uploadPlayerBundle } from "@/lib/server/r2-render-artifacts";

const renderProfiles = new Set(["social-1080p30", "review-720p30"]);

export async function createScenePublication(input: {
  partituraId: string;
  trustedClientId: string;
  actorId?: string;
  privacy: PlayerBundlePrivacy;
  profile: string;
}) {
  if (!renderProfiles.has(input.profile)) throw new Error("Unsupported render profile.");
  const sourceResult = await getPool().query<{
    id: string | number;
    client_id: string | number;
    name: string;
    document_json: PartituraDocument;
    generated_json: Partitura | null;
  }>(
    `select p.id, p.client_id, p.name, p.document_json, p.generated_json
       from iluminate.partituras p
       join public.auth_clients c on c.id = p.client_id
      where p.id = $1
        and p.deleted_at is null
        and (c.id::text = $2 or c.client_key = $2)
      limit 1`,
    [input.partituraId, input.trustedClientId]
  );
  const source = sourceResult.rows[0];
  if (!source) throw new Error("Partitura not found in the active client.");
  const document = normalizeDefaultSignLayout(source.document_json);
  const generated = source.generated_json;
  if (!generated) throw new Error("Generate and save partitura.v2 before creating a share.");
  const validation = validatePartitura(generated);
  if (!validation.ok) throw new Error(validation.errors[0]?.message ?? "Generated partitura is invalid.");
  if (!document.designer || !document.compiledLayout) throw new Error("Compile the visual scene before creating a share.");
  if (generated.sourceChecksum !== computeAuthoringSourceChecksum(document)) {
    throw new Error("The generated partitura is stale. Generate and save it again before sharing.");
  }

  const bundle = buildPlayerBundle({
    partitura: generated,
    designer: document.designer,
    layout: document.compiledLayout,
    privacy: input.privacy
  });
  const uploaded = await uploadPlayerBundle(bundle, input.privacy);
  const opaqueSlug = randomBytes(24).toString("base64url");
  const actorId = /^\d+$/.test(input.actorId ?? "") ? Number(input.actorId) : null;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const artifactResult = await client.query<{ id: string | number; status: string }>(
      `insert into iluminate.render_artifacts
         (client_id, bundle_hash, profile, status, privacy, bundle_object_key)
       values ($1, $2, $3, 'pending', $4, $5)
       on conflict (client_id, bundle_hash, profile, privacy) do update
         set bundle_object_key = excluded.bundle_object_key,
             updated_at = now()
       returning id, status`,
      [source.client_id, bundle.manifest.bundleHash, input.profile, input.privacy, uploaded.manifestKey]
    );
    const artifact = artifactResult.rows[0];
    const activeJob = await client.query<{ id: string | number }>(
      `select id from iluminate.render_jobs
        where client_id = $1 and artifact_id = $2 and status in ('queued', 'running')
        limit 1`,
      [source.client_id, artifact.id]
    );
    let jobId = activeJob.rows[0]?.id;
    if (!jobId && artifact.status !== "ready") {
      const inserted = await client.query<{ id: string | number }>(
        `insert into iluminate.render_jobs (client_id, artifact_id, bundle_hash, profile)
         values ($1, $2, $3, $4)
         on conflict (client_id, artifact_id) where status in ('queued', 'running') do nothing
         returning id`,
        [source.client_id, artifact.id, bundle.manifest.bundleHash, input.profile]
      );
      jobId = inserted.rows[0]?.id;
      if (!jobId) {
        const coalesced = await client.query<{ id: string | number }>(
          `select id from iluminate.render_jobs
            where client_id = $1 and artifact_id = $2 and status in ('queued', 'running')
            limit 1`,
          [source.client_id, artifact.id]
        );
        jobId = coalesced.rows[0]?.id;
      }
    }
    const share = await client.query<{ id: string | number }>(
      `insert into iluminate.scene_shares
         (client_id, partitura_id, artifact_id, opaque_slug, access_policy, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [source.client_id, source.id, artifact.id, opaqueSlug, input.privacy, actorId]
    );
    await client.query(
      `insert into iluminate.publication_audit
         (client_id, actor_id, action, target_type, target_id, to_policy, metadata)
       values ($1, $2, 'scene_share.created', 'scene_share', $3, $4, $5::jsonb)`,
      [source.client_id, actorId, share.rows[0].id, input.privacy, JSON.stringify({ bundleHash: bundle.manifest.bundleHash, profile: input.profile })]
    );
    await client.query("commit");
    return {
      shareId: String(share.rows[0].id),
      slug: opaqueSlug,
      policy: input.privacy,
      artifactId: String(artifact.id),
      jobId: jobId ? String(jobId) : null,
      status: artifact.status,
      bundleHash: bundle.manifest.bundleHash,
      publicBundleUrl: uploaded.manifestUrl,
      shareUrl: sceneShareUrl(input.privacy, opaqueSlug)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export type SceneShareStatus = {
  shareId: string;
  slug: string;
  title: string;
  policy: PlayerBundlePrivacy;
  status: "pending" | "rendering" | "ready" | "failed" | "cancelled";
  errorSummary: string | null;
  shareUrl: string | null;
  revoked: boolean;
  createdAt: string;
};

export async function getSceneShareStatus(input: { shareId: string; trustedClientId: string }): Promise<SceneShareStatus | null> {
  const result = await getPool().query<{
    id: string | number;
    opaque_slug: string;
    access_policy: PlayerBundlePrivacy;
    status: SceneShareStatus["status"];
    error_summary: string | null;
    revoked_at: Date | string | null;
    created_at: Date | string;
    title: string;
  }>(
    `select s.id, s.opaque_slug, s.access_policy, a.status, a.error_summary,
            s.revoked_at, s.created_at, p.name as title
       from iluminate.scene_shares s
       join iluminate.render_artifacts a on a.id = s.artifact_id and a.client_id = s.client_id
       join iluminate.partituras p on p.id = s.partitura_id and p.client_id = s.client_id
       join public.auth_clients c on c.id = s.client_id
      where s.id = $1 and (c.id::text = $2 or c.client_key = $2)
      limit 1`,
    [input.shareId, input.trustedClientId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    shareId: String(row.id),
    slug: row.opaque_slug,
    title: row.title,
    policy: row.access_policy,
    status: row.status,
    errorSummary: row.error_summary,
    shareUrl: row.revoked_at ? null : sceneShareUrl(row.access_policy, row.opaque_slug),
    revoked: Boolean(row.revoked_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

export async function revokeSceneShare(input: { shareId: string; trustedClientId: string; actorId?: string }) {
  const actorId = /^\d+$/.test(input.actorId ?? "") ? Number(input.actorId) : null;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const revoked = await client.query<{ id: string | number; client_id: string | number; access_policy: PlayerBundlePrivacy; opaque_slug: string }>(
      `update iluminate.scene_shares s
          set revoked_at = coalesce(revoked_at, now()), updated_at = now()
         from public.auth_clients c
        where s.id = $1 and c.id = s.client_id and (c.id::text = $2 or c.client_key = $2)
        returning s.id, s.client_id, s.access_policy, s.opaque_slug`,
      [input.shareId, input.trustedClientId]
    );
    const row = revoked.rows[0];
    if (!row) {
      await client.query("rollback");
      return false;
    }
    if (row.access_policy === "public") await deletePublicShareManifest(row.opaque_slug);
    await client.query(
      `insert into iluminate.publication_audit
         (client_id, actor_id, action, target_type, target_id, from_policy, metadata)
       values ($1, $2, 'scene_share.revoked', 'scene_share', $3, $4, '{}'::jsonb)`,
      [row.client_id, actorId, row.id, row.access_policy]
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function sceneShareUrl(policy: PlayerBundlePrivacy, slug: string) {
  if (policy === "private") return null;
  const variable = policy === "public" ? "ILUMINATE_PUBLIC_SITE_URL" : "ILUMINATE_APP_URL";
  const origin = process.env[variable]?.trim().replace(/\/$/, "");
  const path = policy === "public" ? `/share/${slug}` : `/review/${slug}`;
  return origin ? `${origin}${path}` : path;
}
