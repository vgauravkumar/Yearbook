import { createModel } from '../db/baseModel.js';

export const Memory = createModel('Memory', {
  defaults: {
    thumbnailKey: null,
    durationSec: null,
    caption: '',
  },
  populates: {
    userId: { model: 'User' },
  },
});
