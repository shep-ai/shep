/**
 * Telemetry delivery rules (spec 133): retry backoff, batch limits and the
 * duration buckets events report instead of exact durations.
 */

/** A batch that fails this many sends is dropped. */
export const TELEMETRY_MAX_SEND_ATTEMPTS = 5;
/** Events sent per request. */
export const TELEMETRY_BATCH_SIZE = 20;
/** The outbox keeps at most this many events; the oldest are trimmed first. */
export const TELEMETRY_OUTBOX_CAP = 5_000;
/** The install heartbeat is recorded at most once per this interval. */
export const TELEMETRY_HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 300_000;

/**
 * Delay before the next send after `failures` consecutive failed sends. The
 * ceiling doubles from 2s up to 5 minutes and the delay is a random point in
 * its upper half, so many installs recovering together do not send in step.
 * `random` is in [0, 1).
 */
export function telemetryRetryDelayMs(failures: number, random: number): number {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (failures - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Upper bounds (exclusive) and labels, in ascending order. */
const DURATION_BUCKETS = [
  [MINUTE_MS, 'under-1m'],
  [5 * MINUTE_MS, '1-5m'],
  [15 * MINUTE_MS, '5-15m'],
  [HOUR_MS, '15-60m'],
  [4 * HOUR_MS, '1-4h'],
] as const;

const OVER_LAST_BUCKET = 'over-4h';
const UNKNOWN_DURATION = 'unknown';

export type DurationBucket =
  | (typeof DURATION_BUCKETS)[number][1]
  | typeof OVER_LAST_BUCKET
  | typeof UNKNOWN_DURATION;

/** Bucket a duration so events never carry an exact timing fingerprint. */
export function toDurationBucket(ms: number): DurationBucket {
  if (!Number.isFinite(ms) || ms < 0) return UNKNOWN_DURATION;
  for (const [upperBound, label] of DURATION_BUCKETS) {
    if (ms < upperBound) return label;
  }
  return OVER_LAST_BUCKET;
}
