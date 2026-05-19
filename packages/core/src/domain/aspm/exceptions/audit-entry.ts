/**
 * Audit entry builder for RiskException state transitions.
 *
 * Feature 098, phase 6 (task-36 supporting helper). Centralizes the
 * structured-log shape so every use case appends identical fields
 * (timestamp, actor, action, note).
 *
 * Pure: no infra imports. Time is supplied by the caller (via
 * ISlaClockPort.now in the use case).
 */

import type { RiskExceptionAuditEntry } from '../../../application/ports/output/repositories/risk-exception-repository.interface';

export const AUDIT_ACTIONS = {
  Declared: 'declared',
  Revoked: 'revoked',
  ExpiredBySystem: 'expired-by-system',
  Created: 'created',
  Updated: 'updated',
  Closed: 'closed',
  Cancelled: 'cancelled',
  Paused: 'paused',
  Activated: 'activated',
} as const;

export interface AuditEntryInputs {
  now: Date;
  actor: string;
  action: string;
  note?: string;
}

export function buildAuditEntry(inputs: AuditEntryInputs): RiskExceptionAuditEntry {
  const entry: RiskExceptionAuditEntry = {
    at: inputs.now.toISOString(),
    actor: inputs.actor,
    action: inputs.action,
  };
  if (inputs.note !== undefined) {
    entry.note = inputs.note;
  }
  return entry;
}
