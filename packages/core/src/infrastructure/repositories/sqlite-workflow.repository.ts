/**
 * SQLite Workflow Repository Implementation
 *
 * Implements IWorkflowRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 * Excludes soft-deleted workflows (deleted_at IS NOT NULL) from queries by default.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type {
  IWorkflowRepository,
  WorkflowListFilters,
} from '../../application/ports/output/repositories/workflow-repository.interface.js';
import type { ScheduledWorkflow } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type ScheduledWorkflowRow,
} from '../persistence/sqlite/mappers/workflow.mapper.js';

/**
 * SQLite implementation of IWorkflowRepository.
 * Manages ScheduledWorkflow persistence with CRUD operations.
 */
@injectable()
export class SQLiteWorkflowRepository implements IWorkflowRepository {
  constructor(private readonly db: Database.Database) {}

  async create(workflow: ScheduledWorkflow): Promise<void> {
    const row = toDatabase(workflow);

    const stmt = this.db.prepare(`
      INSERT INTO scheduled_workflows (
        id, name, description, prompt, tool_constraints,
        cron_expression, timezone, enabled,
        last_run_at, next_run_at,
        repository_path, deleted_at,
        created_at, updated_at
      ) VALUES (
        @id, @name, @description, @prompt, @tool_constraints,
        @cron_expression, @timezone, @enabled,
        @last_run_at, @next_run_at,
        @repository_path, @deleted_at,
        @created_at, @updated_at
      )
    `);

    stmt.run(row);
  }

  async findById(id: string): Promise<ScheduledWorkflow | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM scheduled_workflows WHERE id = ? AND deleted_at IS NULL'
    );
    const row = stmt.get(id) as ScheduledWorkflowRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByName(name: string, repositoryPath: string): Promise<ScheduledWorkflow | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM scheduled_workflows WHERE name = ? AND REPLACE(repository_path, '\\', '/') = ? AND deleted_at IS NULL"
    );
    const row = stmt.get(name, repositoryPath.replace(/\\/g, '/')) as
      | ScheduledWorkflowRow
      | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findEnabled(): Promise<ScheduledWorkflow[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM scheduled_workflows WHERE enabled = 1 AND deleted_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as ScheduledWorkflowRow[];

    return rows.map(fromDatabase);
  }

  async list(filters?: WorkflowListFilters): Promise<ScheduledWorkflow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filters?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filters?.repositoryPath) {
      conditions.push("REPLACE(repository_path, '\\', '/') = ?");
      params.push(filters.repositoryPath.replace(/\\/g, '/'));
    }

    if (filters?.enabled !== undefined) {
      conditions.push('enabled = ?');
      params.push(filters.enabled ? 1 : 0);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(
      `SELECT * FROM scheduled_workflows${where} ORDER BY created_at ASC`
    );
    const rows = stmt.all(...params) as ScheduledWorkflowRow[];

    return rows.map(fromDatabase);
  }

  async update(workflow: ScheduledWorkflow): Promise<void> {
    const row = toDatabase(workflow);

    const stmt = this.db.prepare(`
      UPDATE scheduled_workflows SET
        name = @name,
        description = @description,
        prompt = @prompt,
        tool_constraints = @tool_constraints,
        cron_expression = @cron_expression,
        timezone = @timezone,
        enabled = @enabled,
        last_run_at = @last_run_at,
        next_run_at = @next_run_at,
        repository_path = @repository_path,
        deleted_at = @deleted_at,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(row);
  }

  async softDelete(id: string): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(
      'UPDATE scheduled_workflows SET deleted_at = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(now, now, id);
  }
}
