/**
 * @module Shep.Domain.ValueObjects.DiagnosticStatus
 *
 * Status of a single `shep doctor` diagnostic. Backs the `IDiagnostic.run`
 * port's return type so no diagnostic implementation can return a raw
 * status string (NFR-3).
 */
/**
 * Diagnostic Status
 *
 * Three terminal states. `Warn` is reserved for non-blocking soft failures
 * (e.g. a 3 s timeout) so a slow check does not block the doctor command
 * (NFR-7).
 */
@doc("Status of a single shep doctor diagnostic")
enum DiagnosticStatus {
  @doc("Check passed — no action needed")
  Ok: "ok",

  @doc("Check is non-blocking but worth surfacing (e.g. timeout, recommended-but-missing)")
  Warn: "warn",

  @doc("Check failed — requires action before a contributor can ship")
  Fail: "fail",
}
