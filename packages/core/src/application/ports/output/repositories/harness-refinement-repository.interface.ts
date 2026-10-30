/**
 * Harness Refinement Repository Interface (Output Port, spec 150)
 *
 * Persists one record per harness refinement (its mode, budget ledger, cost and
 * result) and one outcome row per finished feature for the learned-harness
 * version it ran on, which the regression check reads.
 */

import type {
  HarnessRefinementRun,
  HarnessVersionOutcome,
} from '../../../../domain/generated/output.js';

export interface IHarnessRefinementRepository {
  createRun(run: HarnessRefinementRun): Promise<void>;

  /** Replace a run's mutable fields (status, ledger, cost, result), bumping updatedAt. */
  updateRun(run: HarnessRefinementRun): Promise<void>;

  findRun(id: string): Promise<HarnessRefinementRun | null>;

  /** Refinements of one feature, newest first. */
  listRunsByFeature(featureId: string): Promise<HarnessRefinementRun[]>;

  /** Record (or replace) how one feature did on one version. */
  upsertOutcome(outcome: HarnessVersionOutcome): Promise<void>;

  listOutcomes(versionId: string): Promise<HarnessVersionOutcome[]>;
}
