/**
 * Outcome metrics per learned-harness version, and the comparison with its
 * parent that flags a regression (spec 150).
 *
 * These are slow, confounded signals — different features run on different
 * versions — so nothing is judged until both sides have a minimum sample, and
 * a verdict only flags; rollback stays a person's decision.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { HarnessVersionTrend, type HarnessVersionOutcome } from '../generated/output';

export interface VersionMetricsSummary {
  count: number;
  mergeRate: number;
  meanCiFixAttempts: number;
  meanGateRejections: number;
  meanValidationRepairs: number;
  meanNumTurns: number;
  meanCostUsd: number;
}

/** Relative change in the composite friction score treated as noise. */
export const TREND_TOLERANCE = 0.15;

/** Weights of the friction score: each unit is "one extra thing went wrong". */
const WEIGHT_CI_FIX = 1;
const WEIGHT_GATE_REJECTION = 1.5;
const WEIGHT_VALIDATION_REPAIR = 0.5;
const WEIGHT_NOT_MERGED = 2;
const TURNS_PER_FRICTION_UNIT = 50;

const mean = (values: number[]): number =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

export function summarizeOutcomes(
  outcomes: readonly HarnessVersionOutcome[]
): VersionMetricsSummary {
  return {
    count: outcomes.length,
    mergeRate: mean(outcomes.map((o) => (o.merged ? 1 : 0))),
    meanCiFixAttempts: mean(outcomes.map((o) => o.ciFixAttempts)),
    meanGateRejections: mean(outcomes.map((o) => o.gateRejections)),
    meanValidationRepairs: mean(outcomes.map((o) => o.validationRepairs)),
    meanNumTurns: mean(outcomes.map((o) => o.numTurns)),
    meanCostUsd: mean(outcomes.map((o) => o.costUsd)),
  };
}

/** Lower is better: weighted count of things that went wrong per feature. */
export function frictionScore(s: VersionMetricsSummary): number {
  return (
    WEIGHT_CI_FIX * s.meanCiFixAttempts +
    WEIGHT_GATE_REJECTION * s.meanGateRejections +
    WEIGHT_VALIDATION_REPAIR * s.meanValidationRepairs +
    WEIGHT_NOT_MERGED * (1 - s.mergeRate) +
    s.meanNumTurns / TURNS_PER_FRICTION_UNIT
  );
}

export interface VersionComparison {
  trend: HarnessVersionTrend;
  child: VersionMetricsSummary;
  parent: VersionMetricsSummary;
  /** (child − parent) / parent friction; positive is worse. */
  relativeChange: number;
}

export function compareToParent(
  child: readonly HarnessVersionOutcome[],
  parent: readonly HarnessVersionOutcome[],
  minSample: number,
  tolerance = TREND_TOLERANCE
): VersionComparison {
  const c = summarizeOutcomes(child);
  const p = summarizeOutcomes(parent);
  const pf = frictionScore(p);
  const cf = frictionScore(c);
  const relativeChange = pf > 0 ? (cf - pf) / pf : cf > 0 ? 1 : 0;
  let trend: HarnessVersionTrend;
  if (c.count < minSample || p.count < minSample) trend = HarnessVersionTrend.InsufficientData;
  else if (relativeChange > tolerance) trend = HarnessVersionTrend.Regressed;
  else if (relativeChange < -tolerance) trend = HarnessVersionTrend.Improved;
  else trend = HarnessVersionTrend.Unchanged;
  return { trend, child: c, parent: p, relativeChange };
}
