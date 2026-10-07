import "server-only";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { BuiltPlayerBundle, PlayerBundlePrivacy } from "@/lib/lighting/player-bundle-builder";

const privateUrlExpiresInSeconds = 5 * 60;

type RenderStorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  publicMediaOrigin: string;
};

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function config(): RenderStorageConfig {
  return {
    endpoint: configuredValue("CLOUDFLARE_R2_ENDPOINT"),
    region: process.env.CLOUDFLARE_R2_REGION?.trim() || "auto",
    accessKeyId: configuredValue("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: configuredValue("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    privateBucket: configuredValue("CLOUDFLARE_R2_PRIVATE_RENDER_BUCKET"),
    publicBucket: configuredValue("CLOUDFLARE_R2_PUBLIC_SHARE_BUCKET"),
    publicMediaOrigin: configuredValue("ILUMINATE_PUBLIC_MEDIA_ORIGIN").replace(/\/$/, "")
  };
}

function client(storage = config()) {
  return new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey }
  });
}

export function bundlePrefix(bundleHash: string) {
  if (!/^sha256:[0-9a-f]{64}$/.test(bundleHash)) throw new Error("Invalid player bundle hash.");
  return `bundles/${bundleHash.slice("sha256:".length)}/`;
}

export async function uploadPlayerBundle(bundle: BuiltPlayerBundle, privacy: PlayerBundlePrivacy) {
  const storage = config();
  const bucket = privacy === "public" ? storage.publicBucket : storage.privateBucket;
  const r2 = client(storage);
  const prefix = bundlePrefix(bundle.manifest.bundleHash);
  await Promise.all(Array.from(bundle.files, async ([path, file]) => {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}${path}`,
      Body: file.bytes,
      ContentType: file.mediaType,
      CacheControl: privacy === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      Metadata: { checksum: file.checksum.slice("sha256:".length) }
    }));
  }));
  return {
    bucket,
    prefix,
    manifestKey: `${prefix}manifest.json`,
    manifestUrl: privacy === "public" ? `${storage.publicMediaOrigin}/${prefix}manifest.json` : null
  };
}

export async function createPrivateBundleUrl(bundleHash: string) {
  const storage = config();
  const key = `${bundlePrefix(bundleHash)}manifest.json`;
  return getSignedUrl(client(storage), new GetObjectCommand({ Bucket: storage.privateBucket, Key: key }), {
    expiresIn: privateUrlExpiresInSeconds
  });
}

export async function createPrivateMediaUrl(objectKey: string) {
  if (!objectKey || objectKey.startsWith("/") || objectKey.includes("..") || objectKey.includes(":")) {
    throw new Error("Invalid private render object key.");
  }
  const storage = config();
  return getSignedUrl(client(storage), new GetObjectCommand({ Bucket: storage.privateBucket, Key: objectKey }), {
    expiresIn: privateUrlExpiresInSeconds
  });
}

export async function deletePublicShareManifest(slug: string) {
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(slug)) throw new Error("Invalid scene share slug.");
  const storage = config();
  await client(storage).send(new DeleteObjectCommand({
    Bucket: storage.publicBucket,
    Key: `shares/${slug}/manifest.json`
  }));
}
