/**
 * @module Shep.Common.Enums.AgentConfig
 *
 * Defines enums for agent configuration in the Shep AI platform.
 * These enums control which AI coding tool powers Shep's operations
 * and how authentication is handled for each tool.
 *
 * ## Supported Agents
 *
 * Claude Code, Codex CLI, Copilot CLI, Cursor, OpenRouter, and Together AI are fully
 * supported. Other agents (Gemini CLI, Aider, Continue) are listed for future
 * extensibility and appear as "Coming Soon" in the TUI wizard.
 */
/**
 * The AI coding agent tool used by Shep for all LLM-powered operations.
 *
 * ```
 * claude-code  ← Currently supported
 * codex-cli    ← Currently supported
 * copilot-cli  ← Currently supported
 * cursor       ← Currently supported
 * openrouter   ← Currently supported (SDK-based, HTTP API)
 * together-ai  ← Currently supported (SDK-based, HTTP API)
 * gemini-cli   ← Coming Soon
 * aider        ← Coming Soon
 * continue     ← Coming Soon
 * ```
 */
@doc("AI coding agent tool selection")
enum AgentType {
  /**
   * Anthropic's Claude Code CLI tool.
   * The only currently supported agent.
   */
  @doc("Claude Code CLI by Anthropic")
  ClaudeCode: "claude-code",

  /**
   * OpenAI's Codex CLI terminal agent.
   * Supported — uses the `codex` binary for CLI execution with GPT models.
   */
  @doc("Codex CLI by OpenAI")
  CodexCli: "codex-cli",

  /**
   * GitHub Copilot CLI coding agent.
   * Supported — uses the `copilot` binary with -p flag for non-interactive execution.
   */
  @doc("GitHub Copilot CLI by GitHub")
  CopilotCli: "copilot-cli",

  /**
   * Google's Gemini CLI tool.
   * Not yet supported — listed for future extensibility.
   */
  @doc("Gemini CLI by Google (coming soon)")
  GeminiCli: "gemini-cli",

  /**
   * Aider AI coding assistant.
   * Not yet supported — listed for future extensibility.
   */
  @doc("Aider AI coding assistant (coming soon)")
  Aider: "aider",

  /**
   * Continue IDE extension.
   * Not yet supported — listed for future extensibility.
   */
  @doc("Continue IDE extension (coming soon)")
  Continue: "continue",

  /**
   * Cursor AI coding agent.
   * Supported — uses the `agent` binary for CLI execution.
   */
  @doc("Cursor AI coding agent")
  Cursor: "cursor",

  /**
   * OpenRouter API provider.
   * Supported — SDK-based executor using the Vercel AI SDK over HTTP.
   * Provides access to multiple model vendors (Anthropic, OpenAI, Meta, Google, etc.)
   * through a single API key.
   */
  @doc("OpenRouter multi-provider API")
  OpenRouter: "openrouter",

  /**
   * Together AI API provider.
   * Supported — SDK-based executor using the Vercel AI SDK over HTTP.
   * Fast inference for open-source models (Llama, Qwen, DeepSeek, Mistral, etc.).
   */
  @doc("Together AI open-source model inference")
  TogetherAi: "together-ai",

  /**
   * Local development mock executor.
   * No agent binary required — simulates the full feature SDLC flow
   * with realistic fixture YAML artifacts for local development and demos.
   */
  @doc("Local development mock — no agent binary required")
  Dev: "dev",
}

/**
 * Authentication method for the selected agent.
 *
 * ```
 * session  ← Use agent's existing auth (default)
 * token    ← Provide API token stored in settings DB
 * ```
 */
@doc("Authentication method for the AI agent")
enum AgentAuthMethod {
  /**
   * Use the agent's existing authentication session.
   * The agent manages its own auth (e.g., Claude Code OAuth).
   */
  @doc("Use agent's existing auth session")
  Session: "session",

  /**
   * Use an API token stored in the Shep settings database.
   * Token is set via the TUI wizard or --token CLI flag.
   */
  @doc("Use API token stored in settings")
  Token: "token",
}
