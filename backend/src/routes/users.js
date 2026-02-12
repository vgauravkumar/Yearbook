import express from 'express';
import { Filter } from 'bad-words';

import { authRequired } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { UserBatch } from '../models/UserBatch.js';
import { Batch } from '../models/Batch.js';
import { Like } from '../models/Like.js';
import { Comment } from '../models/Comment.js';
import { SuperlativeVote } from '../models/SuperlativeVote.js';
import { Superlative } from '../models/Superlative.js';
import multer from 'multer';
import fs from 'fs/promises';
import { uploadProfileImage, deleteImage } from '../services/imageService.js';

const router = express.Router();
const profanityFilter = new Filter();
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Helper to check freeze
async function ensureNotFrozen(batchId) {
  const batch = await Batch.findById(batchId);
  if (!batch) return { frozen: false };
  const now = new Date();
  const isFrozen =
    batch.isFrozen || (batch.freezeDate && now.getTime() > batch.freezeDate.getTime());
  return { frozen: isFrozen, batch };
}

// GET /api/v1/users/me
router.get('/me', authRequired, async (req, res) => {
  try {
    const user = req.user;
    const userBatch = await UserBatch.findOne({ userId: user._id, isPrimary: true })
      .populate('batchId')
      .exec();

    const batch = userBatch?.batchId;

    return res.json({
      id: user._id,
      email: user.email,
      full_name: user.fullName,
      profile_picture_url: user.profilePictureUrl,
      bio: user.bio,
      social_links: user.socialLinks,
      has_completed_onboarding: !!batch,
      batch: batch
        ? {
            id: batch._id,
            institution: '', // can be populated via another query if needed
            graduation_year: batch.graduationYear,
            graduation_month: batch.graduationMonth,
            is_frozen: batch.isFrozen,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    if (err.name === 'ValidationError') {
      const firstKey = Object.keys(err.errors)[0];
      const message =
        err.errors[firstKey]?.message || 'Validation failed for profile update';
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/users/onboard
router.post('/onboard', authRequired, async (req, res) => {
  try {
    const {
      institution_id: institutionIdRaw,
      institution_name: institutionName,
      graduation_year: year,
      graduation_month: month,
    } = req.body;

    if (!year || !month) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let institutionId = institutionIdRaw;

    // If no institution id is provided, create or reuse one from the provided name
    if (!institutionId) {
      if (!institutionName || typeof institutionName !== 'string') {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const trimmedName = institutionName.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      let institution = await Institution.findOne({ name: trimmedName });
      if (!institution) {
        institution = await Institution.create({ name: trimmedName });
      }
      institutionId = institution._id;
    }

    let batch = await Batch.findOne({
      institutionId,
      graduationYear: year,
      graduationMonth: month,
    });

    if (!batch) {
      // Calculate freeze date as last day of graduation month
      const freezeDate = new Date(year, month, 0);
      batch = await Batch.create({
        institutionId,
        graduationYear: year,
        graduationMonth: month,
        freezeDate,
      });
    }

    await UserBatch.findOneAndUpdate(
      { userId: req.user._id, batchId: batch._id },
      { isPrimary: true },
      { upsert: true, new: true },
    );

    return res.json({
      batch_id: batch._id,
      graduation_year: batch.graduationYear,
      graduation_month: batch.graduationMonth,
      freeze_date: batch.freezeDate,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/users/me
router.put('/me', authRequired, async (req, res) => {
  try {
    const user = req.user;
    const userBatch = await UserBatch.findOne({ userId: user._id, isPrimary: true });
    if (userBatch) {
      const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
      if (frozen) {
        return res.status(403).json({
          error: 'Profile editing disabled after freeze date',
          freeze_date: batch.freezeDate,
        });
      }
    }

    const { full_name: fullName, bio, social_links: socialLinks } = req.body;

    if (bio && profanityFilter.isProfane(bio)) {
      return res.status(400).json({
        error: 'Content contains inappropriate language',
      });
    }

    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (socialLinks) {
      user.socialLinks = {
        ...user.socialLinks,
        ...socialLinks,
      };
    }

    await user.save();

    return res.json({
      id: user._id,
      full_name: user.fullName,
      bio: user.bio,
      social_links: user.socialLinks,
      updated_at: user.updatedAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/users/:userId/like
router.post('/:userId/like', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_superlike } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot like your own profile' });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userBatch = await UserBatch.findOne({ userId: req.user._id, isPrimary: true });
    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }

    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Interactions disabled after freeze date',
        freeze_date: batch.freezeDate,
      });
    }

    const existing = await Like.findOne({
      fromUserId: req.user._id,
      toUserId: userId,
      isSuperlike: !!is_superlike,
    });

    if (existing) {
      await existing.deleteOne();
    } else {
      await Like.create({
        fromUserId: req.user._id,
        toUserId: userId,
        isSuperlike: !!is_superlike,
      });
    }

    const [likeCount, superlikeCount] = await Promise.all([
      Like.countDocuments({ toUserId: userId, isSuperlike: false }),
      Like.countDocuments({ toUserId: userId, isSuperlike: true }),
    ]);

    return res.json({
      message: existing
        ? is_superlike
          ? 'Superlike removed'
          : 'Like removed'
        : is_superlike
        ? 'Superlike added'
        : 'Like added',
      like_count: likeCount,
      superlike_count: superlikeCount,
      is_superlike: !!is_superlike,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/users/:userId/comments
router.post('/:userId/comments', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'Content too long' });
    }
    if (profanityFilter.isProfane(content)) {
      return res.status(400).json({
        error: 'Content contains inappropriate language',
      });
    }

    const userBatch = await UserBatch.findOne({ userId: req.user._id, isPrimary: true });
    if (!userBatch) {
      return res.status(400).json({ error: 'User not onboarded' });
    }
    const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
    if (frozen) {
      return res.status(403).json({
        error: 'Commenting disabled after freeze date',
        freeze_date: batch.freezeDate,
      });
    }

    const comment = await Comment.create({
      fromUserId: req.user._id,
      toUserId: userId,
      content,
      isVisible: false,
    });

    return res.status(201).json({
      id: comment._id,
      content: comment.content,
      from_user: {
        id: req.user._id,
        full_name: req.user.fullName,
      },
      created_at: comment.createdAt,
      is_visible: comment.isVisible,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/v1/users/me/comments/visibility
router.patch('/me/comments/visibility', authRequired, async (req, res) => {
  try {
    const { is_visible: isVisible } = req.body;
    if (typeof isVisible !== 'boolean') {
      return res.status(400).json({ error: 'is_visible must be a boolean' });
    }

    await Comment.updateMany(
      { toUserId: req.user._id },
      { $set: { isVisible } },
    );

    const visibleCount = await Comment.countDocuments({
      toUserId: req.user._id,
      isVisible: true,
    });

    return res.json({
      message: 'Comment visibility updated',
      visible_count: visibleCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/users/me/profile-picture
router.post(
  '/me/profile-picture',
  authRequired,
  upload.single('file'),
  async (req, res) => {
    try {
      const user = req.user;
      const userBatch = await UserBatch.findOne({
        userId: user._id,
        isPrimary: true,
      });
      if (userBatch) {
        const { frozen, batch } = await ensureNotFrozen(userBatch.batchId);
        if (frozen) {
          return res.status(403).json({
            error: 'Profile editing disabled after freeze date',
            freeze_date: batch.freezeDate,
          });
        }
      }

      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }

      const uploadResult = await uploadProfileImage(req.file.path, user._id);

      // Clean up local temp file
      await fs.unlink(req.file.path).catch(() => {});

      if (user.cloudinaryPublicId && user.cloudinaryPublicId !== uploadResult.public_id) {
        await deleteImage(user.cloudinaryPublicId);
      }

      user.profilePictureUrl = uploadResult.secure_url;
      user.cloudinaryPublicId = uploadResult.public_id;
      await user.save();

      return res.json({
        profile_picture_url: user.profilePictureUrl,
        cloudinary_public_id: user.cloudinaryPublicId,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/v1/users/:userId
router.get('/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isOwner = req.user._id.toString() === userId;

    const [likeCount, superlikeCount] = await Promise.all([
      Like.countDocuments({ toUserId: userId, isSuperlike: false }),
      Like.countDocuments({ toUserId: userId, isSuperlike: true }),
    ]);

    const commentFilter = { toUserId: userId };
    if (!isOwner) {
      // non-owners can only see comments that the profile owner has marked visible
      // (public comments)
      // @ts-ignore runtime only
      commentFilter.isVisible = true;
    }

    const comments = await Comment.find(commentFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('fromUserId', 'fullName profilePictureUrl')
      .lean();

    const superlatives = await Superlative.find({ isActive: true }).lean();
    const votes = await SuperlativeVote.aggregate([
      { $match: { toUserId: user._id } },
      {
        $group: {
          _id: '$superlativeId',
          count: { $sum: 1 },
        },
      },
    ]);
    const supById = new Map(
      superlatives.map((s) => [s._id.toString(), s]),
    );
    const supList = votes.map((v) => {
      const s = supById.get(v._id.toString());
      return {
        id: v._id,
        name: s?.name ?? 'Unknown',
        vote_count: v.count,
      };
    });

    const hasLiked = await Like.exists({
      fromUserId: req.user._id,
      toUserId: userId,
      isSuperlike: false,
    });
    const hasSuperliked = await Like.exists({
      fromUserId: req.user._id,
      toUserId: userId,
      isSuperlike: true,
    });

    return res.json({
      id: user._id,
      full_name: user.fullName,
      profile_picture_url: user.profilePictureUrl,
      bio: user.bio,
      social_links: user.socialLinks,
      like_count: likeCount,
      superlike_count: superlikeCount,
      superlatives: supList,
      comments: comments.map((c) => ({
        id: c._id,
        from_user: {
          id: c.fromUserId._id,
          full_name: c.fromUserId.fullName,
          profile_picture_url: c.fromUserId.profilePictureUrl,
        },
        content: c.content,
        created_at: c.createdAt,
        is_visible: c.isVisible,
      })),
      is_owner: isOwner,
      current_user_interactions: {
        has_liked: !!hasLiked,
        has_superliked: !!hasSuperliked,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

