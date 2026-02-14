import express from 'express';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';
import { Like } from '../models/Like.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { Superlative } from '../models/Superlative.js';
import { signMediaUrl } from '../services/mediaUrlService.js';

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
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
