/**
 * @module Shep.Common.Enums.FeatureMode
 *
 * Defines the execution mode for features in the Shep AI platform.
 * Replaces the boolean `fast` flag with a proper enum to support
 * three mutually exclusive modes: Regular (full SDLC), Fast (direct
 * implementation), and Exploration (iterative prototyping).
 */
/**
 * Execution mode that determines the feature's workflow and agent graph.
 *
 * - Regular: Full SDLC pipeline (Analyze → Requirements → Research → Planning → Implementation → Review)
 * - Fast: Skip SDLC phases, implement directly from the user prompt
 * - Exploration: Iterative prototyping with feedback loops before committing to full implementation
 */
@doc("Execution mode determining the feature's workflow and agent graph")
enum FeatureMode {
  @doc("Full SDLC pipeline with all phases and approval gates")
  Regular,

  @doc("Skip SDLC phases — implement directly from the user prompt")
  Fast,

  @doc("Iterative prototyping with feedback loops before committing to implementation")
  Exploration,
}
