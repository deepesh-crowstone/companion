import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type BucketConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: BucketConfig | null = null;

function readConfig(): BucketConfig | null {
  const bucket = process.env.S3_BUCKET?.trim() || process.env.BUCKET?.trim();
  const endpoint =
    process.env.S3_ENDPOINT?.trim() || process.env.ENDPOINT?.trim();
  const region =
    process.env.S3_REGION?.trim() || process.env.REGION?.trim() || "auto";
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
    process.env.ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.SECRET_ACCESS_KEY?.trim();

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
}

export function isBucketConfigured(): boolean {
  return readConfig() !== null;
}

function getConfig(): BucketConfig {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "Object storage is not configured. Add a Railway Bucket and reference its credentials on the companion service.",
    );
  }
  return config;
}

function getClient(): S3Client {
  if (cachedClient && cachedConfig) return cachedClient;

  const config = getConfig();
  cachedConfig = config;
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });

  return cachedClient;
}

export function voiceObjectKey(filename: string): string {
  return filename.startsWith("voice/") ? filename : `voice/${filename}`;
}

export async function uploadVoiceObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const config = getConfig();
  const objectKey = voiceObjectKey(key);

  await getClient().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );

  return objectKey;
}

export async function getPresignedVoiceUrl(storedKey: string): Promise<string> {
  const config = getConfig();
  const objectKey = voiceObjectKey(storedKey);

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
    { expiresIn: PRESIGN_TTL_SECONDS },
  );
}

export async function checkBucketConnection(): Promise<boolean> {
  if (!isBucketConfigured()) return false;
  try {
    const config = getConfig();
    await getClient().send(new HeadBucketCommand({ Bucket: config.bucket }));
    return true;
  } catch {
    return false;
  }
}
