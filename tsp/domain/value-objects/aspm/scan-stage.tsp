/**
 * @module Shep.Domain.ValueObjects.Aspm.ScanStage
 *
 * A single stage within a ScanRun. Embedded in ScanRun.stages and
 * persisted as JSON inside scan_runs.stages_json — stages are
 * append-only within a run; the orchestrator never mutates a stage
 * after it transitions to a terminal state.
 */
import "./scan-stage-name.tsp";
import "./scan-stage-status.tsp";

@doc("One stage of a ScanRun, with timing + outcome metadata")
model ScanStage {
  @doc("Which stage this is (sbom/sca/secrets/sast/container/iac)")
  name: ScanStageName;

  @doc("Lifecycle state of this stage")
  status: ScanStageStatus;

  @doc("When this stage transitioned to Running")
  startedAt?: utcDateTime;

  @doc("When this stage transitioned to a terminal state")
  finishedAt?: utcDateTime;

  @doc("Number of findings this stage produced (after dedup)")
  findingsCount?: int32;

  @doc("Number of components this stage produced (only meaningful for sbom)")
  componentsCount?: int32;

  @doc("Short human-readable error summary when status=Failed")
  errorMessage?: string;
}
