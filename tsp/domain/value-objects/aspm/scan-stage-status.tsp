/**
 * @module Shep.Domain.ValueObjects.Aspm.ScanStageStatus
 *
 * Per-stage lifecycle. Separate from ScanStatus because a single ScanRun
 * has many stages and the SSE stream needs per-stage transitions for the
 * progress panel.
 */
@doc("Lifecycle state of a single scan stage within a ScanRun")
enum ScanStageStatus {
  @doc("Stage not yet started")
  Pending: "Pending",

  @doc("Stage is actively running")
  Running: "Running",

  @doc("Stage completed and produced results")
  Succeeded: "Succeeded",

  @doc("Stage threw or returned an error")
  Failed: "Failed",

  @doc("Stage was skipped because it was disabled in the ScannerProfile")
  Skipped: "Skipped",
}
