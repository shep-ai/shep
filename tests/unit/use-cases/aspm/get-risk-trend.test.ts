/**
 * GetRiskTrendUseCase unit tests (feature 098, phase 7, task-41).
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { GetRiskTrendUseCase } from '@/application/use-cases/aspm/posture/get-risk-trend.js';
import { CanonicalSeverity } from '@/domain/generated/output.js';
import type {
  IFindingRepository,
  PostureTrendBucket,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const FIXED_NOW = new Date('2026-05-19T12:34:56.000Z');

function fakeRepo(handler: (buckets: readonly Date[]) => PostureTrendBucket[]): IFindingRepository {
  return {
    postureTrend: async (buckets: readonly Date[]) => handler(buckets),
  } as unknown as IFindingRepository;
}

describe('GetRiskTrendUseCase', () => {
  it('builds 30 UTC-aligned daily buckets by default', async () => {
    let observed: readonly Date[] | null = null;
    const uc = new GetRiskTrendUseCase(
      fakeRepo((buckets) => {
        observed = buckets;
        return buckets.map((b) => ({
          bucketStart: b,
          countsBySeverity: [{ severity: CanonicalSeverity.Critical, count: 1 }],
        }));
      }),
      new FakeSlaClock(FIXED_NOW)
    );
    const result = await uc.execute();
    expect(result.windowDays).toBe(30);
    expect(result.bucketSizeDays).toBe(1);
    expect(observed).not.toBeNull();
    expect(observed!.length).toBe(30);
    // All bucket starts must be at UTC midnight.
    for (const b of observed!) {
      expect(b.getUTCHours()).toBe(0);
      expect(b.getUTCMinutes()).toBe(0);
      expect(b.getUTCSeconds()).toBe(0);
      expect(b.getUTCMilliseconds()).toBe(0);
    }
    // Last bucket is the UTC start of "today".
    const last = observed![observed!.length - 1];
    expect(last.toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });

  it('honors a custom window and bucket size', async () => {
    let observed: readonly Date[] | null = null;
    const uc = new GetRiskTrendUseCase(
      fakeRepo((buckets) => {
        observed = buckets;
        return [];
      }),
      new FakeSlaClock(FIXED_NOW)
    );
    const result = await uc.execute({ windowDays: 14, bucketSizeDays: 7 });
    expect(result.windowDays).toBe(14);
    expect(result.bucketSizeDays).toBe(7);
    expect(observed!.length).toBe(2);
  });

  it('returns an empty buckets array when the window resolves to zero', async () => {
    const uc = new GetRiskTrendUseCase(
      fakeRepo(() => {
        throw new Error('postureTrend should not be called for empty buckets');
      }),
      new FakeSlaClock(FIXED_NOW)
    );
    // bucketSize=999 with window=1 → floor(1/999) = 0 → no buckets
    const result = await uc.execute({ windowDays: 1, bucketSizeDays: 999 });
    expect(result.buckets).toEqual([]);
  });
});
