/**
 * @module Shep.Domain.Entities.Aspm.RiskScore
 *
 * Append-only history of composite risk scores for a SecurityFinding.
 * Each recompute (policy change, KEV/EPSS feed refresh, manual trigger)
 * writes a new row. The SecurityFinding.currentRiskScoreId pointer
 * makes "latest score" lookups O(1) for dashboards while preserving
 * the full history for the risk-trend chart (FR-25) and audit.
 *
 * Extends BaseEntity (not SoftDeletableEntity) — historical scores are
 * never deleted; the whole entity is purely append-only.
 *
 * Per-dimension breakdown lives in the [[RiskScoreBreakdown]] value
 * object embedded on every row.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/risk-score-breakdown.tsp";

@doc("Append-only composite risk-score row for a SecurityFinding")
model RiskScore extends BaseEntity {
  @doc("SecurityFinding this score row belongs to")
  findingId: UUID;

  @doc("Total composite score (0-100)")
  total: int32;

  @doc("Per-dimension breakdown — sum equals total (modulo rounding)")
  breakdown: RiskScoreBreakdown;

  @doc("When the score was computed")
  computedAt: utcDateTime;

  @doc("Stable hash of the scoring inputs (used to dedupe identical recomputes)")
  inputsHash: string;
}
