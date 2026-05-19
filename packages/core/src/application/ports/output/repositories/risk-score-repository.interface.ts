/**
 * RiskScore Repository Interface (Output Port)
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-25. Backed by
 * the append-only `risk_scores` table (migration 110). Each call to
 * {@link append} writes a new history row — the table is never updated or
 * deleted. The latest score for a finding is reachable in O(1) via the
 * `SecurityFinding.currentRiskScoreId` pointer, which the
 * `compute-risk-score-for-finding` use case maintains.
 */

import type { RiskScore } from '../../../../domain/generated/output.js';

export interface IRiskScoreRepository {
  /**
   * Append a new RiskScore row. The table is append-only; this never
   * overwrites a prior row for the same `(findingId, computedAt)`.
   */
  append(score: RiskScore): Promise<void>;

  /**
   * Find the most recently computed score for a finding. Returns `null`
   * when the finding has never been scored.
   */
  findCurrentForFinding(findingId: string): Promise<RiskScore | null>;

  /**
   * Full history of risk-score rows for a finding, ordered by `computedAt`
   * descending (newest first). Powers the risk-trend chart (FR-25) and
   * audit views.
   */
  findHistory(findingId: string): Promise<RiskScore[]>;
}
