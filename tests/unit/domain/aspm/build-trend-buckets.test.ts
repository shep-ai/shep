/**
 * buildTrendBuckets domain helper tests (feature 098, phase 7, task-41).
 */

import { describe, expect, it } from 'vitest';

import { buildTrendBuckets, toUtcDayStart } from '@/domain/aspm/posture/build-trend-buckets.js';

describe('buildTrendBuckets', () => {
  it('returns exactly windowDays/bucketSize buckets', () => {
    const buckets = buildTrendBuckets({
      now: new Date('2026-05-19T15:30:00.000Z'),
      windowDays: 7,
      bucketSizeDays: 1,
    });
    expect(buckets).toHaveLength(7);
  });

  it('aligns all buckets to 00:00 UTC', () => {
    const buckets = buildTrendBuckets({
      now: new Date('2026-05-19T23:59:59.999Z'),
      windowDays: 3,
    });
    for (const b of buckets) {
      expect(b.toISOString()).toMatch(/T00:00:00\.000Z$/);
    }
  });

  it('returns oldest bucket first', () => {
    const buckets = buildTrendBuckets({
      now: new Date('2026-05-19T00:00:00.000Z'),
      windowDays: 3,
    });
    expect(buckets[0].toISOString()).toBe('2026-05-17T00:00:00.000Z');
    expect(buckets[1].toISOString()).toBe('2026-05-18T00:00:00.000Z');
    expect(buckets[2].toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });

  it('clamps invalid input to safe minimums', () => {
    const buckets = buildTrendBuckets({
      now: new Date('2026-05-19T00:00:00.000Z'),
      windowDays: 0,
      bucketSizeDays: 0,
    });
    expect(buckets).toHaveLength(1);
  });

  it('returns an empty array when bucketSize > windowDays', () => {
    const buckets = buildTrendBuckets({
      now: new Date('2026-05-19T00:00:00.000Z'),
      windowDays: 1,
      bucketSizeDays: 7,
    });
    expect(buckets).toEqual([]);
  });

  it('toUtcDayStart preserves the UTC date but strips time', () => {
    expect(toUtcDayStart(new Date('2026-05-19T15:42:11.111Z')).toISOString()).toBe(
      '2026-05-19T00:00:00.000Z'
    );
  });
});
