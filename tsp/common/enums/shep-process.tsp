/**
 * @module Shep.Common.Enums.ShepProcess
 *
 * The processes `shep ps` (spec 144) reports: what each one is, and whether it
 * is alive. Both are derived from what Shep records (daemon.json and agent run
 * PIDs), never stored.
 */
@doc("What a process Shep runs is for")
enum ShepProcessKind {
  @doc("The web UI daemon (shep start / shep ui)")
  Daemon: "daemon",

  @doc("A feature agent worker driving one feature through its lifecycle")
  FeatureAgent: "feature-agent",

  @doc("Any other agent run (repository analysis, rebase, ...)")
  AgentRun: "agent-run",
}

@doc("Whether a process Shep recorded is alive")
enum ShepProcessState {
  @doc("The process is alive")
  Running: "running",

  @doc("The record says it should be running, but the process is gone")
  Crashed: "crashed",

  @doc("The process ended, as its record expects (finished, or paused at a gate)")
  Exited: "exited",
}
