/**
 * ListCampaignsUseCase (feature 098, phase 6, task-38).
 *
 * Returns all RemediationCampaigns (optionally filtered by status set
 * and/or owner) in display order: Active → Paused → Draft → Completed →
 * Cancelled, then by due date ASC NULLS LAST.
 */

import { inject, injectable } from 'tsyringe';
import {
  type CampaignStatus,
  type RemediationCampaign,
} from '../../../../domain/generated/output.js';
import type { IRemediationCampaignRepository } from '../../../ports/output/repositories/remediation-campaign-repository.interface.js';

export interface ListCampaignsInput {
  statuses?: CampaignStatus[];
  ownerId?: string;
}

@injectable()
export class ListCampaignsUseCase {
  constructor(
    @inject('IRemediationCampaignRepository')
    private readonly repo: IRemediationCampaignRepository
  ) {}

  async execute(input: ListCampaignsInput = {}): Promise<RemediationCampaign[]> {
    return this.repo.list({
      statuses: input.statuses,
      ownerId: input.ownerId,
    });
  }
}
