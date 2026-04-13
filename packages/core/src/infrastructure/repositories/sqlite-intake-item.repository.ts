/**
 * SQLite IntakeItem Repository Implementation
 *
 * Implements IIntakeItemRepository using better-sqlite3.
 * Manages intake items for the triage workflow.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IIntakeItemRepository } from '../../application/ports/output/repositories/intake-item-repository.interface.js';
import type { IntakeItem } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type IntakeItemRow,
} from '../persistence/sqlite/mappers/intake-item.mapper.js';

@injectable()
export class SQLiteIntakeItemRepository implements IIntakeItemRepository {
  constructor(private readonly db: Database.Database) {}

  async create(item: IntakeItem): Promise<void> {
    const row = toDatabase(item);
    const stmt = this.db.prepare(`
      INSERT INTO intake_items (
        id, project_id, title, description, source, status,
        triage_notes, suggested_state_id, suggested_priority,
        suggested_labels, suggested_assignee_id,
        resulting_work_item_id, decline_reason, duplicate_of_work_item_id,
        created_at, updated_at, deleted_at
      ) VALUES (
        @id, @project_id, @title, @description, @source, @status,
        @triage_notes, @suggested_state_id, @suggested_priority,
        @suggested_labels, @suggested_assignee_id,
        @resulting_work_item_id, @decline_reason, @duplicate_of_work_item_id,
        @created_at, @updated_at, @deleted_at
      )
    `);
    stmt.run(row);
  }

  async findById(id: string): Promise<IntakeItem | null> {
    const stmt = this.db.prepare('SELECT * FROM intake_items WHERE id = ? AND deleted_at IS NULL');
    const row = stmt.get(id) as IntakeItemRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async listByProject(projectId: string, status?: string): Promise<IntakeItem[]> {
    if (status) {
      const stmt = this.db.prepare(
        'SELECT * FROM intake_items WHERE project_id = ? AND status = ? AND deleted_at IS NULL ORDER BY created_at DESC'
      );
      const rows = stmt.all(projectId, status) as IntakeItemRow[];
      return rows.map(fromDatabase);
    }
    const stmt = this.db.prepare(
      'SELECT * FROM intake_items WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    );
    const rows = stmt.all(projectId) as IntakeItemRow[];
    return rows.map(fromDatabase);
  }

  async update(
    id: string,
    fields: Partial<
      Pick<
        IntakeItem,
        | 'status'
        | 'triageNotes'
        | 'suggestedStateId'
        | 'suggestedPriority'
        | 'suggestedLabels'
        | 'suggestedAssigneeId'
        | 'resultingWorkItemId'
        | 'declineReason'
        | 'duplicateOfWorkItemId'
      >
    >
  ): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (fields.status !== undefined) {
      sets.push('status = @status');
      params.status = fields.status;
    }
    if (fields.triageNotes !== undefined) {
      sets.push('triage_notes = @triage_notes');
      params.triage_notes = fields.triageNotes;
    }
    if (fields.suggestedStateId !== undefined) {
      sets.push('suggested_state_id = @suggested_state_id');
      params.suggested_state_id = fields.suggestedStateId;
    }
    if (fields.suggestedPriority !== undefined) {
      sets.push('suggested_priority = @suggested_priority');
      params.suggested_priority = fields.suggestedPriority;
    }
    if (fields.suggestedLabels !== undefined) {
      sets.push('suggested_labels = @suggested_labels');
      params.suggested_labels = fields.suggestedLabels;
    }
    if (fields.suggestedAssigneeId !== undefined) {
      sets.push('suggested_assignee_id = @suggested_assignee_id');
      params.suggested_assignee_id = fields.suggestedAssigneeId;
    }
    if (fields.resultingWorkItemId !== undefined) {
      sets.push('resulting_work_item_id = @resulting_work_item_id');
      params.resulting_work_item_id = fields.resultingWorkItemId;
    }
    if (fields.declineReason !== undefined) {
      sets.push('decline_reason = @decline_reason');
      params.decline_reason = fields.declineReason;
    }
    if (fields.duplicateOfWorkItemId !== undefined) {
      sets.push('duplicate_of_work_item_id = @duplicate_of_work_item_id');
      params.duplicate_of_work_item_id = fields.duplicateOfWorkItemId;
    }

    if (sets.length === 0) return;

    sets.push('updated_at = @updated_at');
    params.updated_at = Date.now();

    const stmt = this.db.prepare(`UPDATE intake_items SET ${sets.join(', ')} WHERE id = @id`);
    stmt.run(params);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE intake_items SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
