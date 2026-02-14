import { createModel } from '../db/baseModel.js';

export const Like = createModel('Like', {
  defaults: {
    isSuperlike: false,
  },
});
