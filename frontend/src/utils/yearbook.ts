export type BatchInfo = {
  graduation_year: number;
  graduation_month: number;
  is_frozen?: boolean;
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function getBatchFreezeDate(batch: BatchInfo | null): Date | null {
  if (!batch) return null;
  return new Date(batch.graduation_year, batch.graduation_month, 0);
}

export function isBatchFrozen(batch: BatchInfo | null): boolean {
  if (!batch) return false;
  if (batch.is_frozen) return true;
  const freezeDate = getBatchFreezeDate(batch);
  if (!freezeDate) return false;
  return Date.now() > freezeDate.getTime();
}

export function formatBatchLabel(batch: BatchInfo | null): string {
  if (!batch) return 'No batch selected';
  const monthName = MONTH_NAMES[batch.graduation_month - 1] ?? 'Unknown Month';
  return `${monthName} ${batch.graduation_year}`;
}

export function formatFreezeDate(batch: BatchInfo | null): string {
  const freezeDate = getBatchFreezeDate(batch);
  if (!freezeDate) return 'Unknown';
  return freezeDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
