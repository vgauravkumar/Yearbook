import { createModel } from '../db/baseModel.js';

export const Institution = createModel('Institution', {
  defaults: {
    isVerified: false,
  },
});
