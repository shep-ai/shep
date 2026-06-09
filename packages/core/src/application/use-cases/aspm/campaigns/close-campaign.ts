/**
 * CloseCampaignUseCase (feature 098, phase 6, task-38).
 *
 * Transitions a campaign into a terminal state (Completed or Cancelled),
 * stamping closedAt via the repository's updateStatus contract.
 *
 * Also handles Pause/Resume transitions for symmetry — the use case is
 * the only place that knows the allowed transition matrix.
 */

import { inject, injectable } from 'tsyringe';
import { CampaignStatus } from '../../../../domain/generated/output.js';
import { AUDIT_ACTIONS, buildAuditEntry } from '../../../../domain/aspm/exceptions/audit-entry.js';
import { CampaignClosedError } from '../../../../domain/aspm/errors/campaign-closed.error.js';
import type { IRemediationCampaignRepository } from '../../../ports/output/repositories/remediation-campaign-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.Draft]: [CampaignStatus.Active, CampaignStatus.Cancelled],
  [CampaignStatus.Active]: [
    CampaignStatus.Paused,
    CampaignStatus.Completed,
    CampaignStatus.Cancelled,
  ],
  [CampaignStatus.Paused]: [CampaignStatus.Active, CampaignStatus.Cancelled],
  [CampaignStatus.Completed]: [],
  [CampaignStatus.Cancelled]: [],
};

const ACTION_FOR_STATUS: Record<CampaignStatus, string> = {
  [CampaignStatus.Draft]: AUDIT_ACTIONS.Updated,
  [CampaignStatus.Active]: AUDIT_ACTIONS.Activated,
  [CampaignStatus.Paused]: AUDIT_ACTIONS.Paused,
  [CampaignStatus.Completed]: AUDIT_ACTIONS.Closed,
  [CampaignStatus.Cancelled]: AUDIT_ACTIONS.Cancelled,
};

export interface CloseCampaignInput {
  campaignId: string;
  targetStatus: CampaignStatus;
  actor: string;
  note?: string;
}

@injectable()
export class CloseCampaignUseCase {
  constructor(
    @inject('IRemediationCampaignRepository')
    private readonly repo: IRemediationCampaignRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: CloseCampaignInput): Promise<void> {
    const existing = await this.repo.findById(input.campaignId);
    if (existing === null) {
      throw new Error(`RemediationCampaign ${input.campaignId} not found`);
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (allowed.length === 0) {
      throw new CampaignClosedError(input.campaignId, existing.status);
    }
    if (!allowed.includes(input.targetStatus)) {
      throw new Error(`Illegal campaign transition ${existing.status} → ${input.targetStatus}`);
    }

    const now = this.clock.now();
    await this.repo.updateStatus(
      input.campaignId,
      input.targetStatus,
      buildAuditEntry({
        now,
        actor: input.actor,
        action: ACTION_FOR_STATUS[input.targetStatus],
        note: input.note,
      })
    );
  }
}
