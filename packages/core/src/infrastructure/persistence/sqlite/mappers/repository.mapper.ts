/**
 * Repository Database Mapper
 *
 * Maps between Repository domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 */

import type { Repository } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the repositories table schema.
 */
export interface RepositoryRow {
  id: string;
  name: string;
  path: string;
  remote_url: string | null;
  is_fork: number;
  upstream_url: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps Repository domain object to database row.
 */
export function toDatabase(repo: Repository): RepositoryRow {
  return {
    id: repo.id,
    name: repo.name,
    path: repo.path,
    remote_url: repo.remoteUrl ?? null,
    is_fork: repo.isFork ? 1 : 0,
    upstream_url: repo.upstreamUrl ?? null,
    created_at: repo.createdAt instanceof Date ? repo.createdAt.getTime() : repo.createdAt,
    updated_at: repo.updatedAt instanceof Date ? repo.updatedAt.getTime() : repo.updatedAt,
    deleted_at: repo.deletedAt
      ? repo.deletedAt instanceof Date
        ? repo.deletedAt.getTime()
        : repo.deletedAt
      : null,
  };
}

/**
 * Maps database row to Repository domain object.
 */
export function fromDatabase(row: RepositoryRow): Repository {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    remoteUrl: row.remote_url ?? undefined,
    isFork: row.is_fork === 1 ? true : undefined,
    upstreamUrl: row.upstream_url ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
