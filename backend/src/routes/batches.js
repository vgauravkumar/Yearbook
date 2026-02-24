import express from 'express';
import { logger } from '../utils/logger.js';

import { authRequired } from '../middleware/auth.js';
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

// GET /api/v1/batches/join/:inviteCode
router.get('/join/:inviteCode', async (req, res) => {
  try {
    const inviteCode = normalizeInviteCode(req.params.inviteCode);
    if (!inviteCode || !/^[a-z0-9]{7}$/.test(inviteCode)) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    const batch = await Batch.findOne({ inviteCode }).lean();
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

// GET /api/v1/batches/:batchId/students?page=1&limit=50&sort=trending&search=abc
router.get('/:batchId/students', async (req, res) => {
  try {
    const { batchId } = req.params;
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '50');
    const sortMode = (req.query.sort ?? 'trending').toString().toLowerCase();
    const search = (req.query.search ?? '').toString().trim().toLowerCase();

    const userBatchDocs = await UserBatch.find({ batchId }, { userId: 1 }).lean();
    const userIds = userBatchDocs.map((entry) => entry.userId);

    const users = await User.find(
      { _id: { $in: userIds } },
      { fullName: 1, profilePictureKey: 1, bio: 1 },
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
      const id = row._id.toUserId.toString();
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
      const userId = row._id.toUserId.toString();
      const superlativeId = row._id.superlativeId.toString();

      if (!votesByUser.has(userId)) {
        votesByUser.set(userId, new Map());
      }

      votesByUser.get(userId).set(superlativeId, row.count);
    }

    const superlativeById = new Map(
      superlatives.map((entry) => [entry._id.toString(), entry]),
    );

    let students = await Promise.all(
      users.map(async (user) => {
        const id = user._id.toString();
        const voteMap = votesByUser.get(id) ?? new Map();
        const superlativeSummary = Array.from(voteMap.entries()).map(
          ([superlativeId, count]) => {
            const superlative = superlativeById.get(superlativeId);
            return {
              id: superlativeId,
              name: superlative?.name ?? 'Unknown',
              vote_count: count,
            };
          },
        );

        return {
          id,
          full_name: user.fullName,
          profile_picture_url: await signMediaUrl(user.profilePictureKey),
          bio: user.bio,
          like_count: likeMap.get(id) ?? 0,
          superlike_count: superlikeMap.get(id) ?? 0,
          superlatives: superlativeSummary,
        };
      }),
    );

    if (search) {
      students = students.filter((student) => {
        const inName = student.full_name.toLowerCase().includes(search);
        const inBio = (student.bio ?? '').toLowerCase().includes(search);
        return inName || inBio;
      });
    }

    students = applySort(students, sortMode);

    const totalStudents = students.length;
    const totalPages = Math.max(Math.ceil(totalStudents / limit), 1);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagedStudents = students.slice(startIndex, endIndex);

    return res.json({
      students: pagedStudents,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_students: totalStudents,
      },
    });
  } catch (err) {
    logger.error('Batches route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
