import crypto from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const s3Client = new S3Client({
  region: env.aws.region,
});

function getFileExtension(contentType) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const extByType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };

  return extByType[type] ?? '';
}

export function buildProfileObjectKey(userId) {
  return `profiles/${userId}/avatar`;
}

export function buildMemoryObjectKey(userId, contentType) {
  const now = Date.now();
  const randomPart = crypto.randomBytes(8).toString('hex');
  const ext = getFileExtension(contentType);
  return `memories/${userId}/${now}_${randomPart}${ext}`;
}

export function isProfileObjectKeyForUser(key, userId) {
  return key === buildProfileObjectKey(userId);
}

export function isMemoryObjectKeyForUser(key, userId) {
  return key.startsWith(`memories/${userId}/`);
}

export async function createPresignedUpload({
  key,
  contentType,
  expiresSec = env.s3.presignedUploadExpiresSec,
}) {
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: env.aws.s3Bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresSec },
  );

  return {
    uploadUrl,
    expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
    requiredHeaders: {
      'Content-Type': contentType,
    },
  };
}

export async function createSignedReadUrl({
  key,
  expiresSec = env.s3.signedReadExpiresSec,
}) {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: env.aws.s3Bucket,
      Key: key,
    }),
    { expiresIn: expiresSec },
  );
}

export async function headObject({ key }) {
  const response = await s3Client.send(
    new HeadObjectCommand({
      Bucket: env.aws.s3Bucket,
      Key: key,
    }),
  );

  return {
    contentType: response.ContentType ?? null,
    contentLength: response.ContentLength ?? null,
  };
}

export async function deleteObject(key) {
  if (!key) return;

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.aws.s3Bucket,
      Key: key,
    }),
  );
}

export function isS3NotFoundError(err) {
  const status = err?.$metadata?.httpStatusCode;
  return (
    status === 404 ||
    err?.name === 'NotFound' ||
    err?.name === 'NoSuchKey' ||
    err?.Code === 'NotFound' ||
    err?.Code === 'NoSuchKey'
  );
}
