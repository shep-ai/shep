/**
 * @module Shep.Agents.Enums.AgentFeature
 *
 * Capability declarations for agent executors.
 * Used by IAgentExecutor.supportsFeature() to enable
 * fallback strategies when a feature is not supported.
 */
@doc("Agent executor capability declarations")
enum AgentFeature {
  @doc("Supports session resumption from checkpoint")
  sessionResume: "session-resume",

  @doc("Supports streaming output events")
  streaming: "streaming",

  @doc("Supports tool scoping (restrict available tools)")
  toolScoping: "tool-scoping",

  @doc("Supports structured output with JSON schema")
  structuredOutput: "structured-output",

  @doc("Supports custom system prompts")
  systemPrompt: "system-prompt",

  @doc("Supports listing agent provider CLI sessions")
  sessionListing: "session-listing",

  @doc("Supports a reasoning effort level (AgentExecutionOptions.effort)")
  effort: "effort",
}
