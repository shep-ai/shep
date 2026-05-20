// Base agent models and enums
/**
 * @module Shep.Agents
 *
 * Agent Module Index - Re-exports all agent models and interfaces.
 *
 * This module serves as the central entry point for all agent-related
 * TypeSpec definitions in the Shep AI system. Import this file to access
 * all agent models, enums, and interfaces.
 *
 * ## Module Structure
 *
 * ```
 * agents/
 *   |-- index.tsp          <-- This file (re-exports everything)
 *   |-- base.tsp           <-- AgentInstance, AgentStatus
 *   |-- deploy-target.tsp  <-- DeployTarget discriminated union
 *   |-- feature-agent.tsp  <-- FeatureAgent (main orchestrator)
 *   |-- deploy-agent.tsp   <-- LocalDeployAgent
 * ```
 *
 * ## Available Exports
 *
 * ### Enums
 * - `AgentStatus` - Operational status of an agent instance
 *
 * ### Models
 * - `AgentInstance` - Base model for running agent instances
 * - `FeatureAgent` - Main orchestrating agent (the "brain")
 * - `LocalDeployAgent` - Agent for local deployments
 * - `DeployTargetActionItem` - Single action item deployment target
 * - `DeployTargetTask` - Single task deployment target
 * - `DeployTargetTasks` - Multiple tasks deployment target
 *
 * ### Unions
 * - `DeployTarget` - Discriminated union of deployment targets
 *
 * ### Interfaces
 * - `FeatureAgentOperations` - Operations for feature management
 * - `LocalDeployAgentOperations` - Operations for local deployments
 *
 * ## Usage
 *
 * ```typespec
 * import "./agents/index.tsp";
 *
 * // Now you can use all agent types
 * model MyService {
 *   featureAgent: FeatureAgent;
 *   deployAgent: LocalDeployAgent;
 * }
 * ```
 *
 * @see docs/architecture/agent-system.md - Detailed agent architecture
 * @see ./base.tsp - Base agent definitions
 * @see ./feature-agent.tsp - Main orchestrating agent
 * @see ./deploy-agent.tsp - Deployment agent
 * @see ./deploy-target.tsp - Deployment target types
 */
import "./base.tsp";

// Deployment target discriminated union
import "./deploy-target.tsp";

// Main orchestrating feature agent
import "./feature-agent.tsp";

// Local deployment agent
import "./deploy-agent.tsp";

// Agent run infrastructure (orchestration)
import "./enums/agent-run-status.tsp";
import "./enums/agent-feature.tsp";
import "./agent-run.tsp";
import "./agent-run-event.tsp";
import "./agent-definition.tsp";

// Human-in-the-loop approval gates and phase timing
import "./approval-gates.tsp";
import "./phase-timing.tsp";

// PRD approval/rejection DTOs
import "./prd-approval.tsp";

// Agent provider CLI session models
import "./agent-session-message.tsp";
import "./agent-session.tsp";

// Per-feature interactive chat session models
import "./interactive-session.tsp";
import "./interactive-message.tsp";

// Persistent workflow step tracking
import "./workflow-step.tsp";

// Agent collaboration & supervision (spec 093)
import "./agent-message.tsp";
import "./agent-question.tsp";
import "./supervisor-policy.tsp";
import "./supervisor-decision.tsp";
import "./agent-prompt-override.tsp";
import "./agent-graph-override.tsp";
import "./custom-agent.tsp";

// Contributor-onboarding agent structured output (spec 097, task-36)
import "./contributor-onboarding-output.tsp";
