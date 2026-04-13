/**
 * Epic Database Mapper
 *
 * Maps between Epic domain objects and SQLite database rows.
 */

import type { Epic } from '../../../../domain/generated/output.js';

export interface EpicRow {
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

export function toDatabase(epic: Epic): EpicRow {
  return {
    id: epic.id,
    project_id: epic.projectId,
    name: epic.name,
    description: epic.description ?? null,
    status: epic.status,
    start_date: epic.startDate
      ? epic.startDate instanceof Date
        ? epic.startDate.getTime()
        : epic.startDate
      : null,
    end_date: epic.endDate
      ? epic.endDate instanceof Date
        ? epic.endDate.getTime()
        : epic.endDate
      : null,
    created_at: epic.createdAt instanceof Date ? epic.createdAt.getTime() : epic.createdAt,
    updated_at: epic.updatedAt instanceof Date ? epic.updatedAt.getTime() : epic.updatedAt,
    deleted_at: epic.deletedAt
      ? epic.deletedAt instanceof Date
        ? epic.deletedAt.getTime()
        : epic.deletedAt
      : null,
  };
}

export function fromDatabase(row: EpicRow): Epic {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as Epic['status'],
    startDate: row.start_date !== null ? new Date(row.start_date) : undefined,
    endDate: row.end_date !== null ? new Date(row.end_date) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
