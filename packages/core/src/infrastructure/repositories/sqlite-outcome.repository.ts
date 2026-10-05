/** SQLite opportunity outcome repository (spec 130). */

import type Database from 'better-sqlite3';
import { OutcomeVerdict, type OpportunityOutcome } from '../../domain/generated/output.js';
import type {
  IOutcomeRepository,
  OutcomeFilter,
} from '../../application/ports/output/repositories/outcome-repository.interface.js';
import {
  outcomeFromDatabase,
  outcomeToDatabase,
  type OutcomeRow,
} from '../persistence/sqlite/mappers/outcome.mapper.js';

const COLUMNS = `id, opportunity_id, space_id, shipped_at, review_at, verdict, signals_before,
  signals_after, judged_at, actual_review_hours, created_at, updated_at`;
const VALUES = `@id, @opportunity_id, @space_id, @shipped_at, @review_at, @verdict,
  @signals_before, @signals_after, @judged_at, @actual_review_hours, @created_at, @updated_at`;

export class SQLiteOutcomeRepository implements IOutcomeRepository {
  constructor(private readonly db: Database.Database) {}

  async list(filter: OutcomeFilter = {}): Promise<OpportunityOutcome[]> {
    const rows = (
      filter.spaceId === undefined
        ? this.db
            .prepare('SELECT * FROM opportunity_outcomes ORDER BY shipped_at DESC, id DESC')
            .all()
        : this.db
            .prepare(
              'SELECT * FROM opportunity_outcomes WHERE space_id = ? ORDER BY shipped_at DESC, id DESC'
            )
            .all(filter.spaceId)
    ) as OutcomeRow[];
    return rows.map(outcomeFromDatabase);
  }

  async listDue(at: Date): Promise<OpportunityOutcome[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM opportunity_outcomes WHERE verdict = ? AND review_at <= ? ORDER BY review_at'
      )
      .all(OutcomeVerdict.Pending, at.getTime()) as OutcomeRow[];
    return rows.map(outcomeFromDatabase);
  }

  async findByOpportunity(opportunityId: string): Promise<OpportunityOutcome | null> {
    const row = this.db
      .prepare('SELECT * FROM opportunity_outcomes WHERE opportunity_id = ?')
      .get(opportunityId) as OutcomeRow | undefined;
    return row ? outcomeFromDatabase(row) : null;
  }

  async create(outcome: OpportunityOutcome): Promise<void> {
    this.db
      .prepare(`INSERT INTO opportunity_outcomes (${COLUMNS}) VALUES (${VALUES})`)
      .run(outcomeToDatabase(outcome));
  }

  async update(outcome: OpportunityOutcome): Promise<void> {
    this.db
      .prepare(`INSERT OR REPLACE INTO opportunity_outcomes (${COLUMNS}) VALUES (${VALUES})`)
      .run(outcomeToDatabase(outcome));
  }
}
