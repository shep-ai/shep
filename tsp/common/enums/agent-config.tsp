/**
 * @module Shep.Common.Enums.AgentConfig
 *
 * Defines enums for agent configuration in the Shep AI platform.
 * These enums control which AI coding tool powers Shep's operations
 * and how authentication is handled for each tool.
 *
 * ## Supported Agents
 *
 * Claude Code, Kimi Code, Codex CLI, Copilot CLI, Gemini CLI, Cursor, Cline, OpenRouter,
 * Together AI, Ollama and LLMProxy are fully supported. Aider and Continue are listed for
 * future extensibility and appear as "Coming Soon" in the TUI wizard.
 */
/**
 * The AI coding agent tool used by Shep for all LLM-powered operations.
 *
 * ```
 * claude-code  ← Currently supported (CLI-based)
 * kimi-code    ← Currently supported (CLI-based, Moonshot AI Kimi models)
 * codex-cli    ← Currently supported (CLI-based)
 * copilot-cli  ← Currently supported (CLI-based)
 * gemini-cli   ← Currently supported (CLI-based)
 * cursor       ← Currently supported (CLI-based)
 * cline        ← Currently supported (CLI-based, multi-provider agentic)
 * openrouter   ← Currently supported (SDK-based, HTTP API)
 * together-ai  ← Currently supported (SDK-based, HTTP API)
 * ollama       ← Currently supported (SDK-based, local inference)
 * llmproxy     ← Currently supported (SDK-based, local proxy)
 * dev          ← Currently supported (no binary — local mock)
 * aider        ← Coming Soon
 * continue     ← Coming Soon
 * ```
 */
@doc("AI coding agent tool selection")
enum AgentType {
  /**
   * Anthropic's Claude Code CLI tool.
   * Supported — uses the `claude` binary for CLI execution.
   */
  @doc("Claude Code CLI by Anthropic")
  ClaudeCode: "claude-code",

  /**
   * Moonshot AI's Kimi Code CLI terminal agent.
   * Supported — uses the `kimi` binary in print mode (`--print`) with
   * newline-delimited JSON output for non-interactive execution against
   * Kimi K-series models.
   */
  @doc("Kimi Code CLI by Moonshot AI")
  KimiCode: "kimi-code",

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
   * Supported — uses the `gemini` binary for CLI execution with Gemini models.
   */
  @doc("Gemini CLI by Google")
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
   * Supported — uses the `cursor-agent` binary for CLI execution.
   */
  @doc("Cursor AI coding agent")
  Cursor: "cursor",

  /**
   * Cline CLI agentic coding assistant.
   * Supported — uses the `cline` CLI binary with headless mode for autonomous execution.
   * Supports multiple LLM backends (Anthropic, OpenRouter, Together AI, Ollama, etc.)
   * with full agentic capabilities (file system access, terminal execution, tool use).
   */
  @doc("Cline multi-provider agentic coding assistant")
  Cline: "cline",

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
   * Ollama local LLM runtime.
   * Supported — SDK-based executor using OpenAI-compatible API.
   * Runs locally with no external API key required.
   */
  @doc("Ollama local LLM runtime")
  Ollama: "ollama",

  /**
   * LLMProxy local LLM proxy.
   * Supported — SDK-based executor using OpenAI-compatible API.
   * Connects to a local proxy typically running on port 4000.
   */
  @doc("LLMProxy local proxy")
  LlmProxy: "llmproxy",

  /**
   * Local development mock executor.
   * No agent binary required — simulates the full feature SDLC flow
   * with realistic fixture YAML artifacts for local development and demos.
   */
  @doc("Local development mock — no agent binary required")
  Dev: "dev",

  /**
   * Shep Harness (spec 119, experimental).
   * Shep owns the agent loop: every model call is built from a persisted
   * ContextPlan, tools are routed capability → implementation with only the
   * selected schema loaded, and every write or side effect carries a
   * persisted permission decision. Model access is reused from an SDK agent
   * (OpenRouter, Together AI, Ollama or LLMProxy).
   */
  @doc("Shep Harness: shep-owned, query-aware agent loop (experimental)")
  ShepHarness: "shep-harness",
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
