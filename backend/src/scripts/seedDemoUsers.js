import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { Institution } from '../models/Institution.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';

dotenv.config();

const DEMO_USERS = [
  { index: 0, fullName: 'Emily Johnson' },
  { index: 1, fullName: 'Michael Carter' },
  { index: 2, fullName: 'Daniel Brooks' },
  { index: 3, fullName: 'James Miller' },
  { index: 4, fullName: 'Sarah Thompson' },
  { index: 5, fullName: 'Christopher Adams' },
  { index: 6, fullName: 'Jessica Williams' },
  { index: 7, fullName: 'Andrew Wilson' },
  { index: 8, fullName: 'Matthew Harris' },
  { index: 9, fullName: 'Joshua Anderson' },
  { index: 10, fullName: 'David Clark' },
  { index: 11, fullName: 'Ryan Lewis' },
  { index: 12, fullName: 'Nicholas Walker' },
  { index: 13, fullName: 'Olivia Martinez' },
  { index: 14, fullName: 'Amanda Brown' },
  { index: 15, fullName: 'Lauren Davis' },
  { index: 16, fullName: 'Meghan Fox' },
];

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const CONTENT_TYPE_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getArgValue(name) {
  const args = process.argv.slice(2);
  const arg = args.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return null;
  return arg.slice(name.length + 1).trim();
}

async function fileExists(absolutePath) {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function findImagePath(imagesDir, index) {
  const files = await fs.readdir(imagesDir);
  const expectedBase = String(index);
  const byPriority = new Map(IMAGE_EXTENSIONS.map((ext, i) => [ext, i]));

  const candidates = files
    .map((fileName) => {
      const parsed = path.parse(fileName);
      return {
        fileName,
        base: parsed.name.trim(),
        ext: parsed.ext.toLowerCase(),
      };
    })
    .filter(
      (entry) => entry.base === expectedBase && IMAGE_EXTENSIONS.includes(entry.ext),
    )
    .sort((a, b) => (byPriority.get(a.ext) ?? 99) - (byPriority.get(b.ext) ?? 99));

  for (const candidate of candidates) {
    const absolutePath = path.join(imagesDir, candidate.fileName);
    if (await fileExists(absolutePath)) {
      return { absolutePath, ext: candidate.ext };
    }
  }
  return null;
}

function makeEmail(fullName) {
  const firstName = fullName.split(' ')[0].toLowerCase();
  return `${firstName}@gmail.com`;
}

function endOfMonth(year, month) {
  return new Date(year, month, 0);
}

async function uploadProfileImageToS3({
  s3Client,
  bucket,
  userId,
  absolutePath,
  ext,
}) {
  const key = `profiles/${userId}/avatar`;
  const body = await fs.readFile(absolutePath);
  const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return key;
}

async function resolveTargetBatch() {
  const institution = await Institution.findOne({}).sort({ createdAt: 1 });
  if (!institution) {
    throw new Error('No institution found. Please create one institution first.');
  }

  let batch = await Batch.findOne({ institutionId: institution._id }).sort({ createdAt: -1 });

  if (!batch) {
    const year = Number(process.env.DEMO_BATCH_YEAR || '2030');
    const month = Number(process.env.DEMO_BATCH_MONTH || '6');
    batch = await Batch.create({
      institutionId: institution._id,
      graduationYear: year,
      graduationMonth: month,
      freezeDate: endOfMonth(year, month),
      isFrozen: false,
    });
    console.log(
      `Created batch ${batch._id} for institution "${institution.name}" (${year}-${month}).`,
    );
  }

  return { institution, batch };
}

async function main() {
  const imagesDir =
    getArgValue('--images-dir') ||
    process.env.DEMO_IMAGES_DIR ||
    '/Users/gaurav/Documents/Professional/IT/Others/Garbage/Photos';

  const awsRegion = requireEnv('AWS_REGION');
  const awsAccessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
  const awsBucket = requireEnv('AWS_S3_BUCKET');

  const s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  console.log('Using DynamoDB via configured AWS credentials.');

  const { institution, batch } = await resolveTargetBatch();
  const passwordHash = await bcrypt.hash('123123', 10);

  let createdCount = 0;
  let updatedCount = 0;
  let uploadedCount = 0;

  for (const demoUser of DEMO_USERS) {
    const email = makeEmail(demoUser.fullName);

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        passwordHash,
        fullName: demoUser.fullName,
        isVerified: true,
        isActive: true,
      });
      createdCount += 1;
    } else {
      user.fullName = demoUser.fullName;
      user.passwordHash = passwordHash;
      user.isVerified = true;
      user.isActive = true;
      await user.save();
      updatedCount += 1;
    }

    const imageMatch = await findImagePath(imagesDir, demoUser.index);
    if (!imageMatch) {
      console.warn(
        `No image found for index ${demoUser.index}. Expected files like ${demoUser.index}.png/.jpg/.jpeg/.webp`,
      );
    } else {
      const profilePictureKey = await uploadProfileImageToS3({
        s3Client,
        bucket: awsBucket,
        userId: user._id.toString(),
        absolutePath: imageMatch.absolutePath,
        ext: imageMatch.ext,
      });
      user.profilePictureKey = profilePictureKey;
      await user.save();
      uploadedCount += 1;
    }

    const memberships = await UserBatch.find({ userId: user._id });
    for (const membership of memberships) {
      if (membership.batchId !== batch._id && membership.isPrimary) {
        membership.isPrimary = false;
        await membership.save();
      }
    }

    await UserBatch.findOneAndUpdate(
      { userId: user._id, batchId: batch._id },
      { isPrimary: true },
      { upsert: true },
    );
  }

  console.log('--- Demo seeding complete ---');
  console.log(`Institution: ${institution.name} (${institution._id})`);
  console.log(`Batch: ${batch._id}`);
  console.log(`Users created: ${createdCount}`);
  console.log(`Users updated: ${updatedCount}`);
  console.log(`Profile images uploaded: ${uploadedCount}`);
}

main()
  .catch((err) => {
    console.error('Failed to seed demo users:', err);
    process.exitCode = 1;
  });
