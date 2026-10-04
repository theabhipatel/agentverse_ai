import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { config } from '../../config/env.js';
import { logger } from '../logger/index.js';

/**
 * S3 compatible object storage. MinIO runs beside Postgres today; moving to AWS S3
 * or Cloudflare R2 later is an env change, because only the S3 protocol is used.
 */
let client: S3Client | null = null;
let bucketReady: Promise<void> | null = null;

function getClient(): S3Client {
  if (!config.storage.enabled) {
    throw new Error('File storage is not configured');
  }
  client ??= new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    // MinIO serves buckets as paths, not as subdomains.
    forcePathStyle: true,
  });
  return client;
}

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

/**
 * The bucket is created on first use rather than at boot, so the API still starts
 * while storage is coming up. A failed attempt is forgotten, so the next call retries.
 */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const s3 = getClient();
    try {
      await s3.send(new HeadBucketCommand({ Bucket: config.storage.bucket }));
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      await s3.send(new CreateBucketCommand({ Bucket: config.storage.bucket }));
      logger.info({ bucket: config.storage.bucket }, 'Storage bucket created');
    }
  })().catch((error: unknown) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await getClient().send(
    new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  await ensureBucket();
  const response = await getClient().send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }));
  if (!response.Body) {
    throw new Error(`Stored object ${key} has no body`);
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

/** Deleting something already gone is not an error: the goal state is reached either way. */
export async function deleteObject(key: string): Promise<void> {
  await ensureBucket();
  await getClient().send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }));
}
