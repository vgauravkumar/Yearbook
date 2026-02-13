import express from 'express';
import { Filter } from 'bad-words';
import multer from 'multer';
import fs from 'fs/promises';

import { authRequired } from '../middleware/auth.js';
import { UserBatch } from '../models/UserBatch.js';
import { Batch } from '../models/Batch.js';
import { Memory } from '../models/Memory.js';
import { MemoryReaction } from '../models/MemoryReaction.js';
import { deleteImage, uploadMemoryMedia } from '../services/imageService.js';

const router = express.Router();
const profanityFilter = new Filter();
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 },
});

async function ensureNotFrozen(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) return { frozen: false, batch: null };

  const now = new Date();
  const isFrozen =
    batch.isFrozen || (batch.freezeDate && now.getTime() > batch.freezeDate.getTime());

  return { frozen: isFrozen, batch };
}

function mapMemory(memory, likeCountMap, likedMemoryIds) {
  const id = memory._id.toString();
  const user = memory.userId;

  return {
    id,
    caption: memory.caption,
    media_url: memory.mediaUrl,
    media_type: memory.mediaType,
    thumbnail_url: memory.thumbnailUrl,
    duration_sec: memory.durationSec,
    created_at: memory.createdAt,
    like_count: likeCountMap.get(id) ?? 0,
    has_liked: likedMemoryIds.has(id),
    user: {
      id: user._id,
      full_name: user.fullName,
      profile_picture_url: user.profilePictureUrl,
    },
  };
}

// GET /api/v1/memories/feed
router.get('/feed', authRequired, async (req, res) => {
  try {
    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    }).lean();

    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);

    const memories = await Memory.find({ batchId: userBatch.batchId })
      .sort({ createdAt: -1 })
      .limit(150)
      .populate('userId', 'fullName profilePictureUrl')
      .lean();

    const memoryIds = memories.map((memory) => memory._id);

    const reactionCounts = await MemoryReaction.aggregate([
      { $match: { memoryId: { $in: memoryIds } } },
      {
        $group: {
          _id: '$memoryId',
          count: { $sum: 1 },
        },
      },
    ]);

    const likeCountMap = new Map(
      reactionCounts.map((entry) => [entry._id.toString(), entry.count]),
    );

    const likedDocs = await MemoryReaction.find(
      {
        fromUserId: req.user._id,
        memoryId: { $in: memoryIds },
      },
      { memoryId: 1 },
    ).lean();

    const likedMemoryIds = new Set(
      likedDocs.map((entry) => entry.memoryId.toString()),
    );

    const mappedMemories = memories
      .filter((memory) => Boolean(memory.userId))
      .map((memory) => mapMemory(memory, likeCountMap, likedMemoryIds));

    const reels = [...mappedMemories].sort((a, b) => {
      if (b.like_count !== a.like_count) {
        return b.like_count - a.like_count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const storyWindowStart = Date.now() - 24 * 60 * 60 * 1000;
    const storyMap = new Map();

    for (const memory of mappedMemories) {
      const createdAtMs = new Date(memory.created_at).getTime();
      if (createdAtMs < storyWindowStart) continue;

      const userId = memory.user.id;
      if (!storyMap.has(userId)) {
        storyMap.set(userId, {
          user: memory.user,
          items: [],
          latest_at: memory.created_at,
        });
      }

      storyMap.get(userId).items.push(memory);
    }

    const stories = Array.from(storyMap.values())
      .map((story) => {
        const items = story.items
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
          .slice(-8);

        return {
          user: story.user,
          latest_at: story.latest_at,
          story_count: items.length,
          preview_memory: items[items.length - 1],
          items,
        };
      })
      .sort(
        (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
      )
      .slice(0, 25);

    return res.json({
      stories,
      reels: reels.slice(0, 100),
      can_post: !frozen,
      freeze_date: batch?.freezeDate ?? null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/memories
router.post('/', authRequired, upload.single('file'), async (req, res) => {
  let uploadedPublicId = null;

  try {
    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    }).lean();

    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Posting memories disabled after freeze date',
        freeze_date: batch?.freezeDate,
      });
    }

    const caption = (req.body.caption ?? '').toString().trim();
    if (caption.length > 280) {
      return res.status(400).json({ error: 'Caption too long (max 280)' });
    }

    if (caption && profanityFilter.isProfane(caption)) {
      return res.status(400).json({
        error: 'Caption contains inappropriate language',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }

    const uploadResult = await uploadMemoryMedia(req.file.path, req.user._id);
    uploadedPublicId = uploadResult.public_id;

    const mediaType = uploadResult.resource_type === 'video' ? 'video' : 'image';

    const memory = await Memory.create({
      userId: req.user._id,
      batchId: userBatch.batchId,
      mediaUrl: uploadResult.secure_url,
      mediaType,
      cloudinaryPublicId: uploadResult.public_id,
      thumbnailUrl: uploadResult.secure_url,
      durationSec:
        typeof uploadResult.duration === 'number'
          ? Math.round(uploadResult.duration)
          : null,
      caption,
    });

    return res.status(201).json({
      id: memory._id,
      caption: memory.caption,
      media_url: memory.mediaUrl,
      media_type: memory.mediaType,
      thumbnail_url: memory.thumbnailUrl,
      duration_sec: memory.durationSec,
      created_at: memory.createdAt,
      like_count: 0,
      has_liked: false,
      user: {
        id: req.user._id,
        full_name: req.user.fullName,
        profile_picture_url: req.user.profilePictureUrl,
      },
    });
  } catch (err) {
    if (uploadedPublicId) {
      await deleteImage(uploadedPublicId).catch(() => {});
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
});

// POST /api/v1/memories/:memoryId/react
router.post('/:memoryId/react', authRequired, async (req, res) => {
  try {
    const { memoryId } = req.params;

    const userBatch = await UserBatch.findOne({
      userId: req.user._id,
      isPrimary: true,
    }).lean();

    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const memory = await Memory.findById(memoryId).lean();
    if (!memory || memory.batchId.toString() !== userBatch.batchId.toString()) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    if (memory.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot react to your own memory' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Interactions disabled after freeze date',
        freeze_date: batch?.freezeDate,
      });
    }

    const existing = await MemoryReaction.findOne({
      memoryId,
      fromUserId: req.user._id,
    });

    let liked = false;
    if (existing) {
      await existing.deleteOne();
      liked = false;
    } else {
      await MemoryReaction.create({
        memoryId,
        fromUserId: req.user._id,
      });
      liked = true;
    }

    const likeCount = await MemoryReaction.countDocuments({ memoryId });

    return res.json({
      message: liked ? 'Memory liked' : 'Memory unliked',
      liked,
      like_count: likeCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/memories/:memoryId
router.delete('/:memoryId', authRequired, async (req, res) => {
  try {
    const { memoryId } = req.params;
    const memory = await Memory.findById(memoryId);

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    if (memory.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the creator can delete this memory' });
    }

    await MemoryReaction.deleteMany({ memoryId: memory._id });
    await memory.deleteOne();

    if (memory.cloudinaryPublicId) {
      await deleteImage(memory.cloudinaryPublicId).catch(() => {});
    }

    return res.json({ message: 'Memory deleted' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
