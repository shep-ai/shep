/**
 * RiskScore Database Mapper
 *
 * Feature 098, phase 5 (Risk Scoring & Prioritization), task-25. Maps
 * between the RiskScore domain object and rows in the risk_scores table
 * (migration 110). The table is append-only — once written, a row is
 * never updated or deleted, so this mapper is symmetric and stateless.
 *
 * The per-dimension breakdown is stored as flat columns (not JSON) so
 * SQL aggregations can read individual contributions without parsing.
 */

import type { RiskScore } from '../../../../domain/generated/output.js';

export interface RiskScoreRow {
  id: string;
  finding_id: string;
  total: number;
  cvss_contribution: number;
  epss_contribution: number;
  kev_contribution: number;
  exposure_contribution: number;
  criticality_contribution: number;
  data_classification_contribution: number;
  computed_at: number;
  inputs_hash: string;
  created_at: number;
  updated_at: number;
}

function toMillis(value: Date | number): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

export function toDatabase(score: RiskScore): RiskScoreRow {
  return {
    id: score.id,
    finding_id: score.findingId,
    total: score.total,
    cvss_contribution: score.breakdown.cvssContribution,
    epss_contribution: score.breakdown.epssContribution,
    kev_contribution: score.breakdown.kevContribution,
    exposure_contribution: score.breakdown.exposureContribution,
    criticality_contribution: score.breakdown.criticalityContribution,
    data_classification_contribution: score.breakdown.dataClassificationContribution,
    computed_at: toMillis(score.computedAt as Date),
    inputs_hash: score.inputsHash,
    created_at: toMillis(score.createdAt),
    updated_at: toMillis(score.updatedAt),
  };
}

export function fromDatabase(row: RiskScoreRow): RiskScore {
  return {
    id: row.id,
    findingId: row.finding_id,
    total: row.total,
    breakdown: {
      total: row.total,
      cvssContribution: row.cvss_contribution,
      epssContribution: row.epss_contribution,
      kevContribution: row.kev_contribution,
      exposureContribution: row.exposure_contribution,
      criticalityContribution: row.criticality_contribution,
      dataClassificationContribution: row.data_classification_contribution,
    },
    computedAt: new Date(row.computed_at),
    inputsHash: row.inputs_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
