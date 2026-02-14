import mongoose from 'mongoose';

const SocialLinksSchema = new mongoose.Schema(
  {
    instagram: {
      type: String,
      default: null,
      validate: {
        validator: (v) =>
          !v || /^https?:\/\/(www\.)?instagram\.com\/.+/i.test(v),
      },
    },
    linkedin: {
      type: String,
      default: null,
      validate: {
        validator: (v) =>
          !v || /^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(v),
      },
    },
    otherLinks: [
      {
        label: {
          type: String,
          maxlength: 50,
        },
        url: {
          type: String,
          validate: {
            validator: (v) => /^https?:\/\/.+/i.test(v),
          },
        },
      },
    ],
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    profilePictureKey: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 200,
      default: '',
    },
    socialLinks: {
      type: SocialLinksSchema,
      default: () => ({}),
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
  },
);

UserSchema.index({ email: 1 });
UserSchema.index({ fullName: 'text' });

export const User = mongoose.model('User', UserSchema);
