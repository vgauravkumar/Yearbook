import mongoose from 'mongoose';

const UserBatchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    isPrimary: {
      type: Boolean,
      default: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

UserBatchSchema.index({ userId: 1, batchId: 1 }, { unique: true });
UserBatchSchema.index({ userId: 1 });
UserBatchSchema.index({ batchId: 1 });

export const UserBatch = mongoose.model('UserBatch', UserBatchSchema);

