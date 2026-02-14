import { createModel } from '../db/baseModel.js';

export const User = createModel('User', {
  defaults: {
    profilePictureKey: null,
    bio: '',
    socialLinks: {},
    isVerified: false,
    isActive: true,
  },
});
