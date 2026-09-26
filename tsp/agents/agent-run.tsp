/**
 * @module Shep.Agents.AgentRun
 *
 * Persistent record of an agent execution session.
 * Tracks the entire lifecycle from pending to completion/failure
 * with crash recovery metadata (PID, heartbeat, thread ID).
 *
 * Stored in the global database (~/.shep/data).
 */
import "../common/base.tsp";
import "../common/enums/agent-config.tsp";
import "../common/enums/agent-effort.tsp";
import "./enums/agent-run-status.tsp";
import "./approval-gates.tsp";

@doc("Agent execution run record")
model AgentRun extends BaseEntity {
  @doc("Agent executor type used (claude-code, gemini-cli, etc.)")
  agentType: AgentType;

  @doc("Agent workflow name (analyze-repository, requirements, etc.)")
  agentName: string;

  @doc("Current execution status")
  status: AgentRunStatus;

  @doc("Input prompt sent to agent executor")
  prompt: string;

  @doc("Final result output (optional, populated on completion)")
  result?: string;

  @doc("Executor session ID for resumption (optional)")
  sessionId?: string;

  @doc("LangGraph thread_id for checkpoint lookup and crash resume")
  threadId: string;

  @doc("Process ID for crash recovery (optional)")
  pid?: int32;

  @doc("Last heartbeat timestamp for crash detection (optional)")
  lastHeartbeat?: utcDateTime;

  @doc("Execution start timestamp (optional)")
  startedAt?: utcDateTime;

  @doc("Execution completion timestamp (optional)")
  completedAt?: utcDateTime;

  @doc("Error message if execution failed (optional)")
  error?: string;

  @doc("Associated feature ID for feature agent runs (optional)")
  featureId?: string;

  @doc("Repository path for context scoping (optional)")
  repositoryPath?: string;

  @doc("Approval gate configuration for human-in-the-loop review (optional)")
  approvalGates?: ApprovalGates;

  @doc("LLM model identifier used for this run (optional, set at creation)")
  modelId?: string;

  @doc("Reasoning effort pinned for this run (optional, set at creation; absent = agent default)")
  effort?: AgentEffort;
}
