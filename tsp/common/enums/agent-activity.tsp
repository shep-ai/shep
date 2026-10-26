/**
 * @module Shep.Common.Enums.AgentActivity
 *
 * Agent activity (spec 148): the answer to "is this feature working, blocked
 * on me, or done — and why", for callers outside shep's own UI (MCP clients,
 * A2A orchestrators, `shep feat status` / `wait`, terminal hosts like Herdr).
 *
 * Both enums are derived, never stored. `explainFeatureState` in
 * `domain/shared/feature-state.ts` returns a `FeatureState` with the
 * `FeatureStateReason` that decided it; `activityOf` in
 * `domain/shared/agent-activity.ts` folds that into an `AgentActivityState`.
 */
@doc("What a feature's agent is doing, in the vocabulary other agent systems share")
enum AgentActivityState {
  @doc("An agent is executing")
  Working: "working",

  @doc("The user must act: an approval gate, an agent question, or a review")
  Blocked: "blocked",

  @doc("Not started: queued for a slot, deferred, or waiting on a parent feature")
  Waiting: "waiting",

  @doc("Finished, or archived")
  Done: "done",

  @doc("The run failed, was interrupted or cancelled, or its process died")
  Failed: "failed",
}

@doc("Why a feature is in its state: the rule that decided it")
enum FeatureStateReason {
  @doc("The feature is being deleted")
  Deleting: "deleting",

  @doc("The user archived the feature")
  Archived: "archived",

  @doc("Waiting for a free slot under the parallel-feature limit")
  QueuedForCapacity: "queued-for-capacity",

  @doc("Deferred by the user; no agent has started")
  Deferred: "deferred",

  @doc("Waiting on a parent feature to finish")
  WaitingOnParent: "waiting-on-parent",

  @doc("The run is waiting at an approval gate")
  ApprovalGate: "approval-gate",

  @doc("The agent asked a question that is still open")
  AgentQuestion: "agent-question",

  @doc("The run failed")
  RunFailed: "run-failed",

  @doc("The run was interrupted")
  RunInterrupted: "run-interrupted",

  @doc("The run was cancelled")
  RunCancelled: "run-cancelled",

  @doc("The run completed")
  RunCompleted: "run-completed",

  @doc("An agent run is executing")
  AgentRunning: "agent-running",

  @doc("The run should be executing but its process is gone")
  ProcessDied: "process-died",

  @doc("The feature is in maintenance with no run")
  Maintained: "maintained",

  @doc("An adopted pull request waits for the user's review")
  AwaitingReview: "awaiting-review",

  @doc("A plan task waits for the user's review")
  PlanTaskInReview: "plan-task-in-review",

  @doc("Every plan task is done")
  PlanTasksDone: "plan-tasks-done",

  @doc("Work is in progress with no run to report on")
  InProgress: "in-progress",
}
