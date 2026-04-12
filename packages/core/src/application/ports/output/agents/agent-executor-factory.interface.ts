/**
 * Agent Executor Factory Interface
 *
 * Output port for creating agent executor instances based on agent type.
 * Infrastructure layer provides concrete implementations that wire up
 * the appropriate executor for each supported agent.
 *
 * Following Clean Architecture:
 * - Domain and Application layers depend on this interface
 * - Infrastructure layer provides concrete implementations
 *
 * @example
 * ```typescript
 * const factory: IAgentExecutorFactory = container.resolve('IAgentExecutorFactory');
 * const supported = factory.getSupportedAgents();
 * const executor = factory.createExecutor(AgentType.ClaudeCode, settings.agent);
 * ```
 */

import type { AgentType, AgentConfig } from '../../../../domain/generated/output.js';
import type { IAgentExecutor } from './agent-executor.interface.js';
import type { IInteractiveAgentExecutor } from './interactive-agent-executor.interface.js';

/**
 * CLI binary info for an agent executor, used for version detection.
 */
export interface AgentCliInfo {
  /** Agent type identifier (e.g. 'claude-code') */
  agentType: AgentType;
  /** CLI binary name (e.g. 'claude') */
  cmd: string;
  /** Arguments to get version (e.g. ['--version']) */
  versionArgs: string[];
}

/**
 * Rich model listing returned by dynamic model catalogs.
 * Used by providers that expose a model discovery API (e.g. OpenRouter, Together AI).
 */
export interface AgentModelListing {
  /** Provider-specific model identifier (e.g. 'anthropic/claude-sonnet-4.5'). */
  id: string;
  /** Human-friendly display name, if the provider supplies one. */
  displayName?: string;
  /** Short description of the model. */
  description?: string;
  /** Context window size in tokens. */
  contextLength?: number;
  /** True if the model is billed at $0 (free tier). */
  isFree?: boolean;
  /** Vendor / organization (e.g. 'anthropic', 'meta-llama'). */
  vendor?: string;
}

/**
 * Port interface for creating agent executor instances.
 *
 * Implementations must:
 * - Create the correct executor for the given agent type
 * - Configure the executor with the provided auth configuration
 * - Report which agent types are supported
 */
export interface IAgentExecutorFactory {
  /**
   * Create an executor for the specified agent type.
   *
   * @param agentType - The type of agent to create an executor for
   * @param authConfig - Agent authentication and configuration
   * @returns A configured agent executor
   */
  createExecutor(agentType: AgentType, authConfig: AgentConfig): IAgentExecutor;

  /**
   * Get the list of agent types this factory can create executors for.
   *
   * @returns Array of supported agent types
   */
  getSupportedAgents(): AgentType[];

  /**
   * Get CLI binary info for each agent executor (for version detection).
   * Excludes non-CLI agents (e.g. 'dev').
   *
   * @returns Array of CLI info for version-checkable agents
   */
  getCliInfo(): AgentCliInfo[];

  /**
   * Get the list of model identifiers supported by the given agent executor.
   * Returns synchronously with no I/O — supported lists are static data.
   *
   * @param agentType - The agent type to query
   * @returns Array of model identifier strings, or empty array for unknown/dev agents
   */
  getSupportedModels(agentType: AgentType): string[];

  /**
   * List models available for the given agent type, enriched with metadata
   * when the provider exposes a discovery API (OpenRouter, Together AI).
   *
   * For providers that expose a model catalog API, this fetches the full
   * current list over HTTP (cached in-process with a short TTL). For static
   * providers, it returns the same identifiers as {@link getSupportedModels}
   * wrapped as listings with only the `id` field populated.
   *
   * Callers MUST pass the provider's auth config when one is required — some
   * catalogs (e.g. OpenRouter) require a token to return the full list.
   *
   * @param agentType - The agent type to query
   * @param authConfig - Optional auth config supplying an API token
   * @returns Promise resolving to available model listings (possibly empty)
   */
  listAvailableModels(agentType: AgentType, authConfig?: AgentConfig): Promise<AgentModelListing[]>;

  /**
   * Create an interactive executor for multi-turn agent sessions.
   *
   * @param agentType - The type of agent to create an interactive executor for
   * @param authConfig - Agent authentication and configuration
   * @returns A configured interactive agent executor
   * @throws Error if the agent type does not support interactive sessions
   */
  createInteractiveExecutor(
    agentType: AgentType,
    authConfig: AgentConfig
  ): IInteractiveAgentExecutor;

  /**
   * Check whether the given agent type supports interactive sessions.
   *
   * @param agentType - The agent type to query
   * @returns true if createInteractiveExecutor can be called for this type
   */
  supportsInteractive(agentType: AgentType): boolean;
}
