import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || '3000'),
  mongoUri: requireEnv('MONGODB_URI'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  frontendUrl: requireEnv('FRONTEND_URL'),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  aws: {
    region: requireEnv('AWS_REGION'),
    accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    s3Bucket: requireEnv('AWS_S3_BUCKET'),
  },
  s3: {
    presignedUploadExpiresSec: Number(
      process.env.S3_PRESIGNED_UPLOAD_EXPIRES_SEC || '120',
    ),
    signedReadExpiresSec: Number(
      process.env.S3_SIGNED_READ_EXPIRES_SEC || '900',
    ),
  },
  email: {
    host: requireEnv('EMAIL_HOST'),
    port: Number(process.env.EMAIL_PORT || '587'),
    user: requireEnv('EMAIL_USER'),
    pass: requireEnv('EMAIL_PASS'),
  },
};
