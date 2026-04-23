/**
 * Agent Executor Factory Service
 *
 * Infrastructure implementation of the IAgentExecutorFactory port.
 * Creates and caches agent executor instances based on agent type.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import type { AgentType, AgentConfig } from '../../../../domain/generated/output.js';
import type { IAgentExecutor } from '../../../../application/ports/output/agents/agent-executor.interface.js';
import type { IInteractiveAgentExecutor } from '../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type {
  IAgentExecutorFactory,
  AgentCliInfo,
  AgentModelListing,
} from '../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { OpenRouterModelCatalogService } from './model-catalogs/openrouter-model-catalog.service.js';
import { TogetherAiModelCatalogService } from './model-catalogs/together-ai-model-catalog.service.js';
import { ClaudeCodeExecutorService } from './executors/claude-code-executor.service.js';
import { ClaudeCodeInteractiveExecutor } from './executors/claude-code-interactive-executor.service.js';
import { CursorExecutorService } from './executors/cursor-executor.service.js';
import { DevAgentExecutorService } from './executors/dev-executor.service.js';
import { GeminiCliExecutorService } from './executors/gemini-cli-executor.service.js';
import { CodexCliExecutorService } from './executors/codex-cli-executor.service.js';
import { CopilotCliExecutorService } from './executors/copilot-cli-executor.service.js';
import { OpenRouterExecutorService } from './executors/openrouter-executor.service.js';
import { TogetherAiExecutorService } from './executors/together-ai-executor.service.js';
import { OllamaExecutorService } from './executors/ollama-executor.service.js';
import { ClineExecutorService } from './executors/cline-executor.service.js';
import type { SpawnFunction } from './types.js';

/**
 * Factory that creates and caches agent executor instances.
 *
 * Executor instances are cached per agent type (singleton per type)
 * to avoid unnecessary re-creation of stateless executors.
 */
export class AgentExecutorFactory implements IAgentExecutorFactory {
  private readonly cache = new Map<string, IAgentExecutor>();
  private readonly openRouterCatalog: OpenRouterModelCatalogService;
  private readonly togetherAiCatalog: TogetherAiModelCatalogService;

  /**
   * @param spawn - Spawn function for creating subprocesses (injectable for testing).
   * @param openRouterCatalog - Optional OpenRouter catalog (defaults to new instance).
   * @param togetherAiCatalog - Optional Together AI catalog (defaults to new instance).
   */
  constructor(
    private readonly spawn: SpawnFunction,
    openRouterCatalog?: OpenRouterModelCatalogService,
    togetherAiCatalog?: TogetherAiModelCatalogService
  ) {
    this.openRouterCatalog = openRouterCatalog ?? new OpenRouterModelCatalogService();
    this.togetherAiCatalog = togetherAiCatalog ?? new TogetherAiModelCatalogService();
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
      case 'openrouter':
        executor = new OpenRouterExecutorService(_authConfig.token ?? '');
        break;
      case 'together-ai':
        executor = new TogetherAiExecutorService(_authConfig.token ?? '');
        break;
      case 'ollama':
        executor = new OllamaExecutorService(_authConfig.token ?? undefined);
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
    return [
      'claude-code' as AgentType,
      'cursor' as AgentType,
      'dev' as AgentType,
      'gemini-cli' as AgentType,
      'codex-cli' as AgentType,
      'copilot-cli' as AgentType,
      'cline' as AgentType,
      'openrouter' as AgentType,
      'together-ai' as AgentType,
      'ollama' as AgentType,
    ];
  }

  getCliInfo(): AgentCliInfo[] {
    return [
      { agentType: 'claude-code' as AgentType, cmd: 'claude', versionArgs: ['--version'] },
      { agentType: 'gemini-cli' as AgentType, cmd: 'gemini', versionArgs: ['--version'] },
      { agentType: 'cursor' as AgentType, cmd: 'cursor', versionArgs: ['--version'] },
      { agentType: 'codex-cli' as AgentType, cmd: 'codex', versionArgs: ['--version'] },
      { agentType: 'copilot-cli' as AgentType, cmd: 'copilot', versionArgs: ['--version'] },
      { agentType: 'cline' as AgentType, cmd: 'cline', versionArgs: ['version'] },
    ];
  }

  /**
   * Get the model identifiers supported by the given agent executor.
   * Returns synchronously with no I/O — lists are static data embedded here.
   *
   * @param agentType - The agent type to query
   * @returns Array of model identifier strings, or empty array for unknown/dev agents
   */
  getSupportedModels(agentType: AgentType): string[] {
    switch (agentType as string) {
      case 'claude-code':
        return CLAUDE_CODE_MODELS;
      case 'gemini-cli':
        return GEMINI_CLI_MODELS;
      case 'cursor':
        return CURSOR_MODELS;
      case 'codex-cli':
        return CODEX_CLI_MODELS;
      case 'copilot-cli':
        return COPILOT_CLI_MODELS;
      case 'cline':
        return CLINE_MODELS;
      case 'openrouter':
        return OPENROUTER_MODELS;
      case 'together-ai':
        return TOGETHER_AI_MODELS;
      case 'ollama':
        return OLLAMA_MODELS;
      default:
        return [];
    }
  }

  /**
   * List models available for the given agent type. For OpenRouter and
   * Together AI this hits the provider's catalog API (cached). For all other
   * agents it wraps the static list returned by {@link getSupportedModels}.
   */
  async listAvailableModels(
    agentType: AgentType,
    authConfig?: AgentConfig
  ): Promise<AgentModelListing[]> {
    const key = agentType as string;
    const trimmed = authConfig?.token?.trim();
    const token = trimmed && trimmed.length > 0 ? trimmed : undefined;

    if (key === 'openrouter') {
      const dynamic = await this.openRouterCatalog.listModels(token);
      if (dynamic.length > 0) return dynamic;
      return OPENROUTER_MODELS.map((id) => ({ id }));
    }

    if (key === 'together-ai') {
      const dynamic = await this.togetherAiCatalog.listModels(token);
      if (dynamic.length > 0) return dynamic;
      return TOGETHER_AI_MODELS.map((id) => ({ id }));
    }

    return this.getSupportedModels(agentType).map((id) => ({ id }));
  }

  /**
   * Create an interactive executor for multi-turn agent sessions.
   * Currently only Claude Code supports interactive sessions via the SDK.
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
    const key = agentType as string;
    if (key === 'claude-code') {
      return new ClaudeCodeInteractiveExecutor();
    }
    throw new Error(
      `Agent type '${agentType}' does not support interactive sessions. ` +
        `Only 'claude-code' supports interactive mode.`
    );
  }

  /**
   * Check whether the given agent type supports interactive sessions.
   *
   * @param agentType - The agent type to query
   * @returns true if createInteractiveExecutor can be called for this type
   */
  supportsInteractive(agentType: AgentType): boolean {
    return (agentType as string) === 'claude-code';
  }
}

// Static model lists per executor — update here when new models are released
const CLAUDE_CODE_MODELS: string[] = [
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];
const GEMINI_CLI_MODELS: string[] = [
  'gemini-3.1-pro',
  'gemini-3-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];
const CURSOR_MODELS: string[] = [
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gpt-5.4-high',
  'gpt-5.2',
  'gpt-5.3-codex',
  'gemini-3.1-pro',
  'composer-1.5',
  'grok-code',
];
const CODEX_CLI_MODELS: string[] = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1',
  'gpt-5-codex',
  'gpt-5-codex-mini',
  'gpt-5',
];
const COPILOT_CLI_MODELS = [
  'claude-haiku-4.5',
  'claude-opus-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-sonnet-4',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'gpt-4.1',
  'gpt-5-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.4',
  'gpt-5.4-mini',
];

// Cline — multi-provider agentic assistant (models depend on configured provider)
const CLINE_MODELS: string[] = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'gpt-4.1',
  'gpt-4.1-mini',
  'deepseek-chat',
  'llama3.2',
];

// OpenRouter — popular coding-capable models from multiple vendors
const OPENROUTER_MODELS: string[] = [
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.4',
  'openai/gpt-5.2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'google/gemini-3-flash',
  'google/gemini-3-pro',
  'deepseek/deepseek-chat-v3-0324',
  'mistralai/mistral-large-latest',
];

// Together AI — fast open-source model inference, coding-focused
const TOGETHER_AI_MODELS: string[] = [
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
  'Qwen/Qwen2.5-Coder-32B-Instruct',
  'deepseek-ai/DeepSeek-V3',
  'deepseek-ai/DeepSeek-R1',
  'mistralai/Mistral-Small-24B-Instruct-2501',
  'google/gemma-2-27b-it',
  'codellama/CodeLlama-70b-Instruct-hf',
];

// Ollama — popular local models for coding and general use
const OLLAMA_MODELS: string[] = [
  'llama3.2',
  'llama3.1',
  'codellama',
  'deepseek-coder-v2',
  'qwen2.5-coder',
  'mistral',
  'gemma2',
  'phi3',
  'starcoder2',
];
