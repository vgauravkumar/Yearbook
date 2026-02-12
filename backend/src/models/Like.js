import mongoose from 'mongoose';

const LikeSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isSuperlike: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

LikeSchema.index(
  { fromUserId: 1, toUserId: 1, isSuperlike: 1 },
  { unique: true },
);
LikeSchema.index({ toUserId: 1 });
LikeSchema.index({ fromUserId: 1 });

export const Like = mongoose.model('Like', LikeSchema);

