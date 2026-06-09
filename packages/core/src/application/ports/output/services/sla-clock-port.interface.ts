/**
 * ISlaClockPort (Output Port) — feature 098, phase 6, task-32.
 *
 * The single source of "now" for ASPM SLA computation, exception expiry
 * checks, and any other read-time pure-domain function that needs a
 * deterministic clock (NFR-9 — Determinism).
 *
 * The domain layer MUST NOT call `Date.now()` or `new Date()` directly;
 * it consumes time through this port. Production binds it to a system
 * clock; tests bind it to a fake clock so SLA / exception math is fully
 * controllable.
 */

export interface ISlaClockPort {
  /**
   * Return the current wall-clock time.
   *
   * Implementations must be cheap to call and free of side-effects so use
   * cases can call it more than once per request without coupling
   * sub-second skew into the result.
   */
  now(): Date;
}
