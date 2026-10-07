import "server-only";

import { getPool } from "@/lib/server/postgres";
import { createPrivateMediaUrl } from "@/lib/server/r2-render-artifacts";

export type SceneShareViewer = {
  title: string;
  policy: "review" | "unlisted";
  status: "pending" | "rendering" | "ready" | "failed" | "cancelled";
  errorSummary: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export async function getSceneShareViewer(slug: string): Promise<SceneShareViewer | null> {
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(slug)) return null;
  const result = await getPool().query<{
    title: string;
    access_policy: SceneShareViewer["policy"];
    status: SceneShareViewer["status"];
    error_summary: string | null;
    video_object_key: string | null;
    poster_object_key: string | null;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
  }>(
    `select p.name as title, s.access_policy, a.status, a.error_summary,
            a.video_object_key, a.poster_object_key, a.width, a.height, a.duration_ms
       from iluminate.scene_shares s
       join iluminate.render_artifacts a on a.id = s.artifact_id and a.client_id = s.client_id
       join iluminate.partituras p on p.id = s.partitura_id and p.client_id = s.client_id
      where s.opaque_slug = $1
        and s.access_policy in ('review', 'unlisted')
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
      limit 1`,
    [slug]
  );
  const row = result.rows[0];
  if (!row) return null;
  const [videoUrl, posterUrl] = row.status === "ready" && row.video_object_key && row.poster_object_key
    ? await Promise.all([createPrivateMediaUrl(row.video_object_key), createPrivateMediaUrl(row.poster_object_key)])
    : [null, null];
  return {
    title: row.title,
    policy: row.access_policy,
    status: row.status,
    errorSummary: row.error_summary,
    videoUrl,
    posterUrl,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms
  };
}
