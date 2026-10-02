/**
 * SQLite implementation of IHarnessEvalRepository (spec 119).
 */
import type Database from 'better-sqlite3';
import type { HarnessEvalResult, HarnessEvalRun } from '../../../domain/generated/output.js';
import type { IHarnessEvalRepository } from '../../../application/ports/output/harness/index.js';
import { SqliteDocumentTable } from './sqlite-document-table.js';

const DEFAULT_RUN_LIMIT = 50;

export class SQLiteHarnessEvalRepository implements IHarnessEvalRepository {
  private readonly runs: SqliteDocumentTable<HarnessEvalRun>;
  private readonly results: SqliteDocumentTable<HarnessEvalResult>;

  constructor(db: Database.Database) {
    this.runs = new SqliteDocumentTable<HarnessEvalRun>(db, {
      table: 'harness_eval_runs',
      columns: { suite: (r) => r.suite, status: (r) => r.status },
    });
    this.results = new SqliteDocumentTable<HarnessEvalResult>(db, {
      table: 'harness_eval_results',
      columns: {
        run_id: (r) => r.runId,
        case_id: (r) => r.caseId,
        variant: (r) => r.variant,
      },
    });
  }

  async putRun(run: HarnessEvalRun): Promise<void> {
    this.runs.upsert(run);
  }

  async getRun(id: string): Promise<HarnessEvalRun | null> {
    return this.runs.get(id);
  }

  async listRuns(limit = DEFAULT_RUN_LIMIT): Promise<HarnessEvalRun[]> {
    return this.runs.query(
      'SELECT data FROM harness_eval_runs ORDER BY created_at DESC LIMIT ?',
      limit
    );
  }

  async putResult(result: HarnessEvalResult): Promise<void> {
    this.results.upsert(result);
  }

  async listResults(runId: string): Promise<HarnessEvalResult[]> {
    return this.results.query(
      'SELECT data FROM harness_eval_results WHERE run_id = ? ORDER BY case_id ASC, variant ASC, created_at ASC',
      runId
    );
  }
}
