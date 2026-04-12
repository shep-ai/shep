/**
 * SQLite WorkItem Repository Implementation
 *
 * Implements IWorkItemRepository using better-sqlite3.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IWorkItemRepository,
  WorkItemFilter,
} from '../../application/ports/output/repositories/work-item-repository.interface.js';
import type { WorkItem } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type WorkItemRow,
} from '../persistence/sqlite/mappers/work-item.mapper.js';

@injectable()
export class SQLiteWorkItemRepository implements IWorkItemRepository {
  constructor(private readonly db: Database.Database) {}

  async create(item: WorkItem): Promise<void> {
    const row = toDatabase(item);
    const stmt = this.db.prepare(`
      INSERT INTO work_items (
        id, project_id, sequence_id, identifier_prefix, title, description,
        state_id, priority, parent_id, sort_order, start_date, due_date,
        estimate_value, custom_property_values, created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @sequence_id, @identifier_prefix, @title, @description,
        @state_id, @priority, @parent_id, @sort_order, @start_date, @due_date,
        @estimate_value, @custom_property_values, @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<WorkItem | null> {
    const stmt = this.db.prepare('SELECT * FROM work_items WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as WorkItemRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findByIdentifier(projectId: string, sequenceId: number): Promise<WorkItem | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM work_items WHERE project_id = ? AND sequence_id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(projectId, sequenceId) as WorkItemRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string, filters?: WorkItemFilter): Promise<WorkItem[]> {
    const whereClauses: string[] = ['w.project_id = ?', 'w.deleted_at IS NULL'];
    const values: unknown[] = [projectId];

    if (filters?.stateIds && filters.stateIds.length > 0) {
      const placeholders = filters.stateIds.map(() => '?').join(', ');
      whereClauses.push(`w.state_id IN (${placeholders})`);
      values.push(...filters.stateIds);
    }

    if (filters?.priorities && filters.priorities.length > 0) {
      const placeholders = filters.priorities.map(() => '?').join(', ');
      whereClauses.push(`w.priority IN (${placeholders})`);
      values.push(...filters.priorities);
    }

    if (filters?.startDateFrom) {
      whereClauses.push('w.start_date >= ?');
      values.push(filters.startDateFrom.getTime());
    }
    if (filters?.startDateTo) {
      whereClauses.push('w.start_date <= ?');
      values.push(filters.startDateTo.getTime());
    }
    if (filters?.dueDateFrom) {
      whereClauses.push('w.due_date >= ?');
      values.push(filters.dueDateFrom.getTime());
    }
    if (filters?.dueDateTo) {
      whereClauses.push('w.due_date <= ?');
      values.push(filters.dueDateTo.getTime());
    }

    if (filters?.parentId !== undefined) {
      if (filters.parentId === null) {
        whereClauses.push('w.parent_id IS NULL');
      } else {
        whereClauses.push('w.parent_id = ?');
        values.push(filters.parentId);
      }
    }

    let sql = `SELECT w.* FROM work_items w`;

    if (filters?.assigneeIds && filters.assigneeIds.length > 0) {
      sql += ` INNER JOIN work_item_assignees wa ON w.id = wa.work_item_id`;
      const placeholders = filters.assigneeIds.map(() => '?').join(', ');
      whereClauses.push(`wa.assignee_id IN (${placeholders})`);
      values.push(...filters.assigneeIds);
    }

    if (filters?.labelIds && filters.labelIds.length > 0) {
      sql += ` INNER JOIN work_item_labels wl ON w.id = wl.work_item_id`;
      const placeholders = filters.labelIds.map(() => '?').join(', ');
      whereClauses.push(`wl.label_id IN (${placeholders})`);
      values.push(...filters.labelIds);
    }

    if (filters?.searchText) {
      sql += ` INNER JOIN work_items_fts fts ON w.id = fts.rowid`;
      whereClauses.push('work_items_fts MATCH ?');
      values.push(filters.searchText);
    }

    sql += ` WHERE ${whereClauses.join(' AND ')}`;
    sql += ` GROUP BY w.id ORDER BY w.sort_order ASC, w.created_at ASC`;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...values) as WorkItemRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        WorkItem,
        | 'title'
        | 'description'
        | 'stateId'
        | 'priority'
        | 'parentId'
        | 'sortOrder'
        | 'startDate'
        | 'dueDate'
        | 'estimateValue'
        | 'customPropertyValues'
      >
    >
  ): Promise<void> {
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (fields.title !== undefined) {
      setClauses.push('title = ?');
      values.push(fields.title);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      values.push(fields.description);
    }
    if (fields.stateId !== undefined) {
      setClauses.push('state_id = ?');
      values.push(fields.stateId);
    }
    if (fields.priority !== undefined) {
      setClauses.push('priority = ?');
      values.push(fields.priority);
    }
    if (fields.parentId !== undefined) {
      setClauses.push('parent_id = ?');
      values.push(fields.parentId);
    }
    if (fields.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      values.push(fields.sortOrder);
    }
    if (fields.startDate !== undefined) {
      setClauses.push('start_date = ?');
      values.push(fields.startDate instanceof Date ? fields.startDate.getTime() : fields.startDate);
    }
    if (fields.dueDate !== undefined) {
      setClauses.push('due_date = ?');
      values.push(fields.dueDate instanceof Date ? fields.dueDate.getTime() : fields.dueDate);
    }
    if (fields.estimateValue !== undefined) {
      setClauses.push('estimate_value = ?');
      values.push(fields.estimateValue);
    }
    if (fields.customPropertyValues !== undefined) {
      setClauses.push('custom_property_values = ?');
      values.push(fields.customPropertyValues);
    }

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE work_items SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
    );
    stmt.run(...values);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE work_items SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }

  async addLabel(workItemId: string, labelId: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO work_item_labels (work_item_id, label_id) VALUES (?, ?)'
    );
    stmt.run(workItemId, labelId);
  }

  async removeLabel(workItemId: string, labelId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM work_item_labels WHERE work_item_id = ? AND label_id = ?'
    );
    stmt.run(workItemId, labelId);
  }

  async addAssignee(workItemId: string, assigneeId: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO work_item_assignees (work_item_id, assignee_id) VALUES (?, ?)'
    );
    stmt.run(workItemId, assigneeId);
  }

  async removeAssignee(workItemId: string, assigneeId: string): Promise<void> {
    const stmt = this.db.prepare(
      'DELETE FROM work_item_assignees WHERE work_item_id = ? AND assignee_id = ?'
    );
    stmt.run(workItemId, assigneeId);
  }

  async getLabels(workItemId: string): Promise<string[]> {
    const stmt = this.db.prepare('SELECT label_id FROM work_item_labels WHERE work_item_id = ?');
    const rows = stmt.all(workItemId) as { label_id: string }[];
    return rows.map((r) => r.label_id);
  }

  async getAssignees(workItemId: string): Promise<string[]> {
    const stmt = this.db.prepare(
      'SELECT assignee_id FROM work_item_assignees WHERE work_item_id = ?'
    );
    const rows = stmt.all(workItemId) as { assignee_id: string }[];
    return rows.map((r) => r.assignee_id);
  }
}
