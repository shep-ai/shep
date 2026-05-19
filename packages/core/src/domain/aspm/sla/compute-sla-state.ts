/**
 * computeSlaState — pure-domain SLA state computation.
 *
 * Feature 098, phase 6 (SLA, Remediation Campaigns & Risk Exceptions),
 * task-33. Derives the SLA band (Healthy / AtRisk / Breached) for a
 * SecurityFinding from `(discoveredAt, severity, policy, now)`.
 *
 * Bands (FR-20):
 *   - Healthy : elapsed < HALF_WINDOW of the policy window for the severity.
 *   - AtRisk  : HALF_WINDOW ≤ elapsed < FULL_WINDOW.
 *   - Breached: elapsed ≥ FULL_WINDOW.
 *
 * Severity `Info` is excluded from SLA tracking by convention — no window
 * exists for it; the function returns `Healthy` (no SLA to breach).
 *
 * This module is PURE — no infra imports, no `Date.now()`, no env access.
 * Time is supplied by the caller via `ISlaClockPort` and threaded in as
 * the `now` argument.
 */

import { CanonicalSeverity, SlaState, type SecurityPolicy } from '../../generated/output';

/** Fraction of the window past which a finding transitions Healthy → AtRisk. */
export const AT_RISK_THRESHOLD_FRACTION = 0.5;

/** Milliseconds per calendar day — used to convert windowDays → window ms. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SlaInputs {
  /** When the finding was first discovered. */
  discoveredAt: Date;
  /** Canonical severity of the finding. */
  severity: CanonicalSeverity;
  /** Active SecurityPolicy carrying SLA windows per severity. */
  policy: SecurityPolicy;
  /** Current wall-clock from {@link ISlaClockPort.now}. */
  now: Date;
}

/**
 * Compute the SLA band for a single finding. Pure and deterministic.
 *
 * Returns {@link SlaState.Healthy} for `Info`-severity findings (no SLA),
 * and for findings whose severity has no matching window on the policy.
 */
export function computeSlaState(inputs: SlaInputs): SlaState {
  const { discoveredAt, severity, policy, now } = inputs;

  if (severity === CanonicalSeverity.Info) {
    return SlaState.Healthy;
  }

  const window = policy.slaWindows.find((w) => w.severity === severity);
  if (!window) {
    return SlaState.Healthy;
  }

  const elapsedMs = Math.max(0, now.getTime() - discoveredAt.getTime());
  const windowMs = window.windowDays * MS_PER_DAY;

  if (windowMs <= 0) {
    return SlaState.Breached;
  }

  if (elapsedMs >= windowMs) {
    return SlaState.Breached;
  }

  if (elapsedMs / windowMs >= AT_RISK_THRESHOLD_FRACTION) {
    return SlaState.AtRisk;
  }

  return SlaState.Healthy;
}
