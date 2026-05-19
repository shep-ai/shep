/**
 * SecurityPolicy Database Mapper
 *
 * Feature 098, phase 6. Maps between SecurityPolicy domain objects and
 * SQLite rows in the security_policies table (migration 111).
 *
 * SLA windows are stored as four flat day-count columns and materialized
 * into the SLAWindow[] value-object shape consumed by the pure-domain SLA
 * computation.
 */

import {
  CanonicalSeverity,
  type SecurityPolicy,
  type SLAWindow,
} from '../../../../domain/generated/output.js';

export interface SecurityPolicyRow {
  id: string;
  name: string;
  is_active: number;
  sla_critical_days: number;
  sla_high_days: number;
  sla_medium_days: number;
  sla_low_days: number;
  ingestion_max_bytes: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function findDays(windows: SLAWindow[], severity: CanonicalSeverity, fallback: number): number {
  const w = windows.find((entry) => entry.severity === severity);
  return w ? w.windowDays : fallback;
}

export function toDatabase(policy: SecurityPolicy): SecurityPolicyRow {
  return {
    id: policy.id,
    name: policy.name,
    is_active: policy.active ? 1 : 0,
    sla_critical_days: findDays(policy.slaWindows, CanonicalSeverity.Critical, 7),
    sla_high_days: findDays(policy.slaWindows, CanonicalSeverity.High, 30),
    sla_medium_days: findDays(policy.slaWindows, CanonicalSeverity.Medium, 90),
    sla_low_days: findDays(policy.slaWindows, CanonicalSeverity.Low, 180),
    ingestion_max_bytes: Number(policy.maxIngestBytes),
    created_at: toMillis(policy.createdAt),
    updated_at: toMillis(policy.updatedAt),
    deleted_at: policy.deletedAt ? toMillis(policy.deletedAt) : null,
  };
}

export function fromDatabase(row: SecurityPolicyRow): SecurityPolicy {
  const slaWindows: SLAWindow[] = [
    { severity: CanonicalSeverity.Critical, windowDays: row.sla_critical_days },
    { severity: CanonicalSeverity.High, windowDays: row.sla_high_days },
    { severity: CanonicalSeverity.Medium, windowDays: row.sla_medium_days },
    { severity: CanonicalSeverity.Low, windowDays: row.sla_low_days },
  ];

  return {
    id: row.id,
    name: row.name,
    active: row.is_active === 1,
    slaWindows,
    maxIngestBytes: BigInt(row.ingestion_max_bytes),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
