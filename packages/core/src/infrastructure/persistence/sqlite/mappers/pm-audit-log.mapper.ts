import type { PmAuditLog, AuditAction } from '../../../../domain/generated/output.js';

export interface PmAuditLogRow {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  target_type: string | null;
  metadata: string | null;
  ip_address: string | null;
  created_at: number;
  updated_at: number;
}

export function toDatabase(entry: PmAuditLog): PmAuditLogRow {
  return {
    id: entry.id,
    actor_id: entry.actorId,
    action: entry.action,
    target_id: entry.targetId ?? null,
    target_type: entry.targetType ?? null,
    metadata: entry.metadata ?? null,
    ip_address: entry.ipAddress ?? null,
    created_at: entry.createdAt instanceof Date ? entry.createdAt.getTime() : entry.createdAt,
    updated_at: entry.updatedAt instanceof Date ? entry.updatedAt.getTime() : entry.updatedAt,
  };
}

export function fromDatabase(row: PmAuditLogRow): PmAuditLog {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action as AuditAction,
    targetId: row.target_id ?? undefined,
    targetType: row.target_type ?? undefined,
    metadata: row.metadata ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
