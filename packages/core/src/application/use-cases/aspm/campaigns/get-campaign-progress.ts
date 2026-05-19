/**
 * GetCampaignProgressUseCase (feature 098, phase 6, task-38).
 *
 * Re-runs the campaign's targetQuery via the finding repository, then
 * delegates to the pure-domain `countCampaignProgress` helper to compute
 * (total, closed, atRisk, blocked) — see FR-17, research decision 9.
 *
 * No Finding↔Campaign join table is involved: campaign membership is
 * computed at read time from the serialized FindingFilter.
 */

import { inject, injectable } from 'tsyringe';
import type { SecurityFinding } from '../../../../domain/generated/output.js';
import {
  countCampaignProgress,
  type CampaignProgress,
} from '../../../../domain/aspm/campaigns/count-progress.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IRemediationCampaignRepository } from '../../../ports/output/repositories/remediation-campaign-repository.interface.js';
import type { ISecurityPolicyRepository } from '../../../ports/output/repositories/security-policy-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

/** Upper bound on per-call membership scan size — protects NFR-7 latency. */
export const CAMPAIGN_PROGRESS_MAX_FINDINGS = 5_000;

export interface GetCampaignProgressInput {
  campaignId: string;
}

export interface GetCampaignProgressResult {
  campaignId: string;
  progress: CampaignProgress;
  /** True when the count was capped at CAMPAIGN_PROGRESS_MAX_FINDINGS. */
  truncated: boolean;
}

@injectable()
export class GetCampaignProgressUseCase {
  constructor(
    @inject('IRemediationCampaignRepository')
    private readonly campaignRepo: IRemediationCampaignRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('ISecurityPolicyRepository')
    private readonly policyRepo: ISecurityPolicyRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: GetCampaignProgressInput): Promise<GetCampaignProgressResult> {
    const campaign = await this.campaignRepo.findById(input.campaignId);
    if (campaign === null) {
      throw new Error(`RemediationCampaign ${input.campaignId} not found`);
    }

    const policy = await this.policyRepo.findActive();
    if (policy === null) {
      throw new Error('No active SecurityPolicy — migration 111 should seed one');
    }

    const findings: SecurityFinding[] = [];
    let offset = 0;
    const pageSize = 500;
    let truncated = false;
    while (true) {
      const page = await this.findingRepo.list(campaign.targetQuery, {
        offset,
        limit: pageSize,
      });
      findings.push(...page.items);
      if (findings.length >= CAMPAIGN_PROGRESS_MAX_FINDINGS) {
        truncated = true;
        break;
      }
      if (page.items.length < pageSize) break;
      offset += pageSize;
    }

    const progress = countCampaignProgress({
      findings: findings.slice(0, CAMPAIGN_PROGRESS_MAX_FINDINGS),
      policy,
      now: this.clock.now(),
    });

    return { campaignId: campaign.id, progress, truncated };
  }
}
