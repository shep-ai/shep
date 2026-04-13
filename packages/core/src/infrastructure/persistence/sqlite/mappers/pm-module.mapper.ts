/**
 * PmModule Database Mapper
 *
 * Maps between PmModule domain objects and SQLite database rows.
 */

import type { PmModule } from '../../../../domain/generated/output.js';

export interface PmModuleRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  lead_id: string | null;
  start_date: number | null;
  end_date: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(mod: PmModule): PmModuleRow {
  return {
    id: mod.id,
    project_id: mod.projectId,
    name: mod.name,
    description: mod.description ?? null,
    status: mod.status,
    lead_id: mod.leadId ?? null,
    start_date: mod.startDate
      ? mod.startDate instanceof Date
        ? mod.startDate.getTime()
        : mod.startDate
      : null,
    end_date: mod.endDate
      ? mod.endDate instanceof Date
        ? mod.endDate.getTime()
        : mod.endDate
      : null,
    created_at: mod.createdAt instanceof Date ? mod.createdAt.getTime() : mod.createdAt,
    updated_at: mod.updatedAt instanceof Date ? mod.updatedAt.getTime() : mod.updatedAt,
    deleted_at: mod.deletedAt
      ? mod.deletedAt instanceof Date
        ? mod.deletedAt.getTime()
        : mod.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmModuleRow): PmModule {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as PmModule['status'],
    leadId: row.lead_id ?? undefined,
    startDate: row.start_date !== null ? new Date(row.start_date) : undefined,
    endDate: row.end_date !== null ? new Date(row.end_date) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
