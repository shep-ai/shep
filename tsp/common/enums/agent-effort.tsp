/**
 * @module Shep.Common.Enums.AgentEffort
 *
 * Defines the AgentEffort enum: how much reasoning an agent spends per turn.
 *
 * Effort is the main cost/quality lever on current Claude models. It sets how
 * much the model thinks, and therefore its latency, token spend and quality.
 * Shep stores it as a global default (`ModelConfiguration.effort`) and pins it
 * per feature run (`AgentRun.effort`). Executors that declare
 * `AgentFeature.effort` pass it to their agent. Claude Code receives it as
 * `--effort <level>`; other executors ignore it.
 *
 * An unset effort means "the agent's own default": no flag is sent.
 *
 * The wire values match the Claude Code CLI's `--effort` values exactly, so no
 * translation layer sits between the domain and the executor.
 */
@doc("Reasoning effort an agent spends per turn")
enum AgentEffort {
  @doc("Fastest and cheapest; brief thinking")
  low: "low",

  @doc("Balanced cost and quality")
  medium: "medium",

  @doc("More thorough reasoning for harder work")
  high: "high",

  @doc("Extended reasoning for long agentic coding tasks")
  xhigh: "xhigh",

  @doc("Maximum reasoning; highest cost and latency")
  max: "max",
}
