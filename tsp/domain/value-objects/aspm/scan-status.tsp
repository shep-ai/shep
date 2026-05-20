/**
 * @module Shep.Domain.ValueObjects.Aspm.ScanStatus
 *
 * The terminal-state set for a ScanRun. Partial means at least one stage
 * failed but other stages produced usable findings — the run is not a
 * total loss and the UI should surface what it has (NFR-25).
 */
@doc("Lifecycle state of a ScanRun")
enum ScanStatus {
  @doc("Queued, not yet started")
  Pending: "Pending",

  @doc("At least one stage is running")
  Running: "Running",

  @doc("Every enabled stage completed successfully")
  Succeeded: "Succeeded",

  @doc("Every enabled stage failed or the orchestrator could not start")
  Failed: "Failed",

  @doc("At least one stage failed but other stages produced results")
  Partial: "Partial",
}
