/**
 * @module Shep.Agents.Base
 *
 * Base agent model definitions for the Shep AI CLI.
 *
 * This module defines the foundational AgentInstance model that represents
 * a running agent in the system. All specialized agents derive from or
 * compose with this base model.
 *
 * ## Agent Lifecycle
 *
 * ```
 *   +-------+     start      +---------+
 *   | Idle  | -------------> | Running |
 *   +-------+                +---------+
 *       ^                        |
 *       |        pause           v
 *       |     +--------+    +---------+
 *       +-----| Paused |<---| Running |
 *       |     +--------+    +---------+
 *       |         |              |
 *       |  resume |      stop    |
 *       +---------+              v
 *                          +---------+
 *                          | Stopped |
 *                          +---------+
 * ```
 *
 * @see docs/architecture/agent-system.md - Detailed agent architecture documentation
 * @see ./feature-agent.tsp - Main orchestrating feature agent
 * @see ./deploy-agent.tsp - Local deployment agent
 */
import "../common/scalars.tsp";
import "../common/enums/agent.tsp";

/**
 * Base model for a running agent instance.
 *
 * AgentInstance represents an active agent that can process work and respond
 * to queries. Each instance operates on a specific Git branch and maintains
 * its own lifecycle state.
 *
 * ## Properties
 *
 * | Property | Type | Description |
 * |----------|------|-------------|
 * | id | UUID | Unique identifier for this agent instance |
 * | branch | string | Git branch this agent is operating on |
 * | status | AgentStatus | Current operational status |
 * | createdAt | utcDateTime | When the agent was created |
 *
 * ## Usage
 *
 * Agent instances are typically created and managed by the FeatureAgent
 * to handle specific tasks within a feature's development workflow.
 *
 * @example
 * ```typespec
 * model MySpecializedAgent {
 *   ...AgentInstance;  // Spread to inherit properties
 *   customField: string;
 * }
 * ```
 *
 * @see docs/architecture/agent-system.md - Agent system architecture
 */
@doc("A running agent instance that processes work and responds to queries")
model AgentInstance {
  @doc("Unique identifier for this agent instance")
  id: UUID;

  @doc("Git branch this agent is operating on for code changes")
  branch: string;

  @doc("Current operational status of the agent (Idle, Running, Paused, or Stopped)")
  status: AgentStatus;

  @doc("Timestamp when this agent instance was created")
  @visibility(Lifecycle.Read)
  createdAt: utcDateTime;
}
