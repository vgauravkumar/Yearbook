import mongoose from 'mongoose';

const MemorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
    cloudinaryPublicId: {
      type: String,
      default: null,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    durationSec: {
      type: Number,
      default: null,
    },
    caption: {
      type: String,
      maxlength: 280,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

MemorySchema.index({ batchId: 1, createdAt: -1 });
MemorySchema.index({ batchId: 1, userId: 1, createdAt: -1 });

export const Memory = mongoose.model('Memory', MemorySchema);
