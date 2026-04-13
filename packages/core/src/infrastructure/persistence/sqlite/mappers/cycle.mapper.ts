/**
 * Cycle Database Mapper
 *
 * Maps between Cycle domain objects and SQLite database rows.
 */

import type { Cycle } from '../../../../domain/generated/output.js';

export interface CycleRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  start_date: number | null;
  end_date: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(cycle: Cycle): CycleRow {
  return {
    id: cycle.id,
    project_id: cycle.projectId,
    name: cycle.name,
    description: cycle.description ?? null,
    status: cycle.status,
    start_date: cycle.startDate
      ? cycle.startDate instanceof Date
        ? cycle.startDate.getTime()
        : cycle.startDate
      : null,
    end_date: cycle.endDate
      ? cycle.endDate instanceof Date
        ? cycle.endDate.getTime()
        : cycle.endDate
      : null,
    created_at: cycle.createdAt instanceof Date ? cycle.createdAt.getTime() : cycle.createdAt,
    updated_at: cycle.updatedAt instanceof Date ? cycle.updatedAt.getTime() : cycle.updatedAt,
    deleted_at: cycle.deletedAt
      ? cycle.deletedAt instanceof Date
        ? cycle.deletedAt.getTime()
        : cycle.deletedAt
      : null,
  };
}

export function fromDatabase(row: CycleRow): Cycle {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Cycle['status'],
    startDate: row.start_date !== null ? new Date(row.start_date) : undefined,
    endDate: row.end_date !== null ? new Date(row.end_date) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
