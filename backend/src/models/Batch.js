import { createModel } from '../db/baseModel.js';

export const Batch = createModel('Batch', {
  defaults: {
    isFrozen: false,
  },
});
