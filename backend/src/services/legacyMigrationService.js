import { Batch } from '../models/Batch.js';
import { Institution } from '../models/Institution.js';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';
import { logger } from '../utils/logger.js';
import {
  MONTH_NAMES,
  calculateFreezeDateUtc,
  generateUniqueInviteCode,
  isValidInviteCode,
  normalizeGraduationMonth,
  normalizeGraduationYear,
  normalizeInviteCode,
} from './batchService.js';

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function buildInstitutionName(batch, institutionsById) {
  const existing = asTrimmedString(batch.institutionName);
  if (existing) return existing;

  const institutionId = batch.institutionId?.toString();
  if (!institutionId) return '';

  return asTrimmedString(institutionsById.get(institutionId));
}

function getLegacyBatchMeta(userBatchRows) {
  const byBatchId = new Map();
  const byUserId = new Map();

  for (const row of userBatchRows) {
    const batchId = row.batchId?.toString();
    const userId = row.userId?.toString();
    const joinedAt = toIso(row.createdAt) ?? new Date().toISOString();

    if (batchId) {
      if (!byBatchId.has(batchId)) {
        byBatchId.set(batchId, {
          memberCount: 0,
          firstUserId: null,
        });
      }

      const aggregate = byBatchId.get(batchId);
      aggregate.memberCount += 1;
      if (!aggregate.firstUserId && userId) {
        aggregate.firstUserId = userId;
      }
    }

    if (userId && batchId) {
      if (!byUserId.has(userId)) {
        byUserId.set(userId, []);
      }
      byUserId.get(userId).push({ batchId, joinedAt });
    }
  }

  return {
    byBatchId,
    byUserId,
  };
}

function buildUserBatchesFromLegacyRows(rows) {
  const seenBatchIds = new Set();
  const out = [];

  const sorted = [...rows].sort((left, right) => {
    return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
  });

  for (const row of sorted) {
    if (seenBatchIds.has(row.batchId)) continue;
    seenBatchIds.add(row.batchId);
    out.push({
      batchId: row.batchId,
      joinedAt: row.joinedAt,
    });
  }

  return out;
}

async function migrateBatchDocuments({ batches, institutionsById, legacyBatchMeta, now }) {
  let migratedCount = 0;
  let incompleteCount = 0;

  for (const rawBatch of batches) {
    const updates = {};
    const batchId = rawBatch._id?.toString();

    const institutionName = buildInstitutionName(rawBatch, institutionsById);
    if (institutionName && institutionName !== rawBatch.institutionName) {
      updates.institutionName = institutionName;
    }

    const parsedFreezeDate = parseDate(rawBatch.freezeDate);

    let graduationYear = normalizeGraduationYear(rawBatch.graduationYear);
    if (!graduationYear && parsedFreezeDate) {
      graduationYear = parsedFreezeDate.getUTCFullYear();
    }

    let graduationMonth = normalizeGraduationMonth(rawBatch.graduationMonth);
    if (!graduationMonth && parsedFreezeDate) {
      graduationMonth = MONTH_NAMES[parsedFreezeDate.getUTCMonth()] ?? null;
    }

    if (graduationYear && graduationYear !== rawBatch.graduationYear) {
      updates.graduationYear = graduationYear;
    }
    if (graduationMonth && graduationMonth !== rawBatch.graduationMonth) {
      updates.graduationMonth = graduationMonth;
    }

    let freezeDate = null;
    if (graduationYear && graduationMonth) {
      freezeDate = calculateFreezeDateUtc(graduationYear, graduationMonth);
    }
    if (!freezeDate && parsedFreezeDate) {
      freezeDate = parsedFreezeDate;
    }

    const freezeDateIso = toIso(freezeDate);
    if (freezeDateIso && freezeDateIso !== rawBatch.freezeDate) {
      updates.freezeDate = freezeDateIso;
    }

    let inviteCode = normalizeInviteCode(rawBatch.inviteCode);
    if (!isValidInviteCode(inviteCode)) {
      inviteCode = await generateUniqueInviteCode();
    }
    if (inviteCode && inviteCode !== rawBatch.inviteCode) {
      updates.inviteCode = inviteCode;
    }

    const meta = legacyBatchMeta.get(batchId);
    const memberCount = meta?.memberCount ?? Number(rawBatch.memberCount ?? 0);
    if (memberCount !== Number(rawBatch.memberCount ?? 0)) {
      updates.memberCount = memberCount;
    }

    if (!rawBatch.createdBy && meta?.firstUserId) {
      updates.createdBy = meta.firstUserId;
    }

    let shouldFreeze = Boolean(rawBatch.isFrozen);
    if (freezeDate && freezeDate.getTime() <= now.getTime()) {
      shouldFreeze = true;
    }

    if (shouldFreeze !== Boolean(rawBatch.isFrozen)) {
      updates.isFrozen = shouldFreeze;
    }

    if (!institutionName || !graduationYear || !graduationMonth) {
      incompleteCount += 1;
      logger.warn('Legacy batch has incomplete canonical data after migration pass', {
        batchId,
        institutionName: institutionName || null,
        graduationYear: graduationYear || null,
        graduationMonth: graduationMonth || null,
      });
    }

    if (Object.keys(updates).length === 0) {
      continue;
    }

    const mutableBatch = await Batch.findById(rawBatch._id);
    if (!mutableBatch) continue;

    Object.assign(mutableBatch, updates);
    await mutableBatch.save();
    migratedCount += 1;
  }

  return {
    migratedCount,
    incompleteCount,
  };
}

async function migrateUserMembershipArrays(legacyUsersMeta) {
  let usersUpdated = 0;
  let primaryFlagsUpdated = 0;

  for (const [userId, legacyRows] of legacyUsersMeta.entries()) {
    const user = await User.findById(userId);
    if (!user) {
      continue;
    }

    const legacyBatches = buildUserBatchesFromLegacyRows(legacyRows);

    let currentUserBatches = [];
    if (Array.isArray(user.batches)) {
      currentUserBatches = user.batches
        .map((entry) => ({
          batchId: entry?.batchId?.toString(),
          joinedAt: toIso(entry?.joinedAt) ?? new Date().toISOString(),
        }))
        .filter((entry) => Boolean(entry.batchId));
    }

    if (currentUserBatches.length === 0 && legacyBatches.length > 0) {
      user.batches = legacyBatches;
      await user.save();
      usersUpdated += 1;
      currentUserBatches = legacyBatches;
    }

    const currentBatchId =
      currentUserBatches[currentUserBatches.length - 1]?.batchId ||
      legacyBatches[legacyBatches.length - 1]?.batchId ||
      null;

    if (!currentBatchId) {
      continue;
    }

    const memberships = await UserBatch.find({ userId });
    for (const membership of memberships) {
      const shouldBePrimary = membership.batchId?.toString() === currentBatchId;
      if (Boolean(membership.isPrimary) === shouldBePrimary) {
        continue;
      }

      membership.isPrimary = shouldBePrimary;
      await membership.save();
      primaryFlagsUpdated += 1;
    }
  }

  return {
    usersUpdated,
    primaryFlagsUpdated,
  };
}

export async function migrateLegacyBatchData() {
  const now = new Date();

  const [institutions, batches, userBatchRows] = await Promise.all([
    Institution.find({}).lean(),
    Batch.find({}).lean(),
    UserBatch.find({}).sort({ createdAt: 1 }).lean(),
  ]);

  const institutionsById = new Map(
    institutions.map((institution) => [institution._id.toString(), institution.name]),
  );

  const legacyMeta = getLegacyBatchMeta(userBatchRows);

  const { migratedCount, incompleteCount } = await migrateBatchDocuments({
    batches,
    institutionsById,
    legacyBatchMeta: legacyMeta.byBatchId,
    now,
  });

  const { usersUpdated, primaryFlagsUpdated } = await migrateUserMembershipArrays(
    legacyMeta.byUserId,
  );

  logger.info('Legacy batch migration completed', {
    scannedBatches: batches.length,
    scannedInstitutions: institutions.length,
    scannedMemberships: userBatchRows.length,
    migratedBatches: migratedCount,
    incompleteBatches: incompleteCount,
    usersUpdated,
    primaryFlagsUpdated,
  });

  return {
    scannedBatches: batches.length,
    scannedInstitutions: institutions.length,
    scannedMemberships: userBatchRows.length,
    migratedBatches: migratedCount,
    incompleteBatches: incompleteCount,
    usersUpdated,
    primaryFlagsUpdated,
  };
}
