import mongoose from 'mongoose';

const SuperlativeVoteSchema = new mongoose.Schema(
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
    superlativeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Superlative',
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

SuperlativeVoteSchema.index({ toUserId: 1, superlativeId: 1 });
SuperlativeVoteSchema.index({ fromUserId: 1, superlativeId: 1 });
SuperlativeVoteSchema.index({ batchId: 1 });

export const SuperlativeVote = mongoose.model(
  'SuperlativeVote',
  SuperlativeVoteSchema,
);

