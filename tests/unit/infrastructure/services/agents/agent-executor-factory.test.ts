/**
 * AgentExecutorFactory Unit Tests
 *
 * Tests for the factory that creates agent executor instances.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutorFactory } from '@/infrastructure/services/agents/common/agent-executor-factory.service.js';
import { DevAgentExecutorService } from '@/infrastructure/services/agents/common/executors/dev-executor.service.js';
import { CodexCliExecutorService } from '@/infrastructure/services/agents/common/executors/codex-cli-executor.service.js';
import { CopilotCliExecutorService } from '@/infrastructure/services/agents/common/executors/copilot-cli-executor.service.js';
import { OpenRouterExecutorService } from '@/infrastructure/services/agents/common/executors/openrouter-executor.service.js';
import { TogetherAiExecutorService } from '@/infrastructure/services/agents/common/executors/together-ai-executor.service.js';
import { OllamaExecutorService } from '@/infrastructure/services/agents/common/executors/ollama-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';
import type { AgentConfig } from '@/domain/generated/output.js';

describe('AgentExecutorFactory', () => {
  let factory: AgentExecutorFactory;
  let mockSpawn: SpawnFunction;
  const defaultAuthConfig: AgentConfig = {
    type: AgentType.ClaudeCode,
    authMethod: AgentAuthMethod.Session,
  };

  beforeEach(() => {
    mockSpawn = vi.fn();
    factory = new AgentExecutorFactory(mockSpawn);
  });

  describe('createExecutor', () => {
    it('should create ClaudeCodeExecutor for claude-code type', () => {
      const executor = factory.createExecutor(AgentType.ClaudeCode, defaultAuthConfig);

      expect(executor).toBeDefined();
      expect(executor.agentType).toBe(AgentType.ClaudeCode);
    });

    it('should create GeminiCliExecutor for gemini-cli type', () => {
      const geminiConfig: AgentConfig = {
        type: AgentType.GeminiCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.GeminiCli, geminiConfig);

      expect(executor).toBeDefined();
      expect(executor.agentType).toBe(AgentType.GeminiCli);
    });

    it('should cache gemini-cli executor instances', () => {
      const geminiConfig: AgentConfig = {
        type: AgentType.GeminiCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor1 = factory.createExecutor(AgentType.GeminiCli, geminiConfig);
      const executor2 = factory.createExecutor(AgentType.GeminiCli, geminiConfig);

      expect(executor1).toBe(executor2);
    });

    it('should create DevAgentExecutorService for dev type', () => {
      const devConfig: AgentConfig = {
        type: AgentType.Dev,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.Dev, devConfig);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(DevAgentExecutorService);
      expect(executor.agentType).toBe(AgentType.Dev);
    });

    it('should cache dev executor instances (singleton per type)', () => {
      const devConfig: AgentConfig = {
        type: AgentType.Dev,
        authMethod: AgentAuthMethod.Session,
      };

      const executor1 = factory.createExecutor(AgentType.Dev, devConfig);
      const executor2 = factory.createExecutor(AgentType.Dev, devConfig);

      expect(executor1).toBe(executor2);
    });

    it('should throw for aider agent type', () => {
      const aiderConfig: AgentConfig = {
        type: AgentType.Aider,
        authMethod: AgentAuthMethod.Session,
      };

      expect(() => factory.createExecutor(AgentType.Aider, aiderConfig)).toThrow(
        'Unsupported agent type: aider'
      );
    });

    it('should create CursorExecutor for cursor type', () => {
      const cursorConfig: AgentConfig = {
        type: AgentType.Cursor,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.Cursor, cursorConfig);

      expect(executor).toBeDefined();
      expect(executor.agentType).toBe(AgentType.Cursor);
    });

    it('should create CodexCliExecutorService for codex-cli type', () => {
      const codexConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.CodexCli, codexConfig);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(CodexCliExecutorService);
      expect(executor.agentType).toBe(AgentType.CodexCli);
    });

    it('should cache codex-cli executor instances', () => {
      const codexConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor1 = factory.createExecutor(AgentType.CodexCli, codexConfig);
      const executor2 = factory.createExecutor(AgentType.CodexCli, codexConfig);

      expect(executor1).toBe(executor2);
    });

    it('should pass authConfig to CodexCliExecutorService', () => {
      const codexConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: AgentAuthMethod.Token,
        token: 'test-codex-key',
      };

      const executor = factory.createExecutor(AgentType.CodexCli, codexConfig);

      expect(executor).toBeInstanceOf(CodexCliExecutorService);
    });

    it('should create CopilotCliExecutorService for copilot-cli type', () => {
      const copilotConfig: AgentConfig = {
        type: AgentType.CopilotCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.CopilotCli, copilotConfig);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(CopilotCliExecutorService);
      expect(executor.agentType).toBe(AgentType.CopilotCli);
    });

    it('should cache copilot-cli executor instances', () => {
      const copilotConfig: AgentConfig = {
        type: AgentType.CopilotCli,
        authMethod: AgentAuthMethod.Session,
      };

      const executor1 = factory.createExecutor(AgentType.CopilotCli, copilotConfig);
      const executor2 = factory.createExecutor(AgentType.CopilotCli, copilotConfig);

      expect(executor1).toBe(executor2);
    });

    it('should create OpenRouterExecutorService for openrouter type', () => {
      const config: AgentConfig = {
        type: AgentType.OpenRouter,
        authMethod: AgentAuthMethod.Token,
        token: 'test-openrouter-key',
      };

      const executor = factory.createExecutor(AgentType.OpenRouter, config);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(OpenRouterExecutorService);
      expect(executor.agentType).toBe(AgentType.OpenRouter);
    });

    it('should create TogetherAiExecutorService for together-ai type', () => {
      const config: AgentConfig = {
        type: AgentType.TogetherAi,
        authMethod: AgentAuthMethod.Token,
        token: 'test-together-key',
      };

      const executor = factory.createExecutor(AgentType.TogetherAi, config);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(TogetherAiExecutorService);
      expect(executor.agentType).toBe(AgentType.TogetherAi);
    });

    it('should cache openrouter executor instances', () => {
      const config: AgentConfig = {
        type: AgentType.OpenRouter,
        authMethod: AgentAuthMethod.Token,
        token: 'test-key',
      };

      const executor1 = factory.createExecutor(AgentType.OpenRouter, config);
      const executor2 = factory.createExecutor(AgentType.OpenRouter, config);

      expect(executor1).toBe(executor2);
    });

    it('should cache together-ai executor instances', () => {
      const config: AgentConfig = {
        type: AgentType.TogetherAi,
        authMethod: AgentAuthMethod.Token,
        token: 'test-key',
      };

      const executor1 = factory.createExecutor(AgentType.TogetherAi, config);
      const executor2 = factory.createExecutor(AgentType.TogetherAi, config);

      expect(executor1).toBe(executor2);
    });

    it('should create OllamaExecutorService for ollama type', () => {
      const config: AgentConfig = {
        type: AgentType.Ollama,
        authMethod: AgentAuthMethod.Session,
      };

      const executor = factory.createExecutor(AgentType.Ollama, config);

      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(OllamaExecutorService);
      expect(executor.agentType).toBe(AgentType.Ollama);
    });

    it('should cache ollama executor instances', () => {
      const config: AgentConfig = {
        type: AgentType.Ollama,
        authMethod: AgentAuthMethod.Session,
      };

      const executor1 = factory.createExecutor(AgentType.Ollama, config);
      const executor2 = factory.createExecutor(AgentType.Ollama, config);

      expect(executor1).toBe(executor2);
    });

    it('should pass empty string when token is undefined for SDK executors', () => {
      const config: AgentConfig = {
        type: AgentType.OpenRouter,
        authMethod: AgentAuthMethod.Token,
      };

      const executor = factory.createExecutor(AgentType.OpenRouter, config);

      expect(executor).toBeInstanceOf(OpenRouterExecutorService);
    });

    it('should return executor with correct agentType', () => {
      const executor = factory.createExecutor(AgentType.ClaudeCode, defaultAuthConfig);

      expect(executor.agentType).toBe('claude-code');
    });

    it('should cache executor instances (singleton per type)', () => {
      const executor1 = factory.createExecutor(AgentType.ClaudeCode, defaultAuthConfig);
      const executor2 = factory.createExecutor(AgentType.ClaudeCode, defaultAuthConfig);

      expect(executor1).toBe(executor2);
    });
  });

  describe('getSupportedAgents', () => {
    it('should list supported agents', () => {
      const supported = factory.getSupportedAgents();

      expect(supported).toContain('claude-code');
      expect(supported).toContain('cursor');
      expect(supported).toContain('gemini-cli');
      expect(supported).toContain('codex-cli');
      expect(supported).toContain('copilot-cli');
      expect(supported).toContain('dev');
      expect(supported).toContain('openrouter');
      expect(supported).toContain('together-ai');
      expect(supported).toContain('ollama');
      expect(supported).toContain('cline');
      expect(supported).toHaveLength(10);
    });

    it('should not include unsupported agents', () => {
      const supported = factory.getSupportedAgents();

      expect(supported).not.toContain('aider');
      expect(supported).not.toContain('continue');
    });
  });

  describe('getCliInfo', () => {
    it('should include codex-cli entry with cmd codex', () => {
      const cliInfos = factory.getCliInfo();
      const codexInfo = cliInfos.find((info) => info.agentType === AgentType.CodexCli);

      expect(codexInfo).toBeDefined();
      expect(codexInfo!.cmd).toBe('codex');
      expect(codexInfo!.versionArgs).toEqual(['--version']);
    });

    it('should include copilot-cli entry with cmd copilot', () => {
      const cliInfos = factory.getCliInfo();
      const copilotInfo = cliInfos.find((info) => info.agentType === AgentType.CopilotCli);

      expect(copilotInfo).toBeDefined();
      expect(copilotInfo!.cmd).toBe('copilot');
      expect(copilotInfo!.versionArgs).toEqual(['--version']);
    });

    it('should include cline entry with cmd cline', () => {
      const cliInfos = factory.getCliInfo();
      const clineInfo = cliInfos.find((info) => info.agentType === AgentType.Cline);

      expect(clineInfo).toBeDefined();
      expect(clineInfo!.cmd).toBe('cline');
      expect(clineInfo!.versionArgs).toEqual(['version']);
    });

    it('should not include SDK agents (openrouter, together-ai, ollama) since they have no CLI binary', () => {
      const cliInfos = factory.getCliInfo();
      const openrouterInfo = cliInfos.find((info) => info.agentType === AgentType.OpenRouter);
      const togetherInfo = cliInfos.find((info) => info.agentType === AgentType.TogetherAi);
      const ollamaInfo = cliInfos.find((info) => info.agentType === AgentType.Ollama);

      expect(openrouterInfo).toBeUndefined();
      expect(togetherInfo).toBeUndefined();
      expect(ollamaInfo).toBeUndefined();
    });
  });

  describe('getSupportedModels', () => {
    it('should return claude-code model list', () => {
      const models = factory.getSupportedModels(AgentType.ClaudeCode);

      expect(models).toEqual([
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
        'glm-5.2',
        'glm-5.1',
      ]);
    });

    it('should return gemini-cli model list', () => {
      const models = factory.getSupportedModels(AgentType.GeminiCli);

      expect(models).toEqual([
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
      ]);
    });

    it('should return cursor model list', () => {
      const models = factory.getSupportedModels(AgentType.Cursor);

      expect(models).toEqual([
        'claude-opus-4-8',
        'claude-opus-4-7',
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'gpt-5.4-high',
        'gpt-5.2',
        'gpt-5.3-codex',
        'gemini-3.1-pro-preview',
        'composer-1.5',
        'grok-code',
      ]);
    });

    it('should return codex-cli model list with 12 models', () => {
      const models = factory.getSupportedModels(AgentType.CodexCli);

      expect(models).toHaveLength(12);
      expect(models).toEqual([
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
      ]);
    });

    it('should return copilot-cli model list with 15 models', () => {
      const models = factory.getSupportedModels(AgentType.CopilotCli);

      expect(models).toHaveLength(15);
      expect(models).toEqual([
        'claude-haiku-4.5',
        'claude-opus-4.5',
        'claude-opus-4.6',
        'claude-opus-4.7',
        'claude-opus-4.8',
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
      ]);
    });

    it('should return openrouter model list with 10 models', () => {
      const models = factory.getSupportedModels(AgentType.OpenRouter);

      expect(models).toHaveLength(10);
      expect(models).toEqual([
        'anthropic/claude-sonnet-4.5',
        'anthropic/claude-haiku-4.5',
        'openai/gpt-5.4',
        'openai/gpt-5.2',
        'meta-llama/llama-4-maverick',
        'meta-llama/llama-4-scout',
        'google/gemini-3-flash-preview',
        'google/gemini-3.1-pro-preview',
        'deepseek/deepseek-chat-v3-0324',
        'mistralai/mistral-large-latest',
      ]);
    });

    it('should return together-ai model list with 8 models', () => {
      const models = factory.getSupportedModels(AgentType.TogetherAi);

      expect(models).toHaveLength(8);
      expect(models).toEqual([
        'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
        'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo',
        'Qwen/Qwen2.5-Coder-32B-Instruct',
        'deepseek-ai/DeepSeek-V3',
        'deepseek-ai/DeepSeek-R1',
        'mistralai/Mistral-Small-24B-Instruct-2501',
        'google/gemma-2-27b-it',
        'codellama/CodeLlama-70b-Instruct-hf',
      ]);
    });

    it('should return cline model list with 6 models', () => {
      const models = factory.getSupportedModels(AgentType.Cline);

      expect(models).toHaveLength(6);
      expect(models).toEqual([
        'claude-sonnet-4-20250514',
        'claude-haiku-4-5-20251001',
        'gpt-4.1',
        'gpt-4.1-mini',
        'deepseek-chat',
        'llama3.2',
      ]);
    });

    it('should return ollama model list with 9 models', () => {
      const models = factory.getSupportedModels(AgentType.Ollama);

      expect(models).toHaveLength(9);
      expect(models).toEqual([
        'llama3.2',
        'llama3.1',
        'codellama',
        'deepseek-coder-v2',
        'qwen2.5-coder',
        'mistral',
        'gemma2',
        'phi3',
        'starcoder2',
      ]);
    });

    it('should return empty array for dev agent', () => {
      const models = factory.getSupportedModels(AgentType.Dev);

      expect(models).toEqual([]);
    });

    it('should return empty array for unknown agent type', () => {
      const models = factory.getSupportedModels('aider' as AgentType);

      expect(models).toEqual([]);
    });

    it('should return synchronously (no promise)', () => {
      const result = factory.getSupportedModels(AgentType.ClaudeCode);

      expect(result).not.toBeInstanceOf(Promise);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('supportsInteractive', () => {
    it('should return false for openrouter', () => {
      expect(factory.supportsInteractive(AgentType.OpenRouter)).toBe(false);
    });

    it('should return false for together-ai', () => {
      expect(factory.supportsInteractive(AgentType.TogetherAi)).toBe(false);
    });

    it('should return false for ollama', () => {
      expect(factory.supportsInteractive(AgentType.Ollama)).toBe(false);
    });
  });
});
