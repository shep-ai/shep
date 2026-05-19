/**
 * CreateCampaignUseCase (feature 098, phase 6, task-38).
 *
 * Creates a new RemediationCampaign with the supplied target FindingFilter.
 * The campaign starts in Draft unless the caller explicitly requests a
 * different starting status (Active is the common alternative; Completed
 * and Cancelled are rejected since they would require closedAt and a
 * non-trivial lifecycle).
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import {
  CampaignStatus,
  type FindingFilter,
  type RemediationCampaign,
} from '../../../../domain/generated/output.js';
import { AUDIT_ACTIONS, buildAuditEntry } from '../../../../domain/aspm/exceptions/audit-entry.js';
import type { IRemediationCampaignRepository } from '../../../ports/output/repositories/remediation-campaign-repository.interface.js';
import type { ISlaClockPort } from '../../../ports/output/services/sla-clock-port.interface.js';

const CREATABLE_STATUSES: CampaignStatus[] = [CampaignStatus.Draft, CampaignStatus.Active];

export interface CreateCampaignInput {
  name: string;
  description: string;
  targetQuery: FindingFilter;
  createdBy: string;
  status?: CampaignStatus;
  ownerId?: string;
  dueDate?: Date;
}

@injectable()
export class CreateCampaignUseCase {
  constructor(
    @inject('IRemediationCampaignRepository')
    private readonly repo: IRemediationCampaignRepository,
    @inject('ISlaClockPort') private readonly clock: ISlaClockPort
  ) {}

  async execute(input: CreateCampaignInput): Promise<RemediationCampaign> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new Error('Campaign name cannot be empty');
    }

    const status = input.status ?? CampaignStatus.Draft;
    if (!CREATABLE_STATUSES.includes(status)) {
      throw new Error(
        `Cannot create campaign in ${status} state — start in Draft or Active and transition explicitly`
      );
    }

    const now = this.clock.now();
    const campaign: RemediationCampaign = {
      id: randomUUID(),
      name,
      description: input.description ?? '',
      targetQuery: input.targetQuery,
      status,
      ownerId: input.ownerId,
      dueDate: input.dueDate,
      createdAt: now,
      updatedAt: now,
    };

    await this.repo.create(
      campaign,
      buildAuditEntry({ now, actor: input.createdBy, action: AUDIT_ACTIONS.Created })
    );
    return campaign;
  }
}
