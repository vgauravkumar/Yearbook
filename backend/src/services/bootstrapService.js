import { Superlative } from '../models/Superlative.js';
import { Like } from '../models/Like.js';

const DEFAULT_SUPERLATIVES = [
  {
    name: 'Student of the Year',
    description: 'The one everyone counts on for excellence.',
    maxVotesPerUser: 3,
  },
  {
    name: 'Nerd of the Year',
    description: 'Always curious, always learning.',
    maxVotesPerUser: 3,
  },
  {
    name: 'The Wildcard',
    description: 'Unexpected, unforgettable, unstoppable energy.',
    maxVotesPerUser: 3,
  },
];

export async function ensureDefaultSuperlatives() {
  for (const defaults of DEFAULT_SUPERLATIVES) {
    await Superlative.updateOne(
      { name: defaults.name },
      {
        $setOnInsert: {
          name: defaults.name,
          description: defaults.description,
          maxVotesPerUser: defaults.maxVotesPerUser,
          isActive: true,
        },
      },
      { upsert: true },
    );
  }
}

export async function enforceSingleProfileReaction() {
  const duplicateGroups = await Like.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          fromUserId: '$fromUserId',
          toUserId: '$toUserId',
        },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let deletedCount = 0;

  for (const group of duplicateGroups) {
    const [, ...staleIds] = group.ids;
    if (staleIds.length === 0) continue;

    const result = await Like.deleteMany({
      _id: { $in: staleIds },
    });
    deletedCount += result.deletedCount ?? 0;
  }

  return deletedCount;
}
