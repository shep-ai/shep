/** SQLite work item investigation repository (spec 123). */

import type Database from 'better-sqlite3';
import type { WorkItemInvestigation } from '../../domain/generated/output.js';
import type { IInvestigationRepository } from '../../application/ports/output/repositories/investigation-repository.interface.js';
import {
  investigationFromDatabase,
  investigationToDatabase,
  type InvestigationRow,
} from '../persistence/sqlite/mappers/investigation.mapper.js';

export class SQLiteInvestigationRepository implements IInvestigationRepository {
  constructor(private readonly db: Database.Database) {}

  async findById(id: string): Promise<WorkItemInvestigation | null> {
    const row = this.db.prepare('SELECT * FROM work_item_investigations WHERE id = ?').get(id) as
      | InvestigationRow
      | undefined;
    return row ? investigationFromDatabase(row) : null;
  }

  async listByWorkItem(workItemId: string): Promise<WorkItemInvestigation[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM work_item_investigations WHERE work_item_id = ? ORDER BY created_at DESC'
      )
      .all(workItemId) as InvestigationRow[];
    return rows.map(investigationFromDatabase);
  }

  async create(investigation: WorkItemInvestigation): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO work_item_investigations (id, work_item_id, repository_path, commit_sha,
           status, summary, hypotheses, agent_type, error, started_at, finished_at,
           approved_hypothesis_number, feature_id, created_at, updated_at)
         VALUES (@id, @work_item_id, @repository_path, @commit_sha, @status, @summary,
           @hypotheses, @agent_type, @error, @started_at, @finished_at,
           @approved_hypothesis_number, @feature_id, @created_at, @updated_at)`
      )
      .run(investigationToDatabase(investigation));
  }

  async update(investigation: WorkItemInvestigation): Promise<void> {
    this.db
      .prepare(
        `UPDATE work_item_investigations SET work_item_id = @work_item_id,
           repository_path = @repository_path, commit_sha = @commit_sha, status = @status,
           summary = @summary, hypotheses = @hypotheses, agent_type = @agent_type,
           error = @error, started_at = @started_at, finished_at = @finished_at,
           approved_hypothesis_number = @approved_hypothesis_number, feature_id = @feature_id,
           updated_at = @updated_at
         WHERE id = @id`
      )
      .run(investigationToDatabase(investigation));
  }
}
