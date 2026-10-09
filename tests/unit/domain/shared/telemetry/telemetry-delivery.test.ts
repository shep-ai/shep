import { describe, it, expect } from 'vitest';
import {
  TELEMETRY_MAX_SEND_ATTEMPTS,
  telemetryRetryDelayMs,
  toDurationBucket,
} from '@/domain/shared/telemetry/telemetry-delivery.js';

describe('telemetryRetryDelayMs', () => {
  it('waits in the upper half of a 2s ceiling after the first failure', () => {
    expect(telemetryRetryDelayMs(1, 0)).toBe(1_000);
    expect(telemetryRetryDelayMs(1, 0.999_999)).toBe(2_000);
  });

  it('doubles the ceiling with each failure', () => {
    expect(telemetryRetryDelayMs(2, 0)).toBe(2_000);
    expect(telemetryRetryDelayMs(3, 0)).toBe(4_000);
  });

  it('caps the ceiling at five minutes', () => {
    expect(telemetryRetryDelayMs(30, 0.999_999)).toBe(300_000);
  });

  it('drops a batch after five attempts', () => {
    expect(TELEMETRY_MAX_SEND_ATTEMPTS).toBe(5);
  });
});

describe('toDurationBucket', () => {
  it.each([
    [0, 'under-1m'],
    [59_999, 'under-1m'],
    [60_000, '1-5m'],
    [5 * 60_000, '5-15m'],
    [15 * 60_000, '15-60m'],
    [60 * 60_000, '1-4h'],
    [4 * 60 * 60_000, 'over-4h'],
  ])('%i ms falls in %s', (ms, bucket) => {
    expect(toDurationBucket(ms)).toBe(bucket);
  });

  it('treats a negative or non-finite duration as unknown', () => {
    expect(toDurationBucket(-1)).toBe('unknown');
    expect(toDurationBucket(Number.NaN)).toBe('unknown');
  });
});
