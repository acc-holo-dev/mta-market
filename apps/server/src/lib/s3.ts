// S3 client for production file storage
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import path from "path";

const S3_ENABLED = process.env.S3_ENABLED === "true";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
const S3_ENDPOINT = process.env.S3_ENDPOINT; // For Cloudflare R2

let s3Client: S3Client | null = null;

if (S3_ENABLED) {
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
    ...(S3_ENDPOINT && { endpoint: S3_ENDPOINT }),
  });
}

export interface UploadToS3Options {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}

export async function uploadToS3(options: UploadToS3Options): Promise<string> {
  if (!s3Client) {
    throw new Error("S3 is not enabled");
  }

  const { buffer, originalName, mimeType, folder = "resources" } = options;

  const ext = path.extname(originalName);
  const key = `${folder}/${crypto.randomBytes(16).toString("hex")}${ext}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  return key;
}

export async function deleteFromS3(key: string): Promise<void> {
  if (!s3Client) {
    throw new Error("S3 is not enabled");
  }

  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

export async function getS3DownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!s3Client) {
    throw new Error("S3 is not enabled");
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command as any, { expiresIn });
}

export function getS3PublicUrl(key: string): string {
  if (S3_ENDPOINT) {
    // Cloudflare R2 or custom endpoint
    return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

export { S3_ENABLED };
