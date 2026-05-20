/**
 * @module Shep.Domain.Entities.Aspm.ScanRun
 *
 * A single execution of the ASPM scanner orchestrator (Phase 11). One
 * ScanRun per (application, trigger) invocation. Stages live embedded
 * on the row as JSON because they are append-only within the run and
 * the SSE stream needs the whole sequence on every emit.
 *
 * Not soft-deletable — runs are append-only history; deletion would
 * lose audit evidence used by the dashboard's "Last scanned" tile.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/scan-trigger.tsp";
import "../../value-objects/aspm/scan-status.tsp";
import "../../value-objects/aspm/scan-stage.tsp";

@doc("A single execution of the ASPM scanner over one application")
model ScanRun extends BaseEntity {
  @doc("Application this scan targeted")
  applicationId: UUID;

  @doc("Origin of this scan invocation")
  triggeredBy: ScanTrigger;

  @doc("Lifecycle state of the run")
  status: ScanStatus;

  @doc("When the run transitioned to Running")
  startedAt: utcDateTime;

  @doc("When the run transitioned to a terminal state (Succeeded/Failed/Partial)")
  finishedAt?: utcDateTime;

  @doc("Per-stage progress. Order matches ScannerProfile.enabledStages.")
  stages: ScanStage[];

  @doc("Total findings produced across all stages of this run (after dedup)")
  findingsCount: int32;
}
