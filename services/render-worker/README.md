# Iluminate render worker

The render worker turns an immutable `PlayerBundleV1` into an H.264 MP4 and a
WebP poster. It uses the dashboard's protected `/internal/render` harness, so
browser playback and offline video execute the same `partitura.v2`, scene clock,
WebGL2 renderer and shaders.

It is a queue consumer, not an HTTP service. PostgreSQL leases jobs to one
worker at a time with `FOR UPDATE SKIP LOCKED`; expired 20-minute leases are
reclaimable. A failed job is delayed and retried up to three times. More worker
containers can be added horizontally as long as each uses the same database,
buckets and internal token.

## Required configuration

The following variables are mandatory and the process exits immediately if one
is missing:

```text
ILUMINATE_DATABASE_URL
ILUMINATE_INTERNAL_TOKEN
ILUMINATE_RENDER_APP_ORIGIN
ILUMINATE_PUBLIC_MEDIA_ORIGIN
CLOUDFLARE_R2_ENDPOINT
CLOUDFLARE_R2_REGION
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_PRIVATE_RENDER_BUCKET
CLOUDFLARE_R2_PUBLIC_SHARE_BUCKET
CHROMIUM_EXECUTABLE_PATH
```

The Docker image sets `CHROMIUM_EXECUTABLE_PATH`. The private and public bucket
names must be different. Only the public-share bucket may be exposed through
`ILUMINATE_PUBLIC_MEDIA_ORIGIN`; never expose the private bucket or the existing
artwork bucket.

`ILUMINATE_INTERNAL_TOKEN` must be a long random secret shared only by the
dashboard and workers. It authorizes the internal render harness and must not be
available to either browser application.

## First deployment

1. Create separate private-render and public-share R2 buckets.
2. Put a CDN/custom domain in front of only the public-share bucket.
3. Apply
   `services/lighting-core/migrations/2026-10-07_create_scene_rendering_and_shares.sql`
   to the application database.
4. Configure the dashboard and worker with the same R2 credentials, bucket
   names and internal token.
5. Start the dashboard, then one render worker.
6. Create a private review share and verify that its media URL is signed and
   expires.
7. Create a public share with explicit rights confirmation and verify that
   `/share/{slug}` serves the CDN video without loading editor JavaScript.
8. Revoke both links and verify that the review route returns 404 and the public
   manifest is removed.

Build locally:

```bash
docker build -f services/render-worker/Dockerfile -t iluminate-render-worker:check .
```

Start through the development Compose stack only after all required variables
have real values:

```bash
docker compose up -d render-worker
docker compose logs -f --tail=100 render-worker
```

## Operations

Inspect queue health without printing bundle contents or credentials:

```sql
select status, count(*)
from iluminate.render_jobs
group by status
order by status;

select id, attempts, error_summary, updated_at
from iluminate.render_jobs
where status = 'failed'
order by updated_at desc
limit 20;
```

A growing `queued` count means capacity is insufficient or workers are down. A
growing `failed` count is an application/storage/render regression and must not
be solved by blindly resetting attempts. Diagnose the recorded summary, repair
the cause and request a new render through the application.

The worker writes temporary PNG frames only inside its container temp directory
and removes the directory after success or failure. MP4/poster files are stored
in R2. Private media uses `private, no-store`; public hash-addressed media uses
an immutable one-year cache. Revoking a public share removes its small share
manifest, but already copied public media cannot be made confidential again.

YouTube upload is intentionally outside this worker. It requires a separate,
explicitly authorized export flow because a customer review render must never
be published automatically.
