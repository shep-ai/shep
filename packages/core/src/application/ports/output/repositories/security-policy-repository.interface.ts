/**
 * SecurityPolicy Repository Interface (Output Port)
 *
 * Feature 098, phase 6 (task-32). Persistence contract for the
 * SecurityPolicy entity — workspace-wide SLA windows + ingestion
 * safety limits (FR-19, NFR-14).
 *
 * One active policy per workspace in MVP (research decision 5). Multiple
 * inactive policies may co-exist as drafts. Soft-deletable per NFR-12.
 */

import type { SecurityPolicy } from '../../../../domain/generated/output.js';

export interface ISecurityPolicyRepository {
  /** Insert a new policy record. */
  create(policy: SecurityPolicy): Promise<void>;

  /** Find a policy by id (excludes soft-deleted). */
  findById(id: string): Promise<SecurityPolicy | null>;

  /**
   * Return the currently active policy for the workspace, or null when
   * none is active (this would be an installation invariant violation —
   * the migration seeds one — but the port stays honest about the shape).
   */
  findActive(): Promise<SecurityPolicy | null>;

  /** List every non-deleted policy (active and inactive), ordered by name. */
  listAll(): Promise<SecurityPolicy[]>;

  /**
   * Update mutable policy fields by id.
   *
   * SLA windows and `maxIngestBytes` can be tuned in place. Toggling
   * `active=true` MUST automatically deactivate any previously-active
   * policy in the same transaction so the partial unique index is
   * preserved.
   */
  update(
    id: string,
    fields: Partial<Pick<SecurityPolicy, 'name' | 'active' | 'slaWindows' | 'maxIngestBytes'>>
  ): Promise<void>;

  /** Soft-delete the policy. Refuses to delete the currently active one. */
  softDelete(id: string): Promise<void>;
}
