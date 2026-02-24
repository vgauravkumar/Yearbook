import express from 'express';
import { logger } from '../utils/logger.js';

import { authOptional, authRequired } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';
import { Like } from '../models/Like.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { Superlative } from '../models/Superlative.js';
import { signMediaUrl } from '../services/mediaUrlService.js';
import {
  addUserToBatch,
  buildBatchResponse,
  calculateFreezeDateUtc,
  generateUniqueInviteCode,
  getCurrentBatchMembershipByUserId,
  isCloseInstitutionMatch,
  normalizeGraduationMonth,
  normalizeGraduationYear,
  normalizeInviteCode,
  searchBatchesByInstitution,
} from '../services/batchService.js';

const router = express.Router();

function toIdString(value) {
  if (!value) return '';
  return value.toString();
}

function parsePositiveInt(raw, fallback, max = 300) {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return fallback;
  return Math.min(rounded, max);
}

function getTrendingScore(student) {
  const superlativeVotes = student.superlatives.reduce(
    (sum, entry) => sum + entry.vote_count,
    0,
  );

  return student.like_count + student.superlike_count * 2 + superlativeVotes * 1.5;
}

function applySort(students, sortMode) {
  if (sortMode === 'alphabetical') {
    return students.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  if (sortMode === 'support') {
    return students.sort((a, b) => {
      if (b.superlike_count !== a.superlike_count) {
        return b.superlike_count - a.superlike_count;
      }
      return b.like_count - a.like_count;
    });
  }

  return students.sort((a, b) => getTrendingScore(b) - getTrendingScore(a));
}

function buildInviteLink(inviteCode) {
  return `meracto.com/join/${inviteCode}`;
}

function sortByBatchRecency(left, right) {
  const leftTimestamp = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
  const rightTimestamp = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
  return rightTimestamp - leftTimestamp;
}

async function resolvePreviewAvatars(userIds, maxAvatars = 4) {
  const orderedIds = [
    ...new Set(userIds.map((entry) => toIdString(entry)).filter((entry) => entry.length > 0)),
  ];
  if (orderedIds.length === 0) return [];

  const previewUsers = await User.find(
    { _id: { $in: orderedIds } },
    { _id: 1, profilePictureKey: 1 },
  ).lean();

  const profileKeyByUserId = new Map();
  for (const user of previewUsers) {
    if (!user?.profilePictureKey) continue;
    profileKeyByUserId.set(toIdString(user._id), user.profilePictureKey);
  }

  const previewKeys = [];
  for (const userId of orderedIds) {
    const profileKey = profileKeyByUserId.get(userId);
    if (!profileKey) continue;

    previewKeys.push(profileKey);
    if (previewKeys.length >= maxAvatars) {
      break;
    }
  }

  if (previewKeys.length === 0) {
    return [];
  }

  const signed = await Promise.all(
    previewKeys.map((profileKey) => signMediaUrl(profileKey)),
  );

  return signed.filter((entry) => typeof entry === 'string' && entry.length > 0);
}

async function loadViewerContext(user, batch) {
  if (!user) {
    return {
      is_authenticated: false,
      is_member: false,
      is_own_batch: false,
      can_join: false,
      current_batch_id: null,
    };
  }

  const membership = await getCurrentBatchMembershipByUserId(user._id);
  const currentBatchId = toIdString(membership?.batchId);
  const targetBatchId = toIdString(batch?._id);
  const isOwnBatch = currentBatchId !== '' && currentBatchId === targetBatchId;

  return {
    is_authenticated: true,
    is_member: isOwnBatch,
    is_own_batch: isOwnBatch,
    can_join: !isOwnBatch && !Boolean(batch?.isFrozen),
    current_batch_id: currentBatchId || null,
  };
}

async function loadBatchMembersWithStats({
  batchId,
  page,
  limit,
  sortMode,
  search,
  includeInteractionState = false,
  viewerUserId = null,
}) {
  const userBatchDocs = await UserBatch.find({ batchId }, { userId: 1 }).lean();
  const userIds = [
    ...new Set(
      userBatchDocs
        .map((entry) => toIdString(entry.userId))
        .filter((entry) => entry.length > 0),
    ),
  ];

  if (userIds.length === 0) {
    return {
      items: [],
      pagination: {
        current_page: page,
        total_pages: 1,
        total_members: 0,
        total_students: 0,
      },
    };
  }

  const users = await User.find(
    { _id: { $in: userIds } },
    { fullName: 1, profilePictureKey: 1, bio: 1, socialLinks: 1 },
  ).lean();

  const likes = await Like.aggregate([
    { $match: { toUserId: { $in: userIds } } },
    {
      $group: {
        _id: { toUserId: '$toUserId', isSuperlike: '$isSuperlike' },
        count: { $sum: 1 },
      },
    },
  ]);

  const likeMap = new Map();
  const superlikeMap = new Map();
  for (const row of likes) {
    const id = toIdString(row._id.toUserId);
    if (row._id.isSuperlike) {
      superlikeMap.set(id, row.count);
    } else {
      likeMap.set(id, row.count);
    }
  }

  const superlatives = await Superlative.find({ isActive: true }).lean();
  const superlativeVotes = await SuperlativeVote.aggregate([
    { $match: { batchId, toUserId: { $in: userIds } } },
    {
      $group: {
        _id: { toUserId: '$toUserId', superlativeId: '$superlativeId' },
        count: { $sum: 1 },
      },
    },
  ]);

  const votesByUser = new Map();
  for (const row of superlativeVotes) {
    const targetUserId = toIdString(row._id.toUserId);
    const superlativeId = toIdString(row._id.superlativeId);

    if (!votesByUser.has(targetUserId)) {
      votesByUser.set(targetUserId, new Map());
    }

    votesByUser.get(targetUserId).set(superlativeId, row.count);
  }

  const superlativeById = new Map(
    superlatives.map((entry) => [toIdString(entry._id), entry]),
  );

  let reactionByUser = new Map();
  let votesCastByViewerByUser = new Map();

  if (includeInteractionState && viewerUserId) {
    const viewerReactions = await Like.find({
      fromUserId: viewerUserId,
      toUserId: { $in: userIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    reactionByUser = new Map();
    for (const reaction of viewerReactions) {
      const targetUserId = toIdString(reaction.toUserId);
      if (reactionByUser.has(targetUserId)) continue;

      reactionByUser.set(targetUserId, {
        has_liked: !reaction.isSuperlike,
        has_superliked: Boolean(reaction.isSuperlike),
      });
    }

    const viewerVotes = await SuperlativeVote.aggregate([
      {
        $match: {
          fromUserId: viewerUserId,
          batchId,
          toUserId: { $in: userIds },
        },
      },
      {
        $group: {
          _id: {
            toUserId: '$toUserId',
            superlativeId: '$superlativeId',
          },
          count: { $sum: 1 },
        },
      },
    ]);

    votesCastByViewerByUser = new Map();
    for (const row of viewerVotes) {
      const targetUserId = toIdString(row._id.toUserId);
      if (!votesCastByViewerByUser.has(targetUserId)) {
        votesCastByViewerByUser.set(targetUserId, []);
      }

      votesCastByViewerByUser.get(targetUserId).push({
        superlative_id: toIdString(row._id.superlativeId),
        vote_count: row.count,
      });
    }
  }

  let members = await Promise.all(
    users.map(async (user) => {
      const id = toIdString(user._id);
      const voteMap = votesByUser.get(id) ?? new Map();
      const superlativeSummary = Array.from(voteMap.entries())
        .map(([superlativeId, count]) => {
          const superlative = superlativeById.get(superlativeId);
          return {
            id: superlativeId,
            name: superlative?.name ?? 'Unknown',
            vote_count: count,
          };
        })
        .sort((left, right) => right.vote_count - left.vote_count);

      const base = {
        id,
        full_name: user.fullName,
        profile_picture_url: await signMediaUrl(user.profilePictureKey),
        bio: user.bio,
        social_links: user.socialLinks ?? {},
        like_count: likeMap.get(id) ?? 0,
        superlike_count: superlikeMap.get(id) ?? 0,
        superlatives: superlativeSummary,
      };

      if (!includeInteractionState) {
        return base;
      }

      return {
        ...base,
        current_user_interactions: reactionByUser.get(id) ?? {
          has_liked: false,
          has_superliked: false,
        },
        my_votes: votesCastByViewerByUser.get(id) ?? [],
      };
    }),
  );

  if (search) {
    members = members.filter((member) => {
      const inName = member.full_name.toLowerCase().includes(search);
      const inBio = (member.bio ?? '').toLowerCase().includes(search);
      return inName || inBio;
    });
  }

  members = applySort(members, sortMode);

  const totalMembers = members.length;
  const totalPages = Math.max(Math.ceil(totalMembers / limit), 1);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const pagedMembers = members.slice(startIndex, endIndex);

  return {
    items: pagedMembers,
    pagination: {
      current_page: page,
      total_pages: totalPages,
      total_members: totalMembers,
      total_students: totalMembers,
    },
  };
}

// GET /api/v1/batches/search?q=...
router.get('/search', async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const batches = await searchBatchesByInstitution(query, 10);

    return res.json({
      batches: batches.map((batch) => buildBatchResponse(batch)),
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/batches/public
router.get('/public', async (_req, res) => {
  try {
    const allBatches = await Batch.find({}).lean();

    const enriched = await Promise.all(
      allBatches.map(async (batch) => {
        const memberDocs = await UserBatch.find(
          { batchId: batch._id },
          { userId: 1, createdAt: 1 },
        )
          .sort({ createdAt: -1 })
          .lean();

        const memberIds = memberDocs
          .map((entry) => toIdString(entry.userId))
          .filter((entry) => entry.length > 0);
        const memberCount = memberIds.length;

        if (memberCount < 1) {
          return null;
        }

        const previewAvatars = await resolvePreviewAvatars(memberIds, 4);

        return {
          _id: batch._id,
          institutionName: batch.institutionName,
          graduationYear: batch.graduationYear,
          graduationMonth: batch.graduationMonth,
          memberCount,
          isFrozen: Boolean(batch.isFrozen),
          freezeDate: batch.freezeDate ?? null,
          inviteCode: batch.inviteCode,
          previewAvatars,
          updatedAt: batch.updatedAt ?? batch.createdAt ?? null,
        };
      }),
    );

    const batches = enriched
      .filter((entry) => Boolean(entry))
      .sort((left, right) => {
        if (left.isFrozen !== right.isFrozen) {
          return left.isFrozen ? 1 : -1;
        }

        return sortByBatchRecency(left, right);
      });

    return res.json({ batches });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/batches/join/:inviteCode
router.get('/join/:inviteCode', authOptional, async (req, res) => {
  try {
    const inviteCode = normalizeInviteCode(req.params.inviteCode);
    if (!inviteCode || !/^[a-z0-9]{7}$/.test(inviteCode)) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    const batch = await Batch.findOne({ inviteCode }).lean();
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const viewer = await loadViewerContext(req.user, batch);
    const includeInteractionState = viewer.is_authenticated && viewer.is_member;

    const { items, pagination } = await loadBatchMembersWithStats({
      batchId: batch._id,
      page: 1,
      limit: 300,
      sortMode: 'trending',
      search: '',
      includeInteractionState,
      viewerUserId: req.user?._id ?? null,
    });

    return res.json({
      batch: buildBatchResponse(batch),
      viewer,
      members: items,
      students: items,
      pagination,
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/batches
router.post('/', authRequired, async (req, res) => {
  try {
    const institutionName =
      typeof req.body?.institutionName === 'string'
        ? req.body.institutionName.trim()
        : '';
    const graduationYear = normalizeGraduationYear(req.body?.graduationYear);
    const graduationMonth = normalizeGraduationMonth(req.body?.graduationMonth);
    const forceCreate = Boolean(req.body?.forceCreate);

    if (!institutionName || !graduationYear || !graduationMonth) {
      return res.status(400).json({
        error: 'institutionName, graduationYear, and graduationMonth are required',
      });
    }

    const membership = await getCurrentBatchMembershipByUserId(req.user._id);
    if (membership?.batchId) {
      return res.status(409).json({
        error: 'User is already onboarded to a batch.',
        batch_id: membership.batchId,
      });
    }

    const exactExisting = await Batch.findOne({
      institutionName,
      graduationYear,
      graduationMonth,
    }).lean();

    if (exactExisting) {
      return res.status(409).json({
        error: 'A batch with the same details already exists. Join that yearbook instead.',
        existing_batch: buildBatchResponse(exactExisting),
      });
    }

    const similarCandidates = await searchBatchesByInstitution(institutionName, 20);
    const closeMatch = similarCandidates.find(
      (batch) =>
        batch.graduationYear === graduationYear &&
        batch.graduationMonth === graduationMonth &&
        isCloseInstitutionMatch(batch.institutionName, institutionName),
    );

    if (closeMatch && !forceCreate) {
      return res.status(409).json({
        error:
          `A similar batch already exists (${closeMatch.institutionName} — ${closeMatch.graduationMonth} ${closeMatch.graduationYear}).`,
        warning_code: 'similar_batch_exists',
        suggested_batch: buildBatchResponse(closeMatch),
      });
    }

    const freezeDate = calculateFreezeDateUtc(graduationYear, graduationMonth);
    if (!freezeDate) {
      return res.status(400).json({ error: 'Invalid graduation month/year combination' });
    }

    if (freezeDate.getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'Graduation date is already in the past for this batch.',
      });
    }

    const batch = await Batch.create({
      institutionName,
      graduationYear,
      graduationMonth,
      freezeDate: freezeDate.toISOString(),
      inviteCode: await generateUniqueInviteCode(),
      createdBy: req.user._id,
      memberCount: 0,
      isFrozen: false,
    });

    await addUserToBatch({
      user: req.user,
      batchId: batch._id,
      allowAdditionalBatches: false,
    });

    const refreshedBatch = await Batch.findById(batch._id).lean();

    return res.status(201).json({
      batch: buildBatchResponse(refreshedBatch, { includeInviteCode: true }),
      invite_link: buildInviteLink(batch.inviteCode),
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/batches/:batchId/join
router.post('/:batchId/join', authRequired, async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    if (batch.isFrozen) {
      return res.status(403).json({
        error: 'This yearbook has been frozen.',
        freeze_date: batch.freezeDate,
      });
    }

    const joined = await addUserToBatch({
      user: req.user,
      batchId,
      allowAdditionalBatches: false,
    });

    if (!joined.joined && joined.reason === 'already_onboarded') {
      return res.status(409).json({
        error: 'User is already onboarded to another batch.',
        batch_id: joined.currentBatchId,
      });
    }

    const refreshedBatch = await Batch.findById(batchId).lean();

    return res.json({
      joined: true,
      already_joined: joined.reason === 'already_joined',
      batch: buildBatchResponse(refreshedBatch),
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleMembersRequest(req, res) {
  try {
    const { batchId } = req.params;
    const page = parsePositiveInt(req.query.page, 1, 1000);
    const limit = parsePositiveInt(req.query.limit, 50, 300);
    const sortMode = (req.query.sort ?? 'trending').toString().toLowerCase();
    const search = (req.query.search ?? '').toString().trim().toLowerCase();

    const batch = await Batch.findById(batchId).lean();
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    let includeInteractionState = false;
    let viewerUserId = null;

    if (req.user) {
      const viewerMembership = await getCurrentBatchMembershipByUserId(req.user._id);
      includeInteractionState =
        toIdString(viewerMembership?.batchId) === toIdString(batchId);
      viewerUserId = req.user._id;
    }

    const { items, pagination } = await loadBatchMembersWithStats({
      batchId,
      page,
      limit,
      sortMode,
      search,
      includeInteractionState,
      viewerUserId,
    });

    return res.json({
      members: items,
      students: items,
      pagination,
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/v1/batches/:batchId/members?page=1&limit=50&sort=trending&search=abc
router.get('/:batchId/members', authOptional, handleMembersRequest);

// Backward-compatible alias for existing frontend.
router.get('/:batchId/students', authOptional, handleMembersRequest);

// GET /api/v1/batches/:batchId
router.get('/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await Batch.findById(batchId).lean();

    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    return res.json({
      batch: buildBatchResponse(batch),
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
