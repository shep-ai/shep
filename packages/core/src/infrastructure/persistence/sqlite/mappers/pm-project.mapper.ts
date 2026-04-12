/**
 * PmProject Database Mapper
 *
 * Maps between PmProject domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - JSON objects stored as TEXT
 */

import type { PmProject } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the pm_projects table schema.
 */
export interface PmProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  identifier_prefix: string;
  work_item_counter: number;
  estimate_type: string;
  application_id: string | null;
  start_date: number | null;
  end_date: number | null;
  feature_toggles: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps PmProject domain object to database row.
 */
export function toDatabase(project: PmProject): PmProjectRow {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description ?? null,
    identifier_prefix: project.identifierPrefix,
    work_item_counter: project.workItemCounter,
    estimate_type: project.estimateType,
    application_id: project.applicationId ?? null,
    start_date: project.startDate
      ? project.startDate instanceof Date
        ? project.startDate.getTime()
        : project.startDate
      : null,
    end_date: project.endDate
      ? project.endDate instanceof Date
        ? project.endDate.getTime()
        : project.endDate
      : null,
    feature_toggles: project.featureToggles ?? null,
    created_at: project.createdAt instanceof Date ? project.createdAt.getTime() : project.createdAt,
    updated_at: project.updatedAt instanceof Date ? project.updatedAt.getTime() : project.updatedAt,
    deleted_at: project.deletedAt
      ? project.deletedAt instanceof Date
        ? project.deletedAt.getTime()
        : project.deletedAt
      : null,
  };
}

/**
 * Maps database row to PmProject domain object.
 */
export function fromDatabase(row: PmProjectRow): PmProject {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    identifierPrefix: row.identifier_prefix,
    workItemCounter: row.work_item_counter,
    estimateType: row.estimate_type as PmProject['estimateType'],
    applicationId: row.application_id ?? undefined,
    startDate: row.start_date !== null ? new Date(row.start_date) : undefined,
    endDate: row.end_date !== null ? new Date(row.end_date) : undefined,
    featureToggles: row.feature_toggles ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
