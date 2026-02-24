import express from 'express';
import { logger } from '../utils/logger.js';
import { Filter } from 'bad-words';

import { authRequired } from '../middleware/auth.js';
import { Batch } from '../models/Batch.js';
import { Memory } from '../models/Memory.js';
import { MemoryReaction } from '../models/MemoryReaction.js';
import {
  MEMORY_MAX_BYTES,
  getMemoryMediaType,
  isAllowedMemoryMimeType,
  normalizeMimeType,
} from '../services/uploadPolicy.js';
import {
  deleteObject,
  headObject,
  isMemoryObjectKeyForUser,
  isS3NotFoundError,
} from '../services/imageService.js';
import { signMediaUrl } from '../services/mediaUrlService.js';
import {
  ensureBatchWritable,
  getCurrentBatchMembershipByUserId,
} from '../services/batchService.js';

const router = express.Router();
const profanityFilter = new Filter();

async function getViewerBatch(userId) {
  const membership = await getCurrentBatchMembershipByUserId(userId);
  if (!membership?.batchId) {
    return null;
  }

  const batch = await Batch.findById(membership.batchId).lean();
  return {
    batchId: membership.batchId,
    batch,
  };
}

async function mapMemory(memory, likeCountMap, likedMemoryIds) {
  const id = memory._id.toString();
  const user = memory.userId;
  const [mediaUrl, thumbnailUrl, profilePictureUrl] = await Promise.all([
    signMediaUrl(memory.mediaKey),
    signMediaUrl(memory.thumbnailKey),
    signMediaUrl(user.profilePictureKey),
  ]);

  if (!mediaUrl) {
    return null;
  }

  return {
    id,
    caption: memory.caption,
    media_url: mediaUrl,
    media_type: memory.mediaType,
    thumbnail_url: thumbnailUrl,
    duration_sec: memory.durationSec,
    created_at: memory.createdAt,
    like_count: likeCountMap.get(id) ?? 0,
    has_liked: likedMemoryIds.has(id),
    user: {
      id: user._id,
      full_name: user.fullName,
      profile_picture_url: profilePictureUrl,
    },
  };
}

// GET /api/v1/memories/feed
router.get('/feed', authRequired, async (req, res) => {
  try {
    const viewerBatch = await getViewerBatch(req.user._id);

    if (!viewerBatch?.batchId) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const memories = await Memory.find({ batchId: viewerBatch.batchId })
      .sort({ createdAt: -1 })
      .limit(150)
      .populate('userId', 'fullName profilePictureKey')
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

    const mappedMemories = (
      await Promise.all(
        memories
          .filter((memory) => Boolean(memory.userId))
          .map((memory) => mapMemory(memory, likeCountMap, likedMemoryIds)),
      )
    ).filter((entry) => Boolean(entry));

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
      can_post: !viewerBatch.batch?.isFrozen,
      freeze_date: viewerBatch.batch?.freezeDate ?? null,
    });
  } catch (err) {
    logger.error('Memories route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/memories
router.post('/', authRequired, async (req, res) => {
  let uploadedObjectKey = null;

  try {
    const viewerBatch = await getViewerBatch(req.user._id);

    if (!viewerBatch?.batchId) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const writable = await ensureBatchWritable(viewerBatch.batchId);
    if (!writable.ok) {
      return res.status(writable.status).json({ error: writable.error });
    }

    const objectKey =
      typeof req.body?.object_key === 'string' ? req.body.object_key.trim() : '';
    if (!objectKey) {
      return res.status(400).json({ error: 'object_key is required' });
    }

    if (!isMemoryObjectKeyForUser(objectKey, req.user._id.toString())) {
      return res.status(400).json({ error: 'Invalid memory object key' });
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

    let objectMeta = null;
    try {
      objectMeta = await headObject({ key: objectKey });
    } catch (err) {
      if (isS3NotFoundError(err)) {
        return res.status(400).json({ error: 'Uploaded file not found' });
      }
      throw err;
    }

    const objectContentType = normalizeMimeType(objectMeta.contentType);
    if (!isAllowedMemoryMimeType(objectContentType)) {
      return res.status(400).json({ error: 'Unsupported memory file type' });
    }

    if (
      typeof objectMeta.contentLength === 'number' &&
      objectMeta.contentLength > MEMORY_MAX_BYTES
    ) {
      return res.status(400).json({ error: 'Memory file must be smaller than 25MB.' });
    }

    uploadedObjectKey = objectKey;
    const mediaType = getMemoryMediaType(objectContentType);
    const thumbnailKey = mediaType === 'image' ? objectKey : null;

    const memory = await Memory.create({
      userId: req.user._id,
      batchId: viewerBatch.batchId,
      mediaKey: objectKey,
      mediaType,
      thumbnailKey,
      durationSec: null,
      caption,
    });

    const [mediaUrl, signedThumbnailUrl, profilePictureUrl] = await Promise.all([
      signMediaUrl(memory.mediaKey),
      signMediaUrl(memory.thumbnailKey),
      signMediaUrl(req.user.profilePictureKey),
    ]);
    if (!mediaUrl) {
      throw new Error('Unable to sign memory media URL');
    }

    return res.status(201).json({
      id: memory._id,
      caption: memory.caption,
      media_url: mediaUrl,
      media_type: memory.mediaType,
      thumbnail_url: signedThumbnailUrl,
      duration_sec: memory.durationSec,
      created_at: memory.createdAt,
      like_count: 0,
      has_liked: false,
      user: {
        id: req.user._id,
        full_name: req.user.fullName,
        profile_picture_url: profilePictureUrl,
      },
    });
  } catch (err) {
    if (uploadedObjectKey) {
      await deleteObject(uploadedObjectKey).catch(() => {});
    }

    logger.error('Memories route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/memories/:memoryId/react
router.post('/:memoryId/react', authRequired, async (req, res) => {
  try {
    const { memoryId } = req.params;

    const viewerBatch = await getViewerBatch(req.user._id);

    if (!viewerBatch?.batchId) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const memory = await Memory.findById(memoryId).lean();
    if (!memory || memory.batchId.toString() !== viewerBatch.batchId.toString()) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    if (memory.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot react to your own memory' });
    }

    const writable = await ensureBatchWritable(viewerBatch.batchId);
    if (!writable.ok) {
      return res.status(writable.status).json({ error: writable.error });
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
    logger.error('Memories route failed', { error: err });
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

    const writable = await ensureBatchWritable(memory.batchId);
    if (!writable.ok) {
      return res.status(writable.status).json({ error: writable.error });
    }

    await MemoryReaction.deleteMany({ memoryId: memory._id });
    await memory.deleteOne();

    if (memory.mediaKey) {
      await deleteObject(memory.mediaKey).catch(() => {});
    }

    if (memory.thumbnailKey && memory.thumbnailKey !== memory.mediaKey) {
      await deleteObject(memory.thumbnailKey).catch(() => {});
    }

    return res.json({ message: 'Memory deleted' });
  } catch (err) {
    logger.error('Memories route failed', { error: err });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
