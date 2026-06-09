/**
 * GetPostureSummaryUseCase (feature 098, phase 7, task-40).
 *
 * Returns the dashboard's headline posture numbers in a single call:
 *
 *   - openBySeverity        — open finding counts grouped by canonical severity
 *   - topAtRiskApplications — N apps ordered by risk-score sum
 *   - kevOpenCount          — open findings whose CVE is KEV-listed
 *   - slaBreachCount        — open findings past their SLA window (excluding
 *                              findings with an active exception)
 *   - exceptionCount        — count of currently-active risk exceptions
 *   - aiReviewQueueDepth    — count of open AI-change signals (0 until phase 8
 *                              wires the AI-signal repository)
 *   - lastIngestedAt        — most-recent `lastSeenAt` across all findings
 *
 * All aggregation lives in the repository so the NFR-7 budget (<1s on a
 * 50k-finding dataset) is preserved.
 */

import { inject, injectable } from 'tsyringe';

import { CanonicalSeverity, RiskExceptionStatus } from '../../../../domain/generated/output.js';
import type {
  AtRiskApplication,
  IFindingRepository,
  SeverityCount,
  SlaBreachThreshold,
} from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IRiskExceptionRepository } from '../../../ports/output/repositories/risk-exception-repository.interface.js';
import type { ISecurityPolicyRepository } from '../../../ports/output/repositories/security-policy-repository.interface.js';
import type { IAiChangeRiskSignalRepository } from '../../../ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

export interface GetPostureSummaryInput {
  /** Override top-N applications cap. Defaults to 5. */
  topAtRiskLimit?: number;
}

export interface PostureSummary {
  openBySeverity: SeverityCount[];
  topAtRiskApplications: AtRiskApplication[];
  kevOpenCount: number;
  slaBreachCount: number;
  exceptionCount: number;
  aiReviewQueueDepth: number;
  lastIngestedAt: Date | null;
}

const DEFAULT_TOP_LIMIT = 5;

@injectable()
export class GetPostureSummaryUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findings: IFindingRepository,
    @inject('IRiskExceptionRepository') private readonly exceptions: IRiskExceptionRepository,
    @inject('ISecurityPolicyRepository') private readonly policies: ISecurityPolicyRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort,
    // Phase 7 wires a NoOp `IAiChangeRiskSignalRepository` (returns 0).
    // Phase 8 will replace the registration with the real SQLite repo
    // backed by the ai_change_risk_signals table.
    @inject('IAiChangeRiskSignalRepository')
    private readonly aiSignalRepo: IAiChangeRiskSignalRepository
  ) {}

  async execute(input: GetPostureSummaryInput = {}): Promise<PostureSummary> {
    const topLimit = Math.max(1, input.topAtRiskLimit ?? DEFAULT_TOP_LIMIT);
    const now = this.clock.now();

    const policy = await this.policies.findActive();
    const thresholds: SlaBreachThreshold[] = policy
      ? policy.slaWindows
          .filter((w) => w.severity !== CanonicalSeverity.Info)
          .map((w) => ({ severity: w.severity, windowDays: w.windowDays }))
      : [];

    const activeExceptions = await this.exceptions.listByStatus([RiskExceptionStatus.Active]);
    const exceptedFindingIds = activeExceptions.map((e) => e.findingId);

    const [
      openBySeverity,
      topAtRiskApplications,
      kevOpenCount,
      slaBreachCount,
      lastIngestedAt,
      aiReviewQueueDepth,
    ] = await Promise.all([
      this.findings.countOpenBySeverity(),
      this.findings.topAtRiskApplications(topLimit),
      this.findings.countOpenKev(),
      thresholds.length === 0
        ? Promise.resolve(0)
        : this.findings.countSlaBreached(thresholds, now, exceptedFindingIds),
      this.findings.latestLastSeenAt(),
      this.aiSignalRepo.countOpen(),
    ]);

    return {
      openBySeverity,
      topAtRiskApplications,
      kevOpenCount,
      slaBreachCount,
      exceptionCount: activeExceptions.length,
      aiReviewQueueDepth,
      lastIngestedAt,
    };
  }
}
