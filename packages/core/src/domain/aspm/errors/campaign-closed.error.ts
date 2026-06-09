/**
 * Campaign Closed Error
 *
 * Thrown by ASPM campaign mutation use cases when an operation
 * (add/remove finding, edit query, change status) is attempted on
 * a RemediationCampaign whose status is Completed or Cancelled.
 */
export class CampaignClosedError extends Error {
  readonly code = 'ASPM_CAMPAIGN_CLOSED';
  constructor(
    public readonly campaignId: string,
    public readonly status: string
  ) {
    super(`Campaign ${campaignId} is closed (status=${status}); mutations are not allowed`);
    this.name = 'CampaignClosedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
