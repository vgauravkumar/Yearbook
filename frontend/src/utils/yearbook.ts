export type BatchInfo = {
  institution_name?: string;
  graduation_year: number;
  graduation_month: string;
  freeze_date?: string | null;
  member_count?: number;
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
  if (batch.freeze_date) {
    const parsed = new Date(batch.freeze_date);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const monthIndex = MONTH_NAMES.findIndex(
    (monthName) => monthName.toLowerCase() === batch.graduation_month.toLowerCase(),
  );
  if (monthIndex < 0) return null;
  return new Date(Date.UTC(batch.graduation_year, monthIndex + 1, 0, 23, 59, 59, 0));
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
  const monthName = batch.graduation_month || 'Unknown Month';
  if (batch.institution_name) {
    return `${batch.institution_name} · ${monthName} ${batch.graduation_year}`;
  }
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
