import mongoose from 'mongoose';

const InstitutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

InstitutionSchema.index({ name: 'text' });

export const Institution = mongoose.model('Institution', InstitutionSchema);

