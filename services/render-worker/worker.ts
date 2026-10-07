import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawn } from "node:child_process";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { chromium } from "playwright-core";
import { Pool } from "pg";

type Job = {
  id: string;
  artifactId: string;
  clientId: string;
  bundleHash: string;
  profile: string;
  privacy: "private" | "review" | "unlisted" | "public";
  bundleObjectKey: string;
  title: string;
};

type BundleManifest = {
  bundleHash: string;
  defaultScene: string;
  scenes: Array<{ id: string; durationMs: number }>;
  assets: { partitura: { path: string }; visualScene: { path: string }; textures: Array<{ path: string }> };
};

const databaseUrl = required("ILUMINATE_DATABASE_URL");
const internalToken = required("ILUMINATE_INTERNAL_TOKEN");
const renderAppOrigin = required("ILUMINATE_RENDER_APP_ORIGIN").replace(/\/$/, "");
const publicMediaOrigin = required("ILUMINATE_PUBLIC_MEDIA_ORIGIN").replace(/\/$/, "");
const privateBucket = required("CLOUDFLARE_R2_PRIVATE_RENDER_BUCKET");
const publicBucket = required("CLOUDFLARE_R2_PUBLIC_SHARE_BUCKET");
const leaseOwner = `render-worker-${process.pid}`;
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const r2 = new S3Client({
  endpoint: required("CLOUDFLARE_R2_ENDPOINT"),
  region: process.env.CLOUDFLARE_R2_REGION?.trim() || "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: required("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
  }
});

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

void run().catch((error) => {
  console.error("render worker stopped", error);
  process.exitCode = 1;
});

async function run() {
  while (!stopping) {
    const job = await claimJob();
    if (!job) {
      await delay(2_000);
      continue;
    }
    try {
      await renderJob(job);
      await completeJob(job);
    } catch (error) {
      await failJob(job, error instanceof Error ? error.message : String(error));
    }
  }
  await pool.end();
}

async function claimJob(): Promise<Job | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      id: string; artifact_id: string; client_id: string; bundle_hash: string; profile: string;
      privacy: Job["privacy"]; bundle_object_key: string; title: string;
    }>(
      `select j.id, j.artifact_id, j.client_id, j.bundle_hash, j.profile,
              a.privacy, a.bundle_object_key, p.name as title
         from iluminate.render_jobs j
         join iluminate.render_artifacts a on a.id = j.artifact_id and a.client_id = j.client_id
         join iluminate.scene_shares s on s.artifact_id = a.id and s.client_id = a.client_id and s.revoked_at is null
         join iluminate.partituras p on p.id = s.partitura_id and p.client_id = s.client_id
        where j.attempts < 3
          and (
            (j.status = 'queued' and j.available_at <= now())
            or (j.status = 'running' and j.lease_expires_at < now())
          )
        order by j.created_at
        for update of j skip locked
        limit 1`
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("commit");
      return null;
    }
    await client.query(
      `update iluminate.render_jobs
          set status = 'running', attempts = attempts + 1, lease_owner = $2,
              lease_expires_at = now() + interval '20 minutes', updated_at = now()
        where id = $1`,
      [row.id, leaseOwner]
    );
    await client.query("update iluminate.render_artifacts set status = 'rendering', updated_at = now() where id = $1", [row.artifact_id]);
    await client.query("commit");
    return {
      id: String(row.id), artifactId: String(row.artifact_id), clientId: String(row.client_id),
      bundleHash: row.bundle_hash, profile: row.profile, privacy: row.privacy,
      bundleObjectKey: row.bundle_object_key, title: row.title
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function renderJob(job: Job) {
  const profile = job.profile === "review-720p30" ? { width: 1280, height: 720, fps: 30 } : { width: 1920, height: 1080, fps: 30 };
  const sourceBucket = job.privacy === "public" ? publicBucket : privateBucket;
  const prefix = job.bundleObjectKey.slice(0, -basename(job.bundleObjectKey).length);
  const manifestBytes = await getObject(sourceBucket, job.bundleObjectKey);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as BundleManifest;
  if (manifest.bundleHash !== job.bundleHash) throw new Error("Bundle hash does not match the render job.");
  const scene = manifest.scenes.find((entry) => entry.id === manifest.defaultScene);
  if (!scene || scene.durationMs <= 0) throw new Error("Bundle default scene is invalid.");

  const workspace = await mkdtemp(join(tmpdir(), "iluminate-render-"));
  let server: Server | null = null;
  try {
    const bundleDir = join(workspace, "bundle");
    await mkdir(bundleDir);
    await writeFile(join(workspace, "manifest.json"), manifestBytes);
    const assetPaths = [manifest.assets.partitura.path, manifest.assets.visualScene.path, ...manifest.assets.textures.map((asset) => asset.path)];
    await Promise.all(assetPaths.map(async (path) => {
      if (path.includes("..") || path.startsWith("/") || path.includes(":")) throw new Error("Unsafe bundle asset path.");
      const bytes = await getObject(sourceBucket, `${prefix}${path}`);
      const target = join(bundleDir, basename(path));
      await writeFile(target, bytes);
    }));
    const localManifest = {
      ...manifest,
      assets: {
        ...manifest.assets,
        partitura: { ...manifest.assets.partitura, path: `bundle/${basename(manifest.assets.partitura.path)}` },
        visualScene: { ...manifest.assets.visualScene, path: `bundle/${basename(manifest.assets.visualScene.path)}` },
        textures: manifest.assets.textures.map((asset) => ({ ...asset, path: `bundle/${basename(asset.path)}` }))
      }
    };
    await writeFile(join(workspace, "manifest.json"), JSON.stringify(localManifest));
    const served = await serveWorkspace(workspace);
    server = served.server;

    const browser = await chromium.launch({ executablePath: required("CHROMIUM_EXECUTABLE_PATH"), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    try {
      const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1 });
      await page.setExtraHTTPHeaders({ Authorization: `Bearer ${internalToken}` });
      const bundleUrl = `http://127.0.0.1:${served.port}/manifest.json`;
      await page.goto(`${renderAppOrigin}/internal/render?bundle=${encodeURIComponent(bundleUrl)}&width=${profile.width}&height=${profile.height}`, { waitUntil: "networkidle" });
      await page.waitForFunction(
        () => document.documentElement.dataset.renderReady === "true" || Boolean(document.documentElement.dataset.renderError),
        undefined,
        { timeout: 60_000 }
      );
      const harnessError = await page.evaluate(() => document.documentElement.dataset.renderError ?? null);
      if (harnessError) throw new Error(`Render harness failed: ${harnessError}`);
      const canvas = page.locator("canvas");
      const frameCount = Math.ceil(scene.durationMs / 1000 * profile.fps);
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const timeMs = frameIndex * 1000 / profile.fps;
        await page.evaluate(async ({ sceneId, frameTime }) => {
          const harness = (window as typeof window & { __ILUMINATE_RENDER__?: { render(id: string, time: number): Promise<void> } }).__ILUMINATE_RENDER__;
          if (!harness) throw new Error("Render harness is unavailable.");
          await harness.render(sceneId, frameTime);
        }, { sceneId: scene.id, frameTime: timeMs });
        await canvas.screenshot({ path: join(workspace, `frame-${String(frameIndex).padStart(6, "0")}.png`), type: "png" });
      }
    } finally {
      await browser.close();
    }

    const videoPath = join(workspace, "scene.mp4");
    const posterPath = join(workspace, "poster.webp");
    await command("ffmpeg", ["-y", "-framerate", String(profile.fps), "-i", join(workspace, "frame-%06d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-preset", "medium", "-crf", "20", videoPath]);
    await command("ffmpeg", ["-y", "-i", videoPath, "-frames:v", "1", "-c:v", "libwebp", "-quality", "86", posterPath]);
    const video = await readFile(videoPath);
    const poster = await readFile(posterPath);
    const mediaPrefix = `media/${job.bundleHash.slice("sha256:".length)}/${job.profile}/`;
    const destinationBucket = job.privacy === "public" ? publicBucket : privateBucket;
    const mediaCache = job.privacy === "public" ? "public, max-age=31536000, immutable" : "private, no-store";
    await putObject(destinationBucket, `${mediaPrefix}scene.mp4`, "video/mp4", video, mediaCache);
    await putObject(destinationBucket, `${mediaPrefix}poster.webp`, "image/webp", poster, mediaCache);
    await pool.query(
      `update iluminate.render_artifacts
          set video_object_key = $2, poster_object_key = $3, width = $4, height = $5,
              duration_ms = $6, video_checksum = $7, poster_checksum = $8, updated_at = now()
        where id = $1 and client_id = $9`,
      [
        job.artifactId,
        `${mediaPrefix}scene.mp4`,
        `${mediaPrefix}poster.webp`,
        profile.width,
        profile.height,
        scene.durationMs,
        checksum(video),
        checksum(poster),
        job.clientId
      ]
    );
    if (job.privacy === "public") await publishShareManifests(job, profile, scene.durationMs, mediaPrefix);
  } finally {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    await rm(workspace, { recursive: true, force: true });
  }
}

async function publishShareManifests(job: Job, profile: { width: number; height: number }, durationMs: number, mediaPrefix: string) {
  const shares = await pool.query<{ opaque_slug: string }>(
    "select opaque_slug from iluminate.scene_shares where artifact_id = $1 and access_policy = 'public' and revoked_at is null",
    [job.artifactId]
  );
  for (const { opaque_slug } of shares.rows) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const active = await client.query(
        "select 1 from iluminate.scene_shares where opaque_slug = $1 and artifact_id = $2 and access_policy = 'public' and revoked_at is null for update",
        [opaque_slug, job.artifactId]
      );
      if (active.rowCount) {
        await putObject(
          publicBucket,
          `shares/${opaque_slug}/manifest.json`,
          "application/json",
          Buffer.from(JSON.stringify({
            version: "scene-share.v1",
            slug: opaque_slug,
            title: job.title,
            policy: "public",
            videoUrl: `${publicMediaOrigin}/${mediaPrefix}scene.mp4`,
            posterUrl: `${publicMediaOrigin}/${mediaPrefix}poster.webp`,
            width: profile.width,
            height: profile.height,
            durationMs
          })),
          "public, max-age=60, s-maxage=60, must-revalidate"
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function completeJob(job: Job) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "update iluminate.render_jobs set status = 'complete', lease_owner = null, lease_expires_at = null, error_summary = null, updated_at = now() where id = $1 and lease_owner = $2",
      [job.id, leaseOwner]
    );
    await client.query("update iluminate.render_artifacts set status = 'ready', error_summary = null, updated_at = now() where id = $1", [job.artifactId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function failJob(job: Job, message: string) {
  const summary = message.slice(0, 2_000);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const failed = await client.query<{ status: "queued" | "failed" }>(
      `update iluminate.render_jobs
          set status = case when attempts < 3 then 'queued' else 'failed' end,
              available_at = case when attempts < 3 then now() + interval '30 seconds' else available_at end,
              lease_owner = null, lease_expires_at = null, error_summary = $2, updated_at = now()
        where id = $1 and lease_owner = $3
        returning status`,
      [job.id, summary, leaseOwner]
    );
    const artifactStatus = failed.rows[0]?.status === "failed" ? "failed" : "pending";
    await client.query(
      "update iluminate.render_artifacts set status = $2, error_summary = $3, updated_at = now() where id = $1",
      [job.artifactId, artifactStatus, summary]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  console.error(`render job ${job.id} failed`, summary);
}

async function getObject(bucket: string, key: string) {
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`R2 object ${key} has no body.`);
  return Buffer.from(await response.Body.transformToByteArray());
}

async function putObject(bucket: string, key: string, contentType: string, body: Uint8Array, cacheControl: string) {
  await r2.send(new PutObjectCommand({
    Bucket: bucket, Key: key, ContentType: contentType, Body: body,
    CacheControl: cacheControl
  }));
}

async function serveWorkspace(root: string): Promise<{ server: Server; port: number }> {
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      const file = path === "/manifest.json" ? join(root, "manifest.json") : join(root, "bundle", basename(path));
      const bytes = await readFile(file);
      response.setHeader("Content-Type", contentType(extname(file)));
      response.end(bytes);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to start bundle server.");
  return { server, port: address.port };
}

function contentType(extension: string) {
  if (extension === ".json") return "application/json";
  if (extension === ".bin") return "application/octet-stream";
  if (extension === ".png") return "image/png";
  return "application/octet-stream";
}

function checksum(bytes: Uint8Array) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function command(executable: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => { errorOutput = `${errorOutput}${String(chunk)}`.slice(-8_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}: ${errorOutput}`)));
  });
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
