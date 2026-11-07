import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const env = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}.`); return value; };
const config = () => ({ bucket: env("CLOUDFLARE_R2_BUCKET"), endpoint: env("CLOUDFLARE_R2_ENDPOINT"), region: process.env.CLOUDFLARE_R2_REGION?.trim() || "auto", accessKeyId: env("CLOUDFLARE_R2_ACCESS_KEY_ID"), secretAccessKey: env("CLOUDFLARE_R2_SECRET_ACCESS_KEY") });
const client = (value = config()) => new S3Client({ endpoint: value.endpoint, region: value.region, forcePathStyle: true, credentials: { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey } });
const prefix = (clientId: string, projectId: string, jobId: string) => `clients/${clientId}/3d-models/${projectId}/${jobId}/`;

export async function uploadThreeDSource(clientId: string, projectId: string, jobId: string, body: Uint8Array) {
  const value = config();
  const key = `${prefix(clientId, projectId, jobId)}source.svg`;
  await client(value).send(new PutObjectCommand({ Bucket: value.bucket, Key: key, Body: body, ContentType: "image/svg+xml" }));
  return key;
}

export async function deleteThreeDSource(clientId: string, projectId: string, jobId: string) {
  const value = config();
  await client(value).send(new DeleteObjectCommand({ Bucket: value.bucket, Key: `${prefix(clientId, projectId, jobId)}source.svg` }));
}

export async function deleteThreeDArtifacts(clientId: string, projectId: string, jobId: string) {
  const value = config();
  const storage = client(value);
  for (const artifact of ["source.svg", "model.step", "model.3mf", "model.stl", "manifest.json"]) {
    await storage.send(new DeleteObjectCommand({ Bucket: value.bucket, Key: `${prefix(clientId, projectId, jobId)}${artifact}` }));
  }
}

export async function createThreeDDownloadUrl(clientId: string, projectId: string, jobId: string, artifact: string) {
  if (!["model.step", "model.3mf", "model.stl", "manifest.json"].includes(artifact)) throw new Error("Unsupported 3D artifact.");
  const value = config();
  return getSignedUrl(client(value), new GetObjectCommand({ Bucket: value.bucket, Key: `${prefix(clientId, projectId, jobId)}${artifact}`, ResponseContentDisposition: `attachment; filename="${artifact}"` }), { expiresIn: 300 });
}

export async function readThreeDViewArtifact(clientId: string, projectId: string, jobId: string, artifact: string) {
  if (!["model.3mf", "model.stl"].includes(artifact)) throw new Error("Unsupported 3D view artifact.");
  const value = config();
  const result = await client(value).send(new GetObjectCommand({ Bucket: value.bucket, Key: `${prefix(clientId, projectId, jobId)}${artifact}` }));
  const contentLength = result.ContentLength;
  if (!result.Body || contentLength === undefined || contentLength <= 0 || contentLength > 64 * 1024 * 1024) throw new Error("The 3D view artifact is unavailable or too large.");
  return {
    body: result.Body.transformToWebStream(),
    contentLength,
    contentType: artifact.endsWith(".3mf") ? "model/3mf" : "model/stl"
  };
}
