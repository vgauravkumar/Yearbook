import { createModel } from '../db/baseModel.js';

export const Batch = createModel('Batch', {
  defaults: {
    memberCount: 0,
    isFrozen: false,
  },
});
