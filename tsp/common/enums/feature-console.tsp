/**
 * @module Shep.Common.Enums.FeatureConsole
 *
 * Defines the state a feature shows on every surface, and the actions the
 * terminal feature console (`shep tui`, spec 142) can offer on it.
 *
 * `FeatureState` is derived, never stored: `deriveFeatureState` in
 * `domain/shared/feature-state.ts` computes it from the feature's lifecycle and
 * its current agent run. The web canvas, the feature tree and the console all
 * read it from there, so they cannot disagree about a feature.
 *
 * The wire values match the web's historical `FeatureNodeState` strings, so the
 * web maps them one-to-one (only `queued` folds into its `pending`).
 */
@doc("What a feature is doing right now, as every surface shows it")
enum FeatureState {
  @doc("An agent is executing a phase")
  Running: "running",

  @doc("Waiting on the user: an approval gate, or an adopted PR to review")
  ActionRequired: "action-required",

  @doc("Waiting on a parent feature to finish")
  Blocked: "blocked",

  @doc("Deferred by the user; no agent has started")
  Pending: "pending",

  @doc("Waiting for a free slot under the parallel-feature limit; starts on its own")
  Queued: "queued",

  @doc("Finished")
  Done: "done",

  @doc("The run failed, was interrupted or cancelled, or its process died")
  Error: "error",

  @doc("Being removed")
  Deleting: "deleting",

  @doc("Archived by the user")
  Archived: "archived",
}

@doc("An action the feature console can run on one feature")
enum FeatureConsoleAction {
  @doc("Approve the gate the run is waiting at")
  Approve: "approve",

  @doc("Reject the gate with feedback; the agent iterates")
  Reject: "reject",

  @doc("Stop the executing run (it stays resumable)")
  Stop: "stop",

  @doc("Resume an interrupted or failed run")
  Resume: "resume",
}
