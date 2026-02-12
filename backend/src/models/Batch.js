import mongoose from 'mongoose';

const BatchSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
    },
    graduationYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2050,
    },
    graduationMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      default: 6,
    },
    freezeDate: {
      type: Date,
      required: true,
    },
    isFrozen: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

BatchSchema.index(
  { institutionId: 1, graduationYear: 1, graduationMonth: 1 },
  { unique: true },
);
BatchSchema.index({ freezeDate: 1 });

// Note: freezeDate is now set explicitly in the onboarding route when creating
// a new Batch, so we don't need a pre-save hook here. Keeping the logic in one
// place avoids confusion with Mongoose's async middleware API.

export const Batch = mongoose.model('Batch', BatchSchema);

