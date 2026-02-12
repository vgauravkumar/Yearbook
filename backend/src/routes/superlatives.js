import express from 'express';
import { Superlative } from '../models/Superlative.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { UserBatch } from '../models/UserBatch.js';
import { Batch } from '../models/Batch.js';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

async function ensureNotFrozen(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) return { frozen: false };
  const now = new Date();
  const isFrozen =
    batch.isFrozen || (batch.freezeDate && now.getTime() > batch.freezeDate.getTime());
  return { frozen: isFrozen, batch };
}

// GET /api/v1/superlatives
router.get('/', async (_req, res) => {
  try {
    const superlatives = await Superlative.find({ isActive: true }).lean();
    return res.json({
      superlatives: superlatives.map((s) => ({
        id: s._id,
        name: s.name,
        description: s.description,
        max_votes: s.maxVotesPerUser,
        icon_url: s.iconUrl,
      })),
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

    const superlative = await Superlative.findById(superlativeId);
    if (!superlative || !superlative.isActive) {
      return res.status(404).json({ error: 'Superlative not found' });
    }

    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    });
    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Voting disabled after freeze date',
        freeze_date: batch.freezeDate,
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

    return res.json({
      message: 'Vote recorded',
      remaining_votes: superlative.maxVotesPerUser - (usedCount + 1),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

