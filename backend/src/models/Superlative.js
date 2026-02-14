import { createModel } from '../db/baseModel.js';

export const Superlative = createModel('Superlative', {
  defaults: {
    description: '',
    iconUrl: null,
    isActive: true,
    maxVotesPerUser: 3,
  },
});
