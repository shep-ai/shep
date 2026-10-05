/** SQLite autopilot policy and pass repositories (spec 132). */

import type Database from 'better-sqlite3';
import type { AutopilotPolicy, AutopilotRun } from '../../domain/generated/output.js';
import type {
  IAutopilotPolicyRepository,
  IAutopilotRunRepository,
} from '../../application/ports/output/repositories/autopilot-repository.interface.js';
import {
  policyFromDatabase,
  policyToDatabase,
  runFromDatabase,
  runToDatabase,
  type AutopilotPolicyRow,
  type AutopilotRunRow,
} from '../persistence/sqlite/mappers/autopilot.mapper.js';

/** Passes a space's history lists unless asked for fewer. */
const DEFAULT_HISTORY = 20;

export class SQLiteAutopilotPolicyRepository implements IAutopilotPolicyRepository {
  constructor(private readonly db: Database.Database) {}

  async find(spaceId: string): Promise<AutopilotPolicy | null> {
    const row = this.db
      .prepare('SELECT * FROM autopilot_policies WHERE space_id = ?')
      .get(spaceId) as AutopilotPolicyRow | undefined;
    return row ? policyFromDatabase(row) : null;
  }

  async list(): Promise<AutopilotPolicy[]> {
    const rows = this.db
      .prepare('SELECT * FROM autopilot_policies ORDER BY space_id')
      .all() as AutopilotPolicyRow[];
    return rows.map(policyFromDatabase);
  }

  async save(policy: AutopilotPolicy): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO autopilot_policies (space_id, investigate_urgent, fix_confident,
          merge_fixes, fill_line, project_id, daily_fix_budget, updated_at)
         VALUES (@space_id, @investigate_urgent, @fix_confident, @merge_fixes, @fill_line,
          @project_id, @daily_fix_budget, @updated_at)`
      )
      .run(policyToDatabase(policy));
  }
}

export class SQLiteAutopilotRunRepository implements IAutopilotRunRepository {
  constructor(private readonly db: Database.Database) {}

  async listBySpace(spaceId: string, limit = DEFAULT_HISTORY): Promise<AutopilotRun[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM autopilot_runs WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
      )
      .all(spaceId, limit) as AutopilotRunRow[];
    return rows.map(runFromDatabase);
  }

  async create(run: AutopilotRun): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO autopilot_runs (id, space_id, investigated, fixed, built, errors, created_at,
          updated_at)
         VALUES (@id, @space_id, @investigated, @fixed, @built, @errors, @created_at, @updated_at)`
      )
      .run(runToDatabase(run));
  }
}
