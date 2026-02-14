import { createModel } from '../db/baseModel.js';

export const UserBatch = createModel('UserBatch', {
  defaults: {
    isPrimary: true,
  },
  populates: {
    batchId: { model: 'Batch' },
  },
});
