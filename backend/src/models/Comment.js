import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema(
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
    content: {
      type: String,
      required: true,
      maxlength: 500,
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

CommentSchema.index({ toUserId: 1 });
CommentSchema.index({ fromUserId: 1 });

export const Comment = mongoose.model('Comment', CommentSchema);

