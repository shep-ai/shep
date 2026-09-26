/**
 * Agent Executor Factory Service
 *
 * Infrastructure implementation of the IAgentExecutorFactory port.
 * Creates and caches agent executor instances based on agent type.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import { AgentType, type AgentConfig } from '../../../../domain/generated/output.js';
import {
  resolveAdaptiveTierPlan,
  type AdaptiveTierPlan,
  type TierOverrides,
} from '../../../../domain/shared/model-tier.js';
import type { IAgentExecutor } from '../../../../application/ports/output/agents/agent-executor.interface.js';
import type { IInteractiveAgentExecutor } from '../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type {
  IAgentExecutorFactory,
  AgentCliInfo,
  AgentModelListing,
} from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import type { IModelCatalog } from '../../../../application/ports/output/agents/model-catalog.interface.js';
import {
  createDefaultModelCatalogs,
  type ModelCatalogRegistry,
} from './model-catalogs/model-catalog-registry.js';
import { ClaudeCodeExecutorService } from './executors/claude-code-executor.service.js';
import { ClaudeCodeInteractiveExecutor } from './executors/claude-code-interactive-executor.service.js';
import { CursorExecutorService } from './executors/cursor-executor.service.js';
import { CursorInteractiveExecutor } from './executors/cursor-interactive-executor.service.js';
import { DevAgentExecutorService } from './executors/dev-executor.service.js';
import { GeminiCliExecutorService } from './executors/gemini-cli-executor.service.js';
import { CodexCliExecutorService } from './executors/codex-cli-executor.service.js';
import { CopilotCliExecutorService } from './executors/copilot-cli-executor.service.js';
import { OpenRouterExecutorService } from './executors/openrouter-executor.service.js';
import { TogetherAiExecutorService } from './executors/together-ai-executor.service.js';
import { OllamaExecutorService } from './executors/ollama-executor.service.js';
import { LlmProxyExecutorService } from './executors/llmproxy-executor.service.js';
import { ClineExecutorService } from './executors/cline-executor.service.js';
import { KimiCodeExecutorService } from './executors/kimi-code-executor.service.js';
import type { SpawnFunction } from './types.js';
import { getModelsForAgent } from './agent-model-catalog.js';
import { listAgentDescriptors } from '../../../../domain/shared/agent-catalog.js';

/**
 * Agent types that have a concrete executor in this factory.
 *
 * Derived from the catalog rather than hand-listed, so `getSupportedAgents()`
 * and `createExecutor()` cannot disagree — they used to, and the mismatch was
 * invisible until a user picked an agent that threw at run time.
 */
const EXECUTABLE_AGENT_TYPES: ReadonlySet<string> = new Set(
  listAgentDescriptors()
    .filter((descriptor) => descriptor.supported)
    .map((descriptor) => descriptor.type as string)
);

/**
 * Agents that can hold a multi-turn chat session, and how to build each one's
 * interactive executor.
 *
 * `createInteractiveExecutor` and `supportsInteractive` both read this one
 * table, so they cannot disagree — the same drift `EXECUTABLE_AGENT_TYPES`
 * exists to prevent for one-shot executors.
 */
const INTERACTIVE_EXECUTORS: Partial<
  Record<AgentType, (spawn: SpawnFunction) => IInteractiveAgentExecutor>
> = {
  [AgentType.ClaudeCode]: () => new ClaudeCodeInteractiveExecutor(),
  [AgentType.Cursor]: (spawn) => new CursorInteractiveExecutor(spawn),
};

/**
 * Ollama and LLMProxy take a BASE URL where every other agent takes an API key,
 * because both front a local server. The settings field is nonetheless called
 * `token`, so a user who pastes a key there would send it as a URL — and a
 * hostile value such as a cloud metadata endpoint would receive the full
 * prompt, which contains the source of the repository being worked on.
 *
 * Accept the value only when it is a plausible base URL, and refuse the
 * link-local metadata range outright. Anything else falls back to the
 * executor's own default.
 */
function resolveLocalProviderBaseUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  // 169.254.0.0/16 — cloud instance metadata lives here on every major provider.
  if (parsed.hostname.startsWith('169.254.')) return undefined;

  return trimmed;
}

/**
 * Factory that creates and caches agent executor instances.
 *
 * Executor instances are cached per agent type (singleton per type)
 * to avoid unnecessary re-creation of stateless executors.
 */
export class AgentExecutorFactory implements IAgentExecutorFactory {
  private readonly cache = new Map<string, IAgentExecutor>();
  private readonly catalogs: ModelCatalogRegistry;

  /**
   * @param spawn - Spawn function for creating subprocesses (injectable for testing).
   * @param catalogs - Optional per-agent {@link IModelCatalog} registry
   *   (defaults to {@link createDefaultModelCatalogs}).
   */
  constructor(
    private readonly spawn: SpawnFunction,
    catalogs?: ModelCatalogRegistry
  ) {
    this.catalogs = catalogs ?? createDefaultModelCatalogs();
  }

  /**
   * Create (or return cached) executor for the specified agent type.
   *
   * @param agentType - The type of agent to create an executor for
   * @param _authConfig - Agent authentication and configuration
   * @returns A configured agent executor
   * @throws Error if the agent type is not supported
   */
  createExecutor(agentType: AgentType, _authConfig: AgentConfig): IAgentExecutor {
    const key = agentType as string;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let executor: IAgentExecutor;
    switch (key) {
      case 'claude-code':
        executor = new ClaudeCodeExecutorService(this.spawn);
        break;
      case 'cursor':
        executor = new CursorExecutorService(this.spawn);
        break;
      case 'dev':
        executor = new DevAgentExecutorService();
        break;
      case 'gemini-cli':
        executor = new GeminiCliExecutorService(this.spawn, _authConfig);
        break;
      case 'codex-cli':
        executor = new CodexCliExecutorService(this.spawn, _authConfig);
        break;
      case 'copilot-cli':
        executor = new CopilotCliExecutorService(this.spawn, _authConfig);
        break;
      case 'cline':
        executor = new ClineExecutorService(this.spawn);
        break;
      case 'kimi-code':
        executor = new KimiCodeExecutorService(this.spawn, _authConfig);
        break;
      case 'openrouter':
        executor = new OpenRouterExecutorService(_authConfig.token ?? '');
        break;
      case 'together-ai':
        executor = new TogetherAiExecutorService(_authConfig.token ?? '');
        break;
      case 'ollama':
        executor = new OllamaExecutorService(resolveLocalProviderBaseUrl(_authConfig.token));
        break;
      case 'llmproxy':
        executor = new LlmProxyExecutorService(resolveLocalProviderBaseUrl(_authConfig.token));
        break;
      default:
        throw new Error(
          `Unsupported agent type: ${agentType}. Supported: ${this.getSupportedAgents().join(', ')}`
        );
    }

    this.cache.set(key, executor);
    return executor;
  }

  /**
   * Get the list of agent types this factory can create executors for.
   *
   * @returns Array of supported agent types
   */
  getSupportedAgents(): AgentType[] {
    return listAgentDescriptors()
      .filter((descriptor) => EXECUTABLE_AGENT_TYPES.has(descriptor.type as string))
      .map((descriptor) => descriptor.type);
  }

  getCliInfo(): AgentCliInfo[] {
    return listAgentDescriptors()
      .filter(
        (descriptor) => descriptor.supported && descriptor.kind === 'cli' && descriptor.binary
      )
      .map((descriptor) => ({
        agentType: descriptor.type,
        cmd: descriptor.binary as string,
        versionArgs: [...descriptor.versionArgs],
      }));
  }

  /**
   * Get the model identifiers supported by the given agent executor.
   * Returns synchronously with no I/O — lists are static data embedded here.
   *
   * @param agentType - The agent type to query
   * @returns Array of model identifier strings, or empty array for unknown/dev agents
   */
  getSupportedModels(agentType: AgentType): string[] {
    return getModelsForAgent(agentType as string);
  }

  /**
   * Resolve the model adaptive selection uses for each complexity tier.
   *
   * Intersects the domain tier catalog with the models THIS agent actually
   * serves, so the resolved plan can never contain an identifier the agent's
   * CLI would reject — the failure mode that made a picker and a validator
   * disagree in spec 098.
   */
  resolveAdaptiveModelPlan(
    agentType: AgentType,
    baseModel: string,
    overrides?: TierOverrides
  ): AdaptiveTierPlan {
    return resolveAdaptiveTierPlan({
      baseModel,
      availableModels: this.getSupportedModels(agentType),
      overrides,
    });
  }

  /**
   * List models available for the given agent type.
   *
   * When a {@link IModelCatalog} is registered for the agent, prefer its live
   * listing (TTL-cached). On empty/failure, fall back to the hardcoded
   * {@link getSupportedModels} list.
   */
  async listAvailableModels(
    agentType: AgentType,
    authConfig?: AgentConfig
  ): Promise<AgentModelListing[]> {
    const catalog: IModelCatalog | undefined = this.catalogs.get(agentType);

    if (catalog) {
      const dynamic = await catalog.listModels(authConfig);
      if (dynamic.length > 0) return dynamic;
    }

    return this.getSupportedModels(agentType).map((id) => ({ id }));
  }

  /**
   * Prefetch every registered catalog concurrently into the shared TTL cache.
   */
  async warmModelCatalogs(authConfig?: AgentConfig): Promise<void> {
    const activeType = authConfig?.type;
    await Promise.all(
      [...this.catalogs.entries()].map(([agentType, catalog]) => {
        const auth = activeType && activeType === agentType ? authConfig : undefined;
        return catalog.listModels(auth).catch(() => [] as AgentModelListing[]);
      })
    );
  }

  /**
   * Create an interactive executor for multi-turn agent sessions.
   *
   * @param agentType - The type of agent to create an interactive executor for
   * @param _authConfig - Agent authentication and configuration
   * @returns A configured interactive agent executor
   * @throws Error if the agent type does not support interactive sessions
   */
  createInteractiveExecutor(
    agentType: AgentType,
    _authConfig: AgentConfig
  ): IInteractiveAgentExecutor {
    const build = INTERACTIVE_EXECUTORS[agentType];
    if (build) return build(this.spawn);
    const available = Object.keys(INTERACTIVE_EXECUTORS)
      .map((type) => `'${type}'`)
      .join(', ');
    throw new Error(
      `Agent type '${agentType}' does not support interactive sessions. ` +
        `Interactive sessions are available for: ${available}.`
    );
  }

  /**
   * Check whether the given agent type supports interactive sessions.
   *
   * @param agentType - The agent type to query
   * @returns true if createInteractiveExecutor can be called for this type
   */
  supportsInteractive(agentType: AgentType): boolean {
    return INTERACTIVE_EXECUTORS[agentType] !== undefined;
  }
}

// Model lists are defined in agent-model-catalog.ts — imported above.
