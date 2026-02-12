import mongoose from 'mongoose';

const SuperlativeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: '',
    },
    iconUrl: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    maxVotesPerUser: {
      type: Number,
      default: 3,
    },
  },
  {
    timestamps: true,
  },
);

SuperlativeSchema.index({ name: 1 });
SuperlativeSchema.index({ isActive: 1 });

export const Superlative = mongoose.model('Superlative', SuperlativeSchema);

