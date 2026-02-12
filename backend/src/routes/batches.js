import express from 'express';
import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';
import { Like } from '../models/Like.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { Superlative } from '../models/Superlative.js';

const router = express.Router();

// GET /api/v1/batches/:batchId/students?page=1&limit=50
router.get('/:batchId/students', async (req, res) => {
  try {
    const { batchId } = req.params;
    const page = Number(req.query.page ?? '1');
    const limit = Number(req.query.limit ?? '50');

    const userBatchDocs = await UserBatch.find({ batchId })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const userIds = userBatchDocs.map((ub) => ub.userId);

    const users = await User.find(
      { _id: { $in: userIds } },
      { fullName: 1, profilePictureUrl: 1 },
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
      const supId = row._id.superlativeId.toString();
      if (!votesByUser.has(userId)) votesByUser.set(userId, new Map());
      votesByUser.get(userId).set(supId, row.count);
    }

    const superlativeById = new Map(
      superlatives.map((s) => [s._id.toString(), s]),
    );

    const students = users.map((u) => {
      const id = u._id.toString();
      const voteMap = votesByUser.get(id) ?? new Map();
      const slist = Array.from(voteMap.entries()).map(([supId, count]) => {
        const sup = superlativeById.get(supId);
        return {
          id: supId,
          name: sup?.name ?? 'Unknown',
          vote_count: count,
        };
      });

      return {
        id,
        full_name: u.fullName,
        profile_picture_url: u.profilePictureUrl,
        like_count: likeMap.get(id) ?? 0,
        superlike_count: superlikeMap.get(id) ?? 0,
        superlatives: slist,
      };
    });

    const totalStudents = await UserBatch.countDocuments({ batchId });
    const totalPages = Math.ceil(totalStudents / limit);

    return res.json({
      students,
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

