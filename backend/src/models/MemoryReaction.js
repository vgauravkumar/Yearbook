import mongoose from 'mongoose';

const MemoryReactionSchema = new mongoose.Schema(
  {
    memoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Memory',
      required: true,
      index: true,
    },
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

MemoryReactionSchema.index(
  { memoryId: 1, fromUserId: 1 },
  { unique: true },
);

export const MemoryReaction = mongoose.model('MemoryReaction', MemoryReactionSchema);
