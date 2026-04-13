/**
 * PmAuditLog Repository Interface (Output Port)
 *
 * Defines the contract for audit log persistence.
 * Audit log is append-only — no updates or deletes.
 */

import type { PmAuditLog } from '../../../../domain/generated/output.js';

export interface IPmAuditLogRepository {
  create(entry: PmAuditLog): Promise<void>;
  list(filters?: {
    actorId?: string;
    action?: string;
    targetId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<PmAuditLog[]>;
  count(filters?: {
    actorId?: string;
    action?: string;
    targetId?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<number>;
}
