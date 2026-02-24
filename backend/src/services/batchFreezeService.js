import { Batch } from '../models/Batch.js';
import { logger } from '../utils/logger.js';

let freezeTimer = null;

function getNextFreezeRunAt(now = new Date()) {
  const nextRun = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      5,
      0,
      0,
    ),
  );

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }

  return nextRun;
}

export async function runBatchFreezeJob(runAt = new Date()) {
  const candidates = await Batch.find({ isFrozen: false });
  let frozenCount = 0;

  for (const batch of candidates) {
    if (!batch.freezeDate) {
      continue;
    }

    const freezeDate = new Date(batch.freezeDate);
    if (Number.isNaN(freezeDate.getTime())) {
      continue;
    }

    if (freezeDate.getTime() > runAt.getTime()) {
      continue;
    }

    batch.isFrozen = true;
    await batch.save();
    frozenCount += 1;

    logger.info('Batch frozen by scheduler', {
      batchId: batch._id,
      institutionName: batch.institutionName,
      graduationMonth: batch.graduationMonth,
      graduationYear: batch.graduationYear,
      freezeDate: batch.freezeDate,
    });
  }

  logger.info('Batch freeze scheduler pass complete', {
    frozenCount,
    checkedAt: runAt.toISOString(),
  });

  return frozenCount;
}

export function scheduleBatchFreezeJob() {
  if (freezeTimer) {
    clearTimeout(freezeTimer);
    freezeTimer = null;
  }

  const scheduleNext = () => {
    const now = new Date();
    const nextRun = getNextFreezeRunAt(now);
    const delayMs = Math.max(nextRun.getTime() - now.getTime(), 1_000);

    freezeTimer = setTimeout(async () => {
      try {
        await runBatchFreezeJob(new Date());
      } catch (error) {
        logger.error('Batch freeze scheduler failed', { error });
      } finally {
        scheduleNext();
      }
    }, delayMs);

    logger.info('Batch freeze scheduler armed', {
      nextRunAt: nextRun.toISOString(),
    });
  };

  scheduleNext();
}
