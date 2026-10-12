/**
 * @module Shep.Common.Enums.FeatureCoordination
 *
 * Agent-owned coordination of two active features whose committed changes
 * overlap (spec 141). The agent chooses the action; the runtime reports what
 * became of the attempt.
 */
@doc("What the coordinating agent chose for an overlapping pair of features")
enum CoordinationAction {
  @doc("The designated dependent waits until its prerequisite has landed")
  Defer: "defer",

  @doc("Both features keep running side by side")
  Continue: "continue",
}

@doc("What became of one coordination attempt")
enum CoordinationOutcome {
  @doc("The agentCoordination feature flag is off")
  Disabled: "disabled",

  @doc("No eligible peer shares a committed path")
  NoConflict: "no-conflict",

  @doc("The agent chose to let both features continue")
  Continued: "continued",

  @doc("The agent chose to defer and the dependency was recorded")
  Deferred: "deferred",

  @doc("Evidence was incomplete or the agent gave no usable answer; nothing changed")
  Unavailable: "unavailable",

  @doc("The evidence changed while the agent decided; nothing changed")
  Stale: "stale",
}
