/**
 * @module Shep.Common.Enums.Harness
 *
 * Enums for the query-aware agent harness (spec 119).
 *
 * The harness is a shep-owned agent loop in which canonical state is explicit
 * and every model call is built from a persisted ContextPlan. Every concept
 * that drives branching in the harness (visibility, task status, decision kind,
 * permission effect, …) is an enum here, never a raw string.
 *
 * Wire values are lowercase snake_case so they read naturally in SQLite rows,
 * policy YAML and CLI JSON output.
 */
@doc("How much of a chunk a single model call sees")
enum ChunkVisibility {
  @doc("Not included in this call")
  Hidden: "hidden",

  @doc("Minimal facts needed to orient the model")
  Short: "short",

  @doc("Richer, query-specific detail")
  Long: "long",

  @doc("Raw or effectively complete content")
  Full: "full",
}

@doc("Kind of an addressable unit of harness state")
enum ChunkKind {
  UserMessage: "user_message",
  AssistantMessage: "assistant_message",
  PromptSection: "prompt_section",
  File: "file",
  FileExcerpt: "file_excerpt",
  SearchResult: "search_result",
  ToolInput: "tool_input",
  ToolOutput: "tool_output",
  CommandOutput: "command_output",
  Diff: "diff",
  TestResult: "test_result",
  Instruction: "instruction",
  Plan: "plan",
  Decision: "decision",
  SubagentResult: "subagent_result",
  BackgroundResult: "background_result",
  Documentation: "documentation",
}

@doc("Data sensitivity label carried by a chunk or resource")
enum SensitivityLabel {
  Public: "public",
  Internal: "internal",
  Confidential: "confidential",
  Secret: "secret",
  Regulated: "regulated",
}

@doc("Whether a harness task only reads, writes the repository, or causes external side effects")
enum HarnessTaskType {
  ReadOnly: "read_only",
  Write: "write",
  SideEffect: "side_effect",
}

@doc("Lifecycle status of a harness task")
enum HarnessTaskStatus {
  Pending: "pending",
  Running: "running",
  Blocked: "blocked",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
}

@doc("Lifecycle status of a harness session")
enum HarnessSessionStatus {
  Active: "active",
  Idle: "idle",
  Completed: "completed",
  Failed: "failed",
  Discarded: "discarded",
}

@doc("Where a harness session came from")
enum HarnessSessionOrigin {
  @doc("Bound to a feature-agent run (one session per AgentRun)")
  Feature: "feature",

  @doc("A standalone task started from the CLI or /harness")
  Standalone: "standalone",

  @doc("Started by the eval runner")
  Eval: "eval",
}

@doc("How the harness assembles model context")
enum HarnessMode {
  @doc("Transcript-first reference mode: append-only history, every tool schema loaded")
  Baseline: "baseline",

  @doc("Query-aware projection: a persisted ContextPlan per model call")
  QueryAware: "query_aware",
}

@doc("Cost/quality budget mode")
enum HarnessBudgetMode {
  Economy: "economy",
  Balanced: "balanced",
  Quality: "quality",
}

@doc("Kind of typed decision the harness records")
enum HarnessDecisionKind {
  ChunkVisibility: "chunk_visibility",
  CacheStrategy: "cache_strategy",
  ModelRoute: "model_route",
  CapabilityChoice: "capability_choice",
  ToolChoice: "tool_choice",
  PermissionRisk: "permission_risk",
  Sensitivity: "sensitivity",
  InstructionActivation: "instruction_activation",
}

@doc("Implementation family of a decision provider")
enum DecisionProviderKind {
  @doc("Heuristics only; no network (the default and the last fallback)")
  Deterministic: "deterministic",

  @doc("Any OpenAI-compatible LLM server (Ollama, vLLM, llama.cpp, LM Studio, SGLang)")
  OpenAiCompatible: "openai_compatible",

  @doc("An HTTP cross-encoder rerank endpoint (e.g. text-embeddings-inference)")
  Reranker: "reranker",

  @doc("The harness's own model backend")
  StructuredLlm: "structured_llm",

  @doc("A Jev typed-decision endpoint")
  Jev: "jev",
}

@doc("Who or what set a chunk's visibility in a context plan")
enum VisibilitySource {
  Deterministic: "deterministic",
  Ai: "ai",
  Policy: "policy",
  Degraded: "degraded",
  Escalation: "escalation",
  User: "user",
  Budget: "budget",
}

@doc("Result of a permission evaluation")
enum PermissionEffect {
  Allow: "allow",
  Ask: "ask",
  Deny: "deny",
}

@doc("Whether a permission decision is final or waiting for a person")
enum PermissionRequestStatus {
  Pending: "pending",
  Resolved: "resolved",
}

@doc("How long a user permission grant applies")
enum GrantScope {
  @doc("This one action")
  Once: "once",

  @doc("The rest of the current harness task (a feature phase)")
  Task: "task",

  @doc("The rest of the session (a feature run, or a standalone session)")
  Session: "session",
}

@doc("Whether a tool reads, writes, or has external side effects")
enum ToolReadWriteMode {
  Read: "read",
  Write: "write",
  SideEffect: "side_effect",
}

@doc("Coarse risk class of a capability or tool implementation")
enum RiskClass {
  Low: "low",
  Medium: "medium",
  High: "high",
}

@doc("Where a tool implementation comes from")
enum ToolSourceKind {
  Builtin: "builtin",
  Mcp: "mcp",
  Plugin: "plugin",
  Custom: "custom",
}

@doc("How a context plan expects to use provider prompt caching")
enum CacheStrategyMode {
  Reuse: "reuse",
  Rebuild: "rebuild",
  StablePrefix: "stable_prefix",
}

@doc("Status of a single model call")
enum ModelCallStatus {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
}

@doc("Status of a single tool call")
enum HarnessToolCallStatus {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
  Denied: "denied",
  Invalid: "invalid",

  @doc("Was running when the process died; outcome not known")
  Unknown: "unknown",
}

@doc("Type of an append-only harness event")
enum HarnessEventType {
  SessionCreated: "session.created",
  SessionResumed: "session.resumed",
  TaskCreated: "task.created",
  TaskStatusChanged: "task.status_changed",
  RepoSnapshotCreated: "repo_snapshot.created",
  RepoDriftDetected: "repo.drift_detected",
  InstructionActivated: "instruction.activated",
  ContextPlanCreated: "context_plan.created",
  DecisionRecorded: "decision.recorded",
  ModelCallStarted: "model_call.started",
  ModelCallCompleted: "model_call.completed",
  ToolSelected: "tool.selected",
  PermissionRequested: "permission.requested",
  PermissionResolved: "permission.resolved",
  ToolExecutionStarted: "tool.execution_started",
  ToolExecutionCompleted: "tool.execution_completed",
  ChunkExpanded: "chunk.expanded",
  TaskCompleted: "task.completed",
  TaskFailed: "task.failed",
}

@doc("Status of an eval run")
enum HarnessEvalRunStatus {
  Pending: "pending",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
}

@doc("Overall outcome of a harness task")
enum HarnessTaskOutcome {
  Success: "success",
  Partial: "partial",
  Failure: "failure",
}
