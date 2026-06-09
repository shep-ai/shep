/**
 * SQLite RiskScore Repository
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-25. Backed by
 * the append-only risk_scores table (migration 110).
 *
 * The repository is the only persistence boundary — use cases reach it via
 * the `IRiskScoreRepository` port and tsyringe injection. The table is
 * append-only so there is no `update` / `softDelete`.
 */

import type Database from 'better-sqlite3';
import { inject, injectable } from 'tsyringe';

import type { RiskScore } from '../../../domain/generated/output.js';
import type { IRiskScoreRepository } from '../../../application/ports/output/repositories/risk-score-repository.interface.js';
import { fromDatabase, toDatabase, type RiskScoreRow } from './mappers/risk-score-mapper.js';

const INSERT_SQL = `INSERT INTO risk_scores (
  id, finding_id, total,
  cvss_contribution, epss_contribution, kev_contribution,
  exposure_contribution, criticality_contribution, data_classification_contribution,
  computed_at, inputs_hash, created_at, updated_at
) VALUES (
  @id, @finding_id, @total,
  @cvss_contribution, @epss_contribution, @kev_contribution,
  @exposure_contribution, @criticality_contribution, @data_classification_contribution,
  @computed_at, @inputs_hash, @created_at, @updated_at
)`;

@injectable()
export class SQLiteRiskScoreRepository implements IRiskScoreRepository {
  constructor(@inject('Database') private readonly db: Database.Database) {}

  async append(score: RiskScore): Promise<void> {
    const row = toDatabase(score);
    this.db.prepare(INSERT_SQL).run(row);
  }

  async findCurrentForFinding(findingId: string): Promise<RiskScore | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM risk_scores
         WHERE finding_id = ?
         ORDER BY computed_at DESC, id DESC
         LIMIT 1`
      )
      .get(findingId) as RiskScoreRow | undefined;
    return row ? fromDatabase(row) : null;
  }

  async findHistory(findingId: string): Promise<RiskScore[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM risk_scores
         WHERE finding_id = ?
         ORDER BY computed_at DESC, id DESC`
      )
      .all(findingId) as RiskScoreRow[];
    return rows.map(fromDatabase);
  }
}
