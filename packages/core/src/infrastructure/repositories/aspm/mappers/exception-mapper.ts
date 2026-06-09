/**
 * RiskException Database Mapper
 *
 * Feature 098, phase 6 (task-34). Maps between the RiskException domain
 * object + its audit log and rows in the risk_exceptions table
 * (migration 112). The audit log is JSON-encoded into a single column;
 * the repository guarantees append-only semantics.
 */

import {
  ExceptionReason,
  RiskExceptionStatus,
  type RiskException,
} from '../../../../domain/generated/output.js';
import type { RiskExceptionAuditEntry } from '../../../../application/ports/output/repositories/risk-exception-repository.interface.js';

export interface RiskExceptionRow {
  id: string;
  finding_id: string;
  reason: string;
  justification: string;
  declared_by: string;
  declared_at: number;
  expires_at: number;
  status: string;
  audit_log: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function ensureReason(value: string): ExceptionReason {
  const known = Object.values(ExceptionReason) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown ExceptionReason persisted in risk_exceptions: ${value}`);
  }
  return value as ExceptionReason;
}

function ensureStatus(value: string): RiskExceptionStatus {
  const known = Object.values(RiskExceptionStatus) as string[];
  if (!known.includes(value)) {
    throw new Error(`Unknown RiskExceptionStatus persisted in risk_exceptions: ${value}`);
  }
  return value as RiskExceptionStatus;
}

export function toDatabase(
  exception: RiskException,
  audit: RiskExceptionAuditEntry[]
): RiskExceptionRow {
  return {
    id: exception.id,
    finding_id: exception.findingId,
    reason: exception.reason,
    justification: exception.justification,
    declared_by: exception.declaredBy,
    declared_at: toMillis(exception.declaredAt as Date),
    expires_at: toMillis(exception.expiresAt as Date),
    status: exception.status,
    audit_log: JSON.stringify(audit),
    created_at: toMillis(exception.createdAt),
    updated_at: toMillis(exception.updatedAt),
    deleted_at: exception.deletedAt ? toMillis(exception.deletedAt) : null,
  };
}

export function fromDatabase(row: RiskExceptionRow): RiskException {
  return {
    id: row.id,
    findingId: row.finding_id,
    reason: ensureReason(row.reason),
    justification: row.justification,
    declaredBy: row.declared_by,
    declaredAt: new Date(row.declared_at),
    expiresAt: new Date(row.expires_at),
    status: ensureStatus(row.status),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}

export function parseAuditLog(rawJson: string): RiskExceptionAuditEntry[] {
  if (!rawJson) return [];
  const parsed = JSON.parse(rawJson) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed as RiskExceptionAuditEntry[];
}
