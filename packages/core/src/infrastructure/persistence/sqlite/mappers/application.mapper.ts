/**
 * Application Database Mapper
 *
 * Maps between Application domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - JSON arrays stored as TEXT
 */

import type { Application } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the applications table schema.
 */
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  repository_path: string;
  additional_paths: string;
  agent_type: string | null;
  model_override: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps Application domain object to database row.
 */
export function toDatabase(app: Application): ApplicationRow {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    repository_path: app.repositoryPath,
    additional_paths: JSON.stringify(app.additionalPaths ?? []),
    agent_type: app.agentType ?? null,
    model_override: app.modelOverride ?? null,
    status: app.status,
    created_at: app.createdAt instanceof Date ? app.createdAt.getTime() : app.createdAt,
    updated_at: app.updatedAt instanceof Date ? app.updatedAt.getTime() : app.updatedAt,
    deleted_at: app.deletedAt
      ? app.deletedAt instanceof Date
        ? app.deletedAt.getTime()
        : app.deletedAt
      : null,
  };
}

/**
 * Maps database row to Application domain object.
 */
export function fromDatabase(row: ApplicationRow): Application {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    repositoryPath: row.repository_path,
    additionalPaths: JSON.parse(row.additional_paths) as string[],
    agentType: row.agent_type ?? undefined,
    modelOverride: row.model_override ?? undefined,
    status: row.status as Application['status'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
