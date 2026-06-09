/**
 * Team Database Mapper
 *
 * Feature 098, phase 2. Maps between the Team domain object and SQLite rows
 * in the teams table (migration 103).
 */

import type { Team } from '../../../../domain/generated/output.js';

export interface TeamRow {
  id: string;
  name: string;
  slug: string | null;
  business_unit_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(team: Team): TeamRow {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug ?? null,
    business_unit_id: team.businessUnitId ?? null,
    created_at: toMillis(team.createdAt),
    updated_at: toMillis(team.updatedAt),
    deleted_at: team.deletedAt ? toMillis(team.deletedAt) : null,
  };
}

export function fromDatabase(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    businessUnitId: row.business_unit_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at !== null ? new Date(row.deleted_at) : undefined,
  };
}
