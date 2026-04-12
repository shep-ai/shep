/**
 * SQLite WorkItemRelation Repository Implementation
 *
 * Implements IWorkItemRelationRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IWorkItemRelationRepository,
  WorkItemRelation,
} from '../../application/ports/output/repositories/work-item-relation-repository.interface.js';
import {
  toDatabase,
  fromDatabase,
  type WorkItemRelationRow,
} from '../persistence/sqlite/mappers/work-item-relation.mapper.js';

@injectable()
export class SQLiteWorkItemRelationRepository implements IWorkItemRelationRepository {
  constructor(private readonly db: Database.Database) {}

  async create(relation: WorkItemRelation): Promise<void> {
    const row = toDatabase(relation);
    const stmt = this.db.prepare(`
      INSERT INTO work_item_relations (
        id, source_work_item_id, target_work_item_id, relation_type, created_at
      ) VALUES (
        @id, @source_work_item_id, @target_work_item_id, @relation_type, @created_at
      )
    `);
    stmt.run(row);
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM work_item_relations WHERE id = ?');
    stmt.run(id);
  }

  async listByWorkItem(workItemId: string): Promise<WorkItemRelation[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM work_item_relations WHERE source_work_item_id = ? OR target_work_item_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(workItemId, workItemId) as WorkItemRelationRow[];
    return rows.map(fromDatabase);
  }

  async findExisting(
    sourceId: string,
    targetId: string,
    relationType: string
  ): Promise<WorkItemRelation | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM work_item_relations WHERE source_work_item_id = ? AND target_work_item_id = ? AND relation_type = ?'
    );
    const row = stmt.get(sourceId, targetId, relationType) as WorkItemRelationRow | undefined;
    return row ? fromDatabase(row) : null;
  }
}
