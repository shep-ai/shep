/**
 * RemediationCampaign Repository Interface (Output Port)
 *
 * Feature 098, phase 6 (task-37). Persistence contract for the
 * RemediationCampaign entity (FR-16). The audit log on each row is
 * append-only — implementations MUST NOT overwrite prior entries.
 */

import type { CampaignStatus, RemediationCampaign } from '../../../../domain/generated/output.js';
import type { RiskExceptionAuditEntry } from './risk-exception-repository.interface.js';

/** A campaign audit entry — same shape as the RiskException audit. */
export type CampaignAuditEntry = RiskExceptionAuditEntry;

/** Campaign row paired with its full audit log. */
export interface RemediationCampaignWithAudit {
  campaign: RemediationCampaign;
  audit: CampaignAuditEntry[];
}

export interface IRemediationCampaignRepository {
  /** Insert a new campaign with its initial audit entry. */
  create(campaign: RemediationCampaign, initialAudit: CampaignAuditEntry): Promise<void>;

  /** Find a campaign by id (excludes soft-deleted). */
  findById(id: string): Promise<RemediationCampaign | null>;

  /** Find with the audit log attached (excludes soft-deleted). */
  findByIdWithAudit(id: string): Promise<RemediationCampaignWithAudit | null>;

  /**
   * List campaigns, optionally filtered by status and/or owner.
   * Ordered by status grouping then dueDate ASC NULLS LAST.
   */
  list(filters?: { statuses?: CampaignStatus[]; ownerId?: string }): Promise<RemediationCampaign[]>;

  /** Update mutable campaign fields and append an audit entry. */
  update(
    id: string,
    fields: Partial<
      Pick<RemediationCampaign, 'name' | 'description' | 'targetQuery' | 'ownerId' | 'dueDate'>
    >,
    auditEntry: CampaignAuditEntry
  ): Promise<void>;

  /**
   * Transition the campaign's lifecycle status; sets closedAt when
   * moving to Completed or Cancelled, clears it on Active/Paused/Draft.
   * Appends an audit entry.
   */
  updateStatus(id: string, status: CampaignStatus, auditEntry: CampaignAuditEntry): Promise<void>;

  /** Soft-delete the campaign. Audit log is preserved. */
  softDelete(id: string): Promise<void>;
}
