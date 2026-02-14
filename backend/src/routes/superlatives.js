import express from 'express';
import { Superlative } from '../models/Superlative.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { UserBatch } from '../models/UserBatch.js';
import { Batch } from '../models/Batch.js';
import { User } from '../models/User.js';
import { authRequired } from '../middleware/auth.js';
import { signMediaUrl } from '../services/mediaUrlService.js';

const router = express.Router();

async function ensureNotFrozen(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) return { frozen: false, batch: null };

  const now = new Date();
  const isFrozen =
    batch.isFrozen || (batch.freezeDate && now.getTime() > batch.freezeDate.getTime());

  return { frozen: isFrozen, batch };
}

function mapSuperlative(superlative) {
  return {
    id: superlative._id,
    name: superlative.name,
    description: superlative.description,
    max_votes: superlative.maxVotesPerUser,
    icon_url: superlative.iconUrl,
  };
}

// GET /api/v1/superlatives
router.get('/', async (_req, res) => {
  try {
    const superlatives = await Superlative.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    return res.json({
      superlatives: superlatives.map(mapSuperlative),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/superlatives/me/status
router.get('/me/status', authRequired, async (req, res) => {
  try {
    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    }).lean();

    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const superlatives = await Superlative.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    const usedVotes = await SuperlativeVote.aggregate([
      {
        $match: {
          fromUserId: req.user._id,
          batchId: userBatch.batchId,
        },
      },
      {
        $group: {
          _id: '$superlativeId',
          used: { $sum: 1 },
        },
      },
    ]);

    const usedVotesMap = new Map(
      usedVotes.map((entry) => [entry._id.toString(), entry.used]),
    );

    const statuses = superlatives.map((superlative) => {
      const used = usedVotesMap.get(superlative._id.toString()) ?? 0;
      const remaining = Math.max(superlative.maxVotesPerUser - used, 0);
      return {
        id: superlative._id,
        name: superlative.name,
        max_votes: superlative.maxVotesPerUser,
        votes_used: used,
        remaining_votes: remaining,
      };
    });

    const leaderboardAgg = await SuperlativeVote.aggregate([
      {
        $match: {
          batchId: userBatch.batchId,
        },
      },
      {
        $group: {
          _id: {
            superlativeId: '$superlativeId',
            toUserId: '$toUserId',
          },
          votes: { $sum: 1 },
        },
      },
      {
        $sort: {
          '_id.superlativeId': 1,
          votes: -1,
        },
      },
    ]);

    const userIds = [
      ...new Set(leaderboardAgg.map((entry) => entry._id.toUserId.toString())),
    ];

    const users = await User.find(
      { _id: { $in: userIds } },
      { fullName: 1, profilePictureKey: 1 },
    ).lean();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const leaderboardMap = new Map();

    for (const row of leaderboardAgg) {
      const superlativeId = row._id.superlativeId.toString();
      if (!leaderboardMap.has(superlativeId)) {
        leaderboardMap.set(superlativeId, []);
      }

      if (leaderboardMap.get(superlativeId).length >= 5) {
        continue;
      }

      const targetUser = userMap.get(row._id.toUserId.toString());
      if (!targetUser) continue;

      leaderboardMap.get(superlativeId).push({
        user_id: targetUser._id,
        full_name: targetUser.fullName,
        profile_picture_url: await signMediaUrl(targetUser.profilePictureKey),
        vote_count: row.votes,
      });
    }

    const leaderboards = superlatives.map((superlative) => ({
      id: superlative._id,
      name: superlative.name,
      leaders: leaderboardMap.get(superlative._id.toString()) ?? [],
    }));

    return res.json({
      statuses,
      leaderboards,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/superlatives/:superlativeId/vote
router.post('/:superlativeId/vote', authRequired, async (req, res) => {
  try {
    const { superlativeId } = req.params;
    const { to_user_id: toUserId } = req.body;

    if (!toUserId) {
      return res.status(400).json({ error: 'to_user_id is required' });
    }

    if (toUserId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot vote for yourself' });
    }

    const superlative = await Superlative.findById(superlativeId);
    if (!superlative || !superlative.isActive) {
      return res.status(404).json({ error: 'Superlative not found' });
    }

    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    }).lean();

    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const targetIsInBatch = await UserBatch.exists({
      userId: toUserId,
      batchId: userBatch.batchId,
    });

    if (!targetIsInBatch) {
      return res.status(400).json({ error: 'Target user is not in your batch' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Voting disabled after freeze date',
        freeze_date: batch?.freezeDate,
      });
    }

    const usedCount = await SuperlativeVote.countDocuments({
      fromUserId: req.user._id,
      superlativeId,
      batchId: userBatch.batchId,
    });

    if (usedCount >= superlative.maxVotesPerUser) {
      return res.status(400).json({
        error: 'Maximum votes reached for this superlative',
        max_votes: superlative.maxVotesPerUser,
        votes_used: usedCount,
      });
    }

    await SuperlativeVote.create({
      fromUserId: req.user._id,
      toUserId,
      superlativeId,
      batchId: userBatch.batchId,
    });

    const votesUsed = usedCount + 1;

    return res.json({
      message: 'Vote recorded',
      votes_used: votesUsed,
      remaining_votes: superlative.maxVotesPerUser - votesUsed,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
