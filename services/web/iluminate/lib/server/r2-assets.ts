import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const signedUrlExpiresInSeconds = 5 * 60;

type R2Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type TenantAssetUpload = {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
};

function configuredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function r2Config(): R2Config {
  return {
    bucket: configuredValue("CLOUDFLARE_R2_BUCKET"),
    endpoint: configuredValue("CLOUDFLARE_R2_ENDPOINT"),
    region: process.env.CLOUDFLARE_R2_REGION?.trim() || "auto",
    accessKeyId: configuredValue("CLOUDFLARE_R2_ACCESS_KEY_ID"),
    secretAccessKey: configuredValue("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
  };
}

function r2Client(config = r2Config()): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
}

function validClientId(clientId: number): number {
  if (!Number.isSafeInteger(clientId) || clientId < 1) throw new Error("Invalid client id.");
  return clientId;
}

function safeFileName(fileName: string): string {
  const name = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return name || "artwork";
}

export function tenantAssetPrefix(clientId: number): string {
  return `clients/${validClientId(clientId)}/`;
}

export function tenantAssetKey(clientId: number, assetId: string, fileName: string): string {
  const safeAssetId = assetId.trim();
  if (!safeAssetId) throw new Error("Missing asset id.");
  return `${tenantAssetPrefix(clientId)}artwork/${safeAssetId}-${safeFileName(fileName)}`;
}

export async function createTenantArtworkUpload(
  clientId: number,
  assetId: string,
  fileName: string,
  contentType: string
): Promise<TenantAssetUpload> {
  const config = r2Config();
  const key = tenantAssetKey(clientId, assetId, fileName);
  const uploadUrl = await getSignedUrl(
    r2Client(config),
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: signedUrlExpiresInSeconds }
  );

  return { key, uploadUrl, expiresInSeconds: signedUrlExpiresInSeconds };
}

export async function uploadTenantArtwork(
  clientId: number,
  assetId: string,
  fileName: string,
  contentType: string,
  body: Uint8Array
): Promise<string> {
  const config = r2Config();
  const key = tenantAssetKey(clientId, assetId, fileName);
  await r2Client(config).send(new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType, Body: body }));
  return key;
}

export async function createTenantAssetReadUrl(clientId: number, key: string): Promise<string> {
  if (!key.startsWith(tenantAssetPrefix(clientId))) throw new Error("Asset key belongs to a different client.");
  const config = r2Config();
  return getSignedUrl(r2Client(config), new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
    expiresIn: signedUrlExpiresInSeconds
  });
}

export function keyFromTenantStorageUri(clientId: number, storageUri: string): string {
  const config = r2Config();
  const prefix = `r2://${config.bucket}/`;
  if (!storageUri.startsWith(prefix)) throw new Error("Asset storage URI is invalid.");
  const key = storageUri.slice(prefix.length);
  if (!key.startsWith(tenantAssetPrefix(clientId))) throw new Error("Asset key belongs to a different client.");
  return key;
}

export async function deleteTenantArtwork(clientId: number, key: string): Promise<void> {
  if (!key.startsWith(tenantAssetPrefix(clientId))) throw new Error("Asset key belongs to a different client.");
  const config = r2Config();
  await r2Client(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function deleteTenantAssets(clientId: number): Promise<number> {
  const config = r2Config();
  const client = r2Client(config);
  const prefix = tenantAssetPrefix(clientId);
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    const objects = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));

    if (objects.length > 0) {
      await client.send(new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: objects, Quiet: true } }));
      deleted += objects.length;
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
