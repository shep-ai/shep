/**
 * Owner Database Mapper
 *
 * Feature 098, phase 2. Maps between the Owner domain object and SQLite rows
 * in the owners table (migration 102).
 */

import type { Owner } from '../../../../domain/generated/output.js';

export interface OwnerRow {
  id: string;
  name: string;
  handle: string | null;
  team_id: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(owner: Owner): OwnerRow {
  return {
    id: owner.id,
    name: owner.name,
    handle: owner.handle ?? null,
    team_id: owner.teamId ?? null,
    notes: owner.notes ?? null,
    created_at: toMillis(owner.createdAt),
    updated_at: toMillis(owner.updatedAt),
    deleted_at: owner.deletedAt ? toMillis(owner.deletedAt) : null,
  };
}

export function fromDatabase(row: OwnerRow): Owner {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle ?? undefined,
    teamId: row.team_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
