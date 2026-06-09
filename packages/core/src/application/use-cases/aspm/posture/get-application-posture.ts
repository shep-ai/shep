/**
 * GetApplicationPostureUseCase (feature 098, phase 7, task-41).
 *
 * Per-Application posture used by the Application detail "ASPM" section
 * (task-46) and the dashboard's drill-in.
 *
 *   - openBySeverity    — counts grouped by canonical severity
 *   - topFindings       — top 10 findings by current RiskScore total
 *   - lastIngestedAt    — most-recent `lastSeenAt` across this app's findings
 *   - sparkline         — daily-bucketed open-finding counts over the window
 */

import { inject, injectable } from 'tsyringe';

import {
  buildTrendBuckets,
  DEFAULT_BUCKET_DAYS,
  DEFAULT_WINDOW_DAYS,
} from '../../../../domain/aspm/posture/build-trend-buckets.js';
import { ApplicationNotFoundError } from '../../../../domain/aspm/errors/application-not-found.error.js';
import type {
  IFindingRepository,
  PostureTrendBucket,
  SeverityCount,
} from '../../../ports/output/repositories/finding-repository.interface.js';
import type { RankedFinding } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface GetApplicationPostureInput {
  applicationId: string;
  /** Default 10. */
  topFindingsLimit?: number;
  /** Default 30. */
  trendWindowDays?: number;
}

export interface GetApplicationPostureResult {
  applicationId: string;
  openBySeverity: SeverityCount[];
  topFindings: RankedFinding[];
  sparkline: PostureTrendBucket[];
}

const DEFAULT_TOP_FINDINGS = 10;

@injectable()
export class GetApplicationPostureUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findings: IFindingRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: GetApplicationPostureInput): Promise<GetApplicationPostureResult> {
    const application = await this.applications.findById(input.applicationId);
    if (application === null) throw new ApplicationNotFoundError(input.applicationId);

    const topLimit = Math.max(1, input.topFindingsLimit ?? DEFAULT_TOP_FINDINGS);
    const windowDays = Math.max(1, input.trendWindowDays ?? DEFAULT_WINDOW_DAYS);

    const now = this.clock.now();
    const bucketStarts = buildTrendBuckets({
      now,
      windowDays,
      bucketSizeDays: DEFAULT_BUCKET_DAYS,
    });

    const [openBySeverity, ranked, sparkline] = await Promise.all([
      this.findings.countOpenBySeverityForApplication(input.applicationId),
      this.findings.listRanked(
        { applicationIds: [input.applicationId] },
        { offset: 0, limit: topLimit }
      ),
      bucketStarts.length === 0
        ? Promise.resolve<PostureTrendBucket[]>([])
        : this.findings.postureTrend(bucketStarts),
    ]);

    return {
      applicationId: input.applicationId,
      openBySeverity,
      topFindings: ranked.items,
      sparkline,
    };
  }
}
