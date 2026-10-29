/**
 * SQLite harness-refinement repository (spec 150).
 *
 * Implements IHarnessRefinementRepository over harness_refinement_runs and
 * learned_harness_outcomes (migration 176).
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IHarnessRefinementRepository } from '../../application/ports/output/repositories/harness-refinement-repository.interface.js';
import type { HarnessRefinementRun, HarnessVersionOutcome } from '../../domain/generated/output.js';
import {
  outcomeFromRow,
  outcomeToRow,
  runFromRow,
  runToRow,
  type HarnessOutcomeRow,
  type HarnessRefinementRunRow,
} from '../persistence/sqlite/mappers/learned-harness.mapper.js';

@injectable()
export class SQLiteHarnessRefinementRepository implements IHarnessRefinementRepository {
  constructor(private readonly db: Database.Database) {}

  async createRun(run: HarnessRefinementRun): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO harness_refinement_runs (
          id, feature_id, repository_path, mode, recursion, k, rollouts, sessions, cost_usd,
          status, candidate_version_id, chosen_label, selection_reason, error, created_at, updated_at
        ) VALUES (
          @id, @feature_id, @repository_path, @mode, @recursion, @k, @rollouts, @sessions, @cost_usd,
          @status, @candidate_version_id, @chosen_label, @selection_reason, @error, @created_at, @updated_at
        )`
      )
      .run(runToRow(run));
  }

  async updateRun(run: HarnessRefinementRun): Promise<void> {
    this.db
      .prepare(
        `UPDATE harness_refinement_runs SET
          recursion = @recursion, k = @k, rollouts = @rollouts, sessions = @sessions,
          cost_usd = @cost_usd, status = @status, candidate_version_id = @candidate_version_id,
          chosen_label = @chosen_label, selection_reason = @selection_reason, error = @error,
          updated_at = @updated_at
        WHERE id = @id`
      )
      .run({ ...runToRow(run), updated_at: Date.now() });
  }

  async findRun(id: string): Promise<HarnessRefinementRun | null> {
    const row = this.db.prepare('SELECT * FROM harness_refinement_runs WHERE id = ?').get(id) as
      | HarnessRefinementRunRow
      | undefined;
    return row ? runFromRow(row) : null;
  }

  async listRunsByFeature(featureId: string): Promise<HarnessRefinementRun[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM harness_refinement_runs WHERE feature_id = ? ORDER BY created_at DESC, id DESC'
      )
      .all(featureId) as HarnessRefinementRunRow[];
    return rows.map(runFromRow);
  }

  async upsertOutcome(outcome: HarnessVersionOutcome): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO learned_harness_outcomes (
          id, version_id, feature_id, ci_fix_attempts, gate_rejections, validation_repairs,
          num_turns, cost_usd, merged, created_at, updated_at
        ) VALUES (
          @id, @version_id, @feature_id, @ci_fix_attempts, @gate_rejections, @validation_repairs,
          @num_turns, @cost_usd, @merged, @created_at, @updated_at
        )
        ON CONFLICT(version_id, feature_id) DO UPDATE SET
          ci_fix_attempts = excluded.ci_fix_attempts,
          gate_rejections = excluded.gate_rejections,
          validation_repairs = excluded.validation_repairs,
          num_turns = excluded.num_turns,
          cost_usd = excluded.cost_usd,
          merged = excluded.merged,
          updated_at = excluded.updated_at`
      )
      .run(outcomeToRow(outcome));
  }

  async listOutcomes(versionId: string): Promise<HarnessVersionOutcome[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM learned_harness_outcomes WHERE version_id = ? ORDER BY created_at, id'
      )
      .all(versionId) as HarnessOutcomeRow[];
    return rows.map(outcomeFromRow);
  }
}
