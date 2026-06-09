/**
 * SQLite ProjectMemory Repository Implementation
 *
 * Implements IProjectMemoryRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IProjectMemoryRepository,
  ProjectMemoryUpsert,
} from '../../application/ports/output/repositories/project-memory-repository.interface.js';
import { type ProjectMemory, MemoryScope } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ProjectMemoryRow,
} from '../persistence/sqlite/mappers/project-memory.mapper.js';

@injectable()
export class SQLiteProjectMemoryRepository implements IProjectMemoryRepository {
  constructor(private readonly db: Database.Database) {}

  async create(memory: ProjectMemory): Promise<void> {
    const row = toDatabase(memory);
    const stmt = this.db.prepare(`
      INSERT INTO project_memory (
        id, repository_path, category, entry_key, content,
        source_feature_id, scope, created_at, updated_at
      ) VALUES (
        @id, @repository_path, @category, @entry_key, @content,
        @source_feature_id, @scope, @created_at, @updated_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<ProjectMemory | null> {
    const stmt = this.db.prepare('SELECT * FROM project_memory WHERE id = ?');
    const row = stmt.get(id) as ProjectMemoryRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByRepository(repositoryPath: string): Promise<ProjectMemory[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM project_memory WHERE repository_path = ? ORDER BY category ASC, updated_at DESC'
    );
    const rows = stmt.all(repositoryPath) as ProjectMemoryRow[];
    return rows.map(fromDatabase);
  }

  async listAll(): Promise<ProjectMemory[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM project_memory ORDER BY repository_path ASC, category ASC, updated_at DESC'
    );
    const rows = stmt.all() as ProjectMemoryRow[];
    return rows.map(fromDatabase);
  }

  async listOrganization(): Promise<ProjectMemory[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM project_memory WHERE scope = ? ORDER BY category ASC, updated_at DESC'
    );
    const rows = stmt.all(MemoryScope.Organization) as ProjectMemoryRow[];
    return rows.map(fromDatabase);
  }

  async updateContent(id: string, content: string): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE project_memory SET content = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(content, Date.now(), id);
  }

  async updateScope(id: string, scope: MemoryScope): Promise<void> {
    const stmt = this.db.prepare(
      'UPDATE project_memory SET scope = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(scope, Date.now(), id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM project_memory WHERE id = ?').run(id);
  }

  async upsert(entry: ProjectMemoryUpsert): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO project_memory (
        id, repository_path, category, entry_key, content,
        source_feature_id, scope, created_at, updated_at
      ) VALUES (
        @id, @repository_path, @category, @entry_key, @content,
        @source_feature_id, @scope, @created_at, @updated_at
      )
      ON CONFLICT(repository_path, category, entry_key) DO UPDATE SET
        content           = excluded.content,
        source_feature_id = excluded.source_feature_id,
        scope             = excluded.scope,
        updated_at        = excluded.updated_at
    `);
    stmt.run({
      id: entry.id,
      repository_path: entry.repositoryPath,
      category: entry.category,
      entry_key: entry.entryKey,
      content: entry.content,
      source_feature_id: entry.sourceFeatureId ?? null,
      scope: entry.scope ?? MemoryScope.Project,
      created_at: now,
      updated_at: now,
    });
  }
}
