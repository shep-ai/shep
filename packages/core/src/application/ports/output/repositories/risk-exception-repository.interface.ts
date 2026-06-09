/**
 * RiskException Repository Interface (Output Port)
 *
 * Feature 098, phase 6 (task-34). Persistence contract for the
 * RiskException entity — self-declared masks against findings (FR-22).
 *
 * The audit log on each row is append-only — implementations MUST NOT
 * overwrite prior entries. State transitions go through {@link
 * appendAuditEntry} so the lifecycle history survives.
 */

import type { RiskException, RiskExceptionStatus } from '../../../../domain/generated/output.js';

/** Single entry in a RiskException's immutable audit log. */
export interface RiskExceptionAuditEntry {
  /** Wall-clock timestamp of the entry, ISO-8601 string for portability. */
  at: string;
  /** Owner id that performed the action (or 'system' for automated transitions). */
  actor: string;
  /** What happened — e.g. 'declared', 'revoked', 'expired-by-system'. */
  action: string;
  /** Free-form human-readable note (justification, revocation reason, etc.). */
  note?: string;
}

/** RiskException row paired with its audit log. */
export interface RiskExceptionWithAudit {
  exception: RiskException;
  audit: RiskExceptionAuditEntry[];
}

export interface IRiskExceptionRepository {
  /** Insert a new exception record with its initial audit entry. */
  create(exception: RiskException, initialAudit: RiskExceptionAuditEntry): Promise<void>;

  /** Find an exception by id (excludes soft-deleted). */
  findById(id: string): Promise<RiskException | null>;

  /** Find with the audit log attached (excludes soft-deleted). */
  findByIdWithAudit(id: string): Promise<RiskExceptionWithAudit | null>;

  /**
   * Return the currently-active exception for a finding, if any. Used by
   * the effective-finding-state computation to mask the finding from
   * posture rollups.
   */
  findActiveForFinding(findingId: string): Promise<RiskException | null>;

  /**
   * List exceptions in the supplied status set, optionally restricted to
   * ones expiring within `withinDays` days from the supplied "now".
   *
   * Used by the dashboard "expiring soon" tile and the
   * list-expiring-exceptions use case.
   */
  listByStatus(
    statuses: RiskExceptionStatus[],
    options?: { expiringWithinDays?: number; now?: Date }
  ): Promise<RiskException[]>;

  /** Update the lifecycle status of an exception and append an audit entry. */
  updateStatus(
    id: string,
    status: RiskExceptionStatus,
    auditEntry: RiskExceptionAuditEntry
  ): Promise<void>;

  /** Append a free-form audit entry without changing status (rare). */
  appendAuditEntry(id: string, auditEntry: RiskExceptionAuditEntry): Promise<void>;

  /** Soft-delete the exception. Audit log is preserved. */
  softDelete(id: string): Promise<void>;
}
