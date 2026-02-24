import crypto from 'crypto';

import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const INVITE_CODE_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const INVITE_CODE_LENGTH = 7;
const MONTH_TO_NUMBER = new Map(
  MONTH_NAMES.map((name, index) => [name.toLowerCase(), index + 1]),
);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeYear(yearInput) {
  const year = Number(yearInput);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
  }
  return year;
}

function toBatchIdString(value) {
  if (!value) return '';
  return value.toString();
}

function parseNumericMonth(value) {
  const monthNumber = Number(value);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  return MONTH_NAMES[monthNumber - 1];
}

export function normalizeGraduationMonth(monthInput) {
  if (typeof monthInput === 'number') {
    return parseNumericMonth(monthInput);
  }

  const raw = normalizeString(monthInput);
  if (!raw) return null;

  if (/^\d{1,2}$/.test(raw)) {
    return parseNumericMonth(Number(raw));
  }

  const direct = MONTH_TO_NUMBER.get(raw.toLowerCase());
  if (direct) {
    return MONTH_NAMES[direct - 1];
  }

  const fromPrefix = MONTH_NAMES.find((monthName) =>
    monthName.toLowerCase().startsWith(raw.toLowerCase()),
  );

  return fromPrefix ?? null;
}

export function getMonthNumber(monthInput) {
  const normalized = normalizeGraduationMonth(monthInput);
  if (!normalized) return null;
  return MONTH_TO_NUMBER.get(normalized.toLowerCase()) ?? null;
}

export function calculateFreezeDateUtc(yearInput, monthInput) {
  const graduationYear = normalizeYear(yearInput);
  const graduationMonthNumber = getMonthNumber(monthInput);

  if (!graduationYear || !graduationMonthNumber) {
    return null;
  }

  return new Date(
    Date.UTC(graduationYear, graduationMonthNumber, 0, 23, 59, 59, 0),
  );
}

export function normalizeInviteCode(inviteCode) {
  return normalizeString(inviteCode).toLowerCase();
}

export function isValidInviteCode(inviteCode) {
  return /^[a-z0-9]{7}$/i.test(normalizeString(inviteCode));
}

function randomInviteCode(length = INVITE_CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = '';

  for (let i = 0; i < length; i += 1) {
    out += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
  }

  return out;
}

export async function generateUniqueInviteCode() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = randomInviteCode();
    // Stored in lowercase so matching is case-insensitive.
    const exists = await Batch.exists({ inviteCode: candidate });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique invite code');
}

export function normalizeInstitutionForComparison(name) {
  return normalizeString(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function levenshteinDistance(a, b) {
  const source = normalizeInstitutionForComparison(a);
  const target = normalizeInstitutionForComparison(b);

  if (!source) return target.length;
  if (!target) return source.length;

  const matrix = Array.from({ length: source.length + 1 }, () =>
    new Array(target.length + 1).fill(0),
  );

  for (let row = 0; row <= source.length; row += 1) matrix[row][0] = row;
  for (let col = 0; col <= target.length; col += 1) matrix[0][col] = col;

  for (let row = 1; row <= source.length; row += 1) {
    for (let col = 1; col <= target.length; col += 1) {
      const cost = source[row - 1] === target[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[source.length][target.length];
}

export function isCloseInstitutionMatch(leftName, rightName) {
  const left = normalizeInstitutionForComparison(leftName);
  const right = normalizeInstitutionForComparison(rightName);

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return levenshteinDistance(left, right) <= 2;
}

export function buildBatchResponse(batch, options = {}) {
  if (!batch) return null;

  const includeInviteCode = options.includeInviteCode === true;

  return {
    id: batch._id,
    institution_name: batch.institutionName,
    graduation_year: batch.graduationYear,
    graduation_month: batch.graduationMonth,
    freeze_date: batch.freezeDate ?? null,
    member_count: Number(batch.memberCount ?? 0),
    is_frozen: Boolean(batch.isFrozen),
    ...(includeInviteCode ? { invite_code: batch.inviteCode } : {}),
  };
}

function extractUserBatches(user) {
  if (!user || !Array.isArray(user.batches)) {
    return [];
  }

  return user.batches
    .map((entry) => ({
      batchId: toBatchIdString(entry?.batchId),
      joinedAt: entry?.joinedAt ? new Date(entry.joinedAt).toISOString() : null,
    }))
    .filter((entry) => entry.batchId);
}

async function hydrateUserBatchesFromLegacy(user) {
  const memberships = await UserBatch.find({ userId: user._id })
    .sort({ createdAt: 1 })
    .lean();

  if (memberships.length === 0) {
    user.batches = [];
    await user.save();
    return [];
  }

  const batches = memberships.map((entry) => ({
    batchId: entry.batchId,
    joinedAt: entry.createdAt ?? new Date().toISOString(),
  }));

  user.batches = batches;
  await user.save();
  return extractUserBatches(user);
}

export async function getUserBatchEntries(user) {
  if (!user) return [];

  const direct = extractUserBatches(user);
  if (direct.length > 0) {
    return direct;
  }

  if (!Array.isArray(user.batches)) {
    return hydrateUserBatchesFromLegacy(user);
  }

  const hasLegacyMembership = await UserBatch.exists({ userId: user._id });
  if (hasLegacyMembership) {
    return hydrateUserBatchesFromLegacy(user);
  }

  return [];
}

export async function getCurrentBatchIdForUser(user) {
  const entries = await getUserBatchEntries(user);
  if (entries.length === 0) return null;
  return entries[entries.length - 1].batchId;
}

export async function getCurrentBatchByUser(user) {
  const batchId = await getCurrentBatchIdForUser(user);
  if (!batchId) return null;
  return Batch.findById(batchId).lean();
}

export async function getCurrentBatchMembershipByUserId(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  const batchId = await getCurrentBatchIdForUser(user);
  if (batchId) {
    return {
      user,
      batchId,
    };
  }

  const primary = await UserBatch.findOne({ userId, isPrimary: true }).lean();
  if (!primary) {
    return {
      user,
      batchId: null,
    };
  }

  user.batches = [
    {
      batchId: primary.batchId,
      joinedAt: primary.createdAt ?? new Date().toISOString(),
    },
  ];
  await user.save();

  return {
    user,
    batchId: primary.batchId,
  };
}

export async function syncLegacyMembership(userId, batchId) {
  const memberships = await UserBatch.find({ userId });
  let hasCurrent = false;

  for (const membership of memberships) {
    const isCurrent = toBatchIdString(membership.batchId) === toBatchIdString(batchId);
    hasCurrent = hasCurrent || isCurrent;

    if (membership.isPrimary !== isCurrent) {
      membership.isPrimary = isCurrent;
      await membership.save();
    }
  }

  if (!hasCurrent) {
    await UserBatch.create({
      userId,
      batchId,
      isPrimary: true,
    });
  }
}

export async function recalculateBatchMemberCount(batchId) {
  const memberCount = await UserBatch.countDocuments({ batchId });
  const batch = await Batch.findById(batchId);

  if (batch) {
    batch.memberCount = memberCount;
    await batch.save();
  }

  return memberCount;
}

export async function addUserToBatch({ user, batchId, allowAdditionalBatches = false }) {
  const entries = await getUserBatchEntries(user);
  const batchIdStr = toBatchIdString(batchId);
  const existing = entries.find((entry) => entry.batchId === batchIdStr);

  if (existing) {
    await syncLegacyMembership(user._id, batchId);
    const memberCount = await recalculateBatchMemberCount(batchId);
    return {
      joined: false,
      reason: 'already_joined',
      memberCount,
    };
  }

  if (!allowAdditionalBatches && entries.length > 0) {
    return {
      joined: false,
      reason: 'already_onboarded',
      currentBatchId: entries[entries.length - 1].batchId,
    };
  }

  const joinedAt = new Date().toISOString();
  user.batches = [
    ...entries,
    {
      batchId,
      joinedAt,
    },
  ];
  await user.save();

  await syncLegacyMembership(user._id, batchId);
  const memberCount = await recalculateBatchMemberCount(batchId);

  return {
    joined: true,
    joinedAt,
    memberCount,
  };
}

export async function ensureBatchWritable(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) {
    return {
      ok: false,
      status: 404,
      error: 'Batch not found',
      batch: null,
    };
  }

  if (batch.isFrozen) {
    return {
      ok: false,
      status: 403,
      error: 'This yearbook has been frozen.',
      batch,
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    batch,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreBatchMatch(batch, query) {
  const institution = normalizeString(batch.institutionName).toLowerCase();
  const rawQuery = normalizeString(query).toLowerCase();
  const normalizedInstitution = normalizeInstitutionForComparison(batch.institutionName);
  const normalizedQuery = normalizeInstitutionForComparison(query);

  let score = 0;

  if (!institution || !rawQuery) return score;
  if (institution === rawQuery) score += 100;
  else if (institution.startsWith(rawQuery)) score += 70;
  else if (institution.includes(rawQuery)) score += 50;

  if (normalizedInstitution.includes(normalizedQuery) && normalizedQuery) {
    score += 20;
  }

  if (normalizedQuery) {
    const distance = levenshteinDistance(normalizedInstitution, normalizedQuery);
    if (distance <= 2) {
      score += 25 - distance * 5;
    }
  }

  score += Math.min(Number(batch.memberCount ?? 0), 99) / 100;

  return score;
}

export async function searchBatchesByInstitution(query, limit = 10) {
  const trimmedQuery = normalizeString(query);
  if (trimmedQuery.length < 2) {
    return [];
  }

  const regex = new RegExp(escapeRegex(trimmedQuery), 'i');
  const normalizedQuery = normalizeInstitutionForComparison(trimmedQuery);
  const batches = await Batch.find({}).lean();

  const filtered = batches.filter((batch) => {
    const institutionName = normalizeString(batch.institutionName);
    if (!institutionName) return false;

    if (regex.test(institutionName)) {
      return true;
    }

    const normalizedInstitution = normalizeInstitutionForComparison(institutionName);
    if (!normalizedInstitution || !normalizedQuery) {
      return false;
    }

    if (normalizedInstitution.includes(normalizedQuery)) {
      return true;
    }

    return levenshteinDistance(normalizedInstitution, normalizedQuery) <= 2;
  });

  return filtered
    .sort((left, right) => {
      const scoreDiff = scoreBatchMatch(right, trimmedQuery) - scoreBatchMatch(left, trimmedQuery);
      if (scoreDiff !== 0) return scoreDiff;

      const memberDiff = Number(right.memberCount ?? 0) - Number(left.memberCount ?? 0);
      if (memberDiff !== 0) return memberDiff;

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    })
    .slice(0, limit);
}

export function normalizeGraduationYear(yearInput) {
  return normalizeYear(yearInput);
}
