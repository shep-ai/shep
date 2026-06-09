/**
 * @module Shep.Domain.ValueObjects.Aspm.SLAWindow
 *
 * SLA window expressed in calendar days, keyed by canonical severity.
 * Stored on SecurityPolicy and consumed by the pure-domain SLA computation.
 * Defaults match CISA BOD 22-01-style expectations.
 */
import "./canonical-severity.tsp";

@doc("SLA window (calendar days) for a single canonical severity")
model SLAWindow {
  @doc("Canonical severity this window applies to")
  severity: CanonicalSeverity;

  @doc("SLA window in calendar days from discoveredAt")
  windowDays: int32;
}
