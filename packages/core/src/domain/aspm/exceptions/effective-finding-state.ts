/**
 * effectiveFindingState — pure-domain read-time finding state.
 *
 * Feature 098, phase 6 (task-35). The "raw" finding state recorded on
 * SecurityFinding doesn't always match what the UI/SLA math should treat
 * as the current state — an Active RiskException temporarily masks the
 * finding as `Exception` while it is in force, and an expired one falls
 * back to the underlying state automatically (FR-23).
 *
 * This function is the single source of truth for that read-time decision:
 *
 *   - No exception            → raw state
 *   - Revoked exception       → raw state
 *   - Soft-deleted exception  → raw state (callers shouldn't pass these but be defensive)
 *   - Active + not expired    → FindingState.Exception
 *   - Active + expired by now → raw state (expiry transition is implicit;
 *                               background jobs convert Active → Expired)
 *
 * Pure: no infra imports, no `Date.now()`, no env access. Time is supplied
 * by the caller (via ISlaClockPort.now in the use-case layer).
 */

import { FindingState, RiskExceptionStatus, type RiskException } from '../../generated/output';

export interface EffectiveStateInputs {
  /** The raw state recorded on the SecurityFinding row. */
  rawState: FindingState;
  /** The most recent exception for the finding (active or otherwise), or null. */
  exception: RiskException | null;
  /** Current wall-clock from {@link ISlaClockPort.now}. */
  now: Date;
}

export function effectiveFindingState(inputs: EffectiveStateInputs): FindingState {
  const { rawState, exception, now } = inputs;

  if (!exception) {
    return rawState;
  }

  if (exception.deletedAt) {
    return rawState;
  }

  if (exception.status !== RiskExceptionStatus.Active) {
    return rawState;
  }

  const expiresAtMs = (exception.expiresAt as Date).getTime();
  if (expiresAtMs <= now.getTime()) {
    return rawState;
  }

  return FindingState.Exception;
}
