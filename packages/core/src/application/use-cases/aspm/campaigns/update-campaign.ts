/**
 * UpdateCampaignUseCase (feature 098, phase 6, task-38).
 *
 * Edits mutable fields on a non-closed campaign (name, description,
 * targetQuery, ownerId, dueDate). Lifecycle status transitions go
 * through the dedicated close-campaign use case.
 */

import { inject, injectable } from 'tsyringe';
import { CampaignStatus, type FindingFilter } from '../../../../domain/generated/output.js';
import { AUDIT_ACTIONS, buildAuditEntry } from '../../../../domain/aspm/exceptions/audit-entry.js';
import { CampaignClosedError } from '../../../../domain/aspm/errors/campaign-closed.error.js';
import type { IRemediationCampaignRepository } from '../../../ports/output/repositories/remediation-campaign-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

const CLOSED_STATUSES: CampaignStatus[] = [CampaignStatus.Completed, CampaignStatus.Cancelled];

export interface UpdateCampaignInput {
  campaignId: string;
  updatedBy: string;
  fields: {
    name?: string;
    description?: string;
    targetQuery?: FindingFilter;
    ownerId?: string;
    dueDate?: Date;
  };
  note?: string;
}

@injectable()
export class UpdateCampaignUseCase {
  constructor(
    @inject('IRemediationCampaignRepository')
    private readonly repo: IRemediationCampaignRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: UpdateCampaignInput): Promise<void> {
    const existing = await this.repo.findById(input.campaignId);
    if (existing === null) {
      throw new Error(`RemediationCampaign ${input.campaignId} not found`);
    }
    if (CLOSED_STATUSES.includes(existing.status)) {
      throw new CampaignClosedError(input.campaignId, existing.status);
    }

    const cleanFields: typeof input.fields = {};
    if (input.fields.name !== undefined) {
      const trimmed = input.fields.name.trim();
      if (trimmed.length === 0) throw new Error('Campaign name cannot be empty');
      cleanFields.name = trimmed;
    }
    if (input.fields.description !== undefined) cleanFields.description = input.fields.description;
    if (input.fields.targetQuery !== undefined) cleanFields.targetQuery = input.fields.targetQuery;
    if (input.fields.ownerId !== undefined) cleanFields.ownerId = input.fields.ownerId;
    if (input.fields.dueDate !== undefined) cleanFields.dueDate = input.fields.dueDate;

    if (Object.keys(cleanFields).length === 0) {
      return;
    }

    const now = this.clock.now();
    await this.repo.update(
      input.campaignId,
      cleanFields,
      buildAuditEntry({
        now,
        actor: input.updatedBy,
        action: AUDIT_ACTIONS.Updated,
        note: input.note,
      })
    );
  }
}
