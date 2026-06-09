/**
 * Pure-domain helper: build a list of daily-aligned UTC bucket starts for
 * the posture risk-trend chart (feature 098, phase 7, task-41).
 *
 * Buckets are aligned to 00:00 UTC so the chart is stable across
 * timezones. `windowDays = 30` + `bucketSizeDays = 1` (the default)
 * yields 30 daily buckets ending at the UTC start of "today" relative to
 * the supplied `now`.
 *
 * Returned in ascending order (oldest first).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TrendBucketOptions {
  /** Reference instant. Bucket sequence ends at the UTC start of this day. */
  now: Date;
  /** Total window length in days. Must be >=1. */
  windowDays?: number;
  /** Bucket size in days. Must be >=1. */
  bucketSizeDays?: number;
}

export const DEFAULT_WINDOW_DAYS = 30;
export const DEFAULT_BUCKET_DAYS = 1;

/**
 * Truncate a Date to the start of its UTC day (00:00:00.000 UTC).
 */
export function toUtcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function buildTrendBuckets(options: TrendBucketOptions): Date[] {
  const windowDays = Math.max(1, options.windowDays ?? DEFAULT_WINDOW_DAYS);
  const bucketDays = Math.max(1, options.bucketSizeDays ?? DEFAULT_BUCKET_DAYS);
  const end = toUtcDayStart(options.now);
  const count = Math.floor(windowDays / bucketDays);
  const buckets: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    buckets.push(new Date(end.getTime() - i * bucketDays * MS_PER_DAY));
  }
  return buckets;
}
