/**
 * SQLite WorkItemState Repository Implementation
 *
 * Implements IWorkItemStateRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { IWorkItemStateRepository } from '../../application/ports/output/repositories/work-item-state-repository.interface.js';
import type { WorkItemState } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type WorkItemStateRow,
} from '../persistence/sqlite/mappers/work-item-state.mapper.js';

const DEFAULT_STATES = [
  { name: 'Backlog', color: '#a3a3a3', stateGroup: 'Backlog', displayOrder: 0 },
  { name: 'Todo', color: '#3b82f6', stateGroup: 'Unstarted', displayOrder: 1 },
  { name: 'In Progress', color: '#f59e0b', stateGroup: 'Started', displayOrder: 2 },
  { name: 'Done', color: '#22c55e', stateGroup: 'Completed', displayOrder: 3 },
  { name: 'Cancelled', color: '#ef4444', stateGroup: 'Cancelled', displayOrder: 4 },
];

@injectable()
export class SQLiteWorkItemStateRepository implements IWorkItemStateRepository {
  constructor(private readonly db: Database.Database) {}

  async create(state: WorkItemState): Promise<void> {
    const row = toDatabase(state);
    const stmt = this.db.prepare(`
      INSERT INTO work_item_states (
        id, project_id, name, color, display_order, state_group,
        is_default, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @color, @display_order, @state_group,
        @is_default, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<WorkItemState | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM work_item_states WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as WorkItemStateRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string): Promise<WorkItemState[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM work_item_states WHERE project_id = ? AND deleted_at IS NULL ORDER BY display_order ASC'
    );
    const rows = stmt.all(projectId) as WorkItemStateRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<WorkItemState, 'name' | 'color' | 'displayOrder' | 'stateGroup' | 'isDefault'>
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      values.push(fields.name);
    }
    if (fields.color !== undefined) {
      setClauses.push('color = ?');
      values.push(fields.color);
    }
    if (fields.displayOrder !== undefined) {
      setClauses.push('display_order = ?');
      values.push(fields.displayOrder);
    }
    if (fields.stateGroup !== undefined) {
      setClauses.push('state_group = ?');
      values.push(fields.stateGroup);
    }
    if (fields.isDefault !== undefined) {
      setClauses.push('is_default = ?');
      values.push(fields.isDefault ? 1 : 0);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE work_item_states SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE work_item_states SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async seedDefaultStates(projectId: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO work_item_states (
        id, project_id, name, color, display_order, state_group,
        is_default, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @name, @color, @display_order, @state_group,
        @is_default, @created_at, @updated_at, @deleted_at
      )
    `);

    const insertAll = this.db.transaction(() => {
      for (const def of DEFAULT_STATES) {
        stmt.run({
          id: randomUUID(),
          project_id: projectId,
          name: def.name,
          color: def.color,
          display_order: def.displayOrder,
          state_group: def.stateGroup,
          is_default: def.name === 'Backlog' ? 1 : 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });
      }
    });
    insertAll();
  }

  async reorder(states: { id: string; displayOrder: number }[]): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE work_item_states SET display_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL'
    );
    const reorderAll = this.db.transaction(() => {
      for (const s of states) {
        stmt.run(s.displayOrder, now, s.id);
      }
    });
    reorderAll();
  }
}
