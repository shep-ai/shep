/**
 * ProjectMemory Database Mapper
 *
 * Maps between ProjectMemory domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - category stored as the MemoryCategory string value
 * - source_feature_id is nullable (optional in the domain)
 */

import {
  type ProjectMemory,
  type MemoryCategory,
  MemoryScope,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the project_memory table schema.
 */
export interface ProjectMemoryRow {
  id: string;
  repository_path: string;
  category: string;
  entry_key: string;
  content: string;
  source_feature_id: string | null;
  scope: string;
  created_at: number;
  updated_at: number;
}

/**
 * Maps a ProjectMemory domain object to a database row.
 */
export function toDatabase(memory: ProjectMemory): ProjectMemoryRow {
  return {
    id: memory.id,
    repository_path: memory.repositoryPath,
    category: memory.category,
    entry_key: memory.entryKey,
    content: memory.content,
    source_feature_id: memory.sourceFeatureId ?? null,
    scope: memory.scope ?? MemoryScope.Project,
    created_at: memory.createdAt instanceof Date ? memory.createdAt.getTime() : memory.createdAt,
    updated_at: memory.updatedAt instanceof Date ? memory.updatedAt.getTime() : memory.updatedAt,
  };
}

/**
 * Maps a database row to a ProjectMemory domain object.
 */
export function fromDatabase(row: ProjectMemoryRow): ProjectMemory {
  return {
    id: row.id,
    repositoryPath: row.repository_path,
    category: row.category as MemoryCategory,
    entryKey: row.entry_key,
    content: row.content,
    sourceFeatureId: row.source_feature_id ?? undefined,
    scope: (row.scope as MemoryScope) ?? MemoryScope.Project,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
