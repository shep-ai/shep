/**
 * GetRiskTrendUseCase (feature 098, phase 7, task-41).
 *
 * Returns daily-bucketed posture metrics over a configurable window
 * (default 30 days). For each bucket we ask the repository: "how many
 * findings were open at this instant, grouped by canonical severity?"
 *
 * Buckets are aligned to the start of the UTC day so the chart is
 * timezone-stable. The window is anchored to `ISlaClockPort.now()` so
 * tests can pin time.
 */

import { inject, injectable } from 'tsyringe';

import {
  buildTrendBuckets,
  DEFAULT_BUCKET_DAYS,
  DEFAULT_WINDOW_DAYS,
} from '../../../../domain/aspm/posture/build-trend-buckets.js';
import type {
  IFindingRepository,
  PostureTrendBucket,
} from '../../../ports/output/repositories/finding-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface GetRiskTrendInput {
  /** Total window length in days. Default 30. */
  windowDays?: number;
  /** Bucket size in days. Default 1 (daily). */
  bucketSizeDays?: number;
}

export interface GetRiskTrendResult {
  windowDays: number;
  bucketSizeDays: number;
  buckets: PostureTrendBucket[];
}

@injectable()
export class GetRiskTrendUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findings: IFindingRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: GetRiskTrendInput = {}): Promise<GetRiskTrendResult> {
    const windowDays = Math.max(1, input.windowDays ?? DEFAULT_WINDOW_DAYS);
    const bucketSizeDays = Math.max(1, input.bucketSizeDays ?? DEFAULT_BUCKET_DAYS);
    const now = this.clock.now();
    const bucketStarts = buildTrendBuckets({ now, windowDays, bucketSizeDays });
    if (bucketStarts.length === 0) {
      return { windowDays, bucketSizeDays, buckets: [] };
    }
    const buckets = await this.findings.postureTrend(bucketStarts);
    return { windowDays, bucketSizeDays, buckets };
  }
}
