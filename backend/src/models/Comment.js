import { createModel } from '../db/baseModel.js';

export const Comment = createModel('Comment', {
  defaults: {
    isVisible: false,
  },
  populates: {
    fromUserId: { model: 'User' },
  },
});
