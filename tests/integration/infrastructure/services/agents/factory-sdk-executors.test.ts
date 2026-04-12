/**
 * Factory SDK Executors Integration Test
 *
 * Verifies that the AgentExecutorFactory correctly creates, caches, and returns
 * real SDK executor instances (OpenRouter, Together AI) through the same
 * factory path used by the DI container. No HTTP calls — validates wiring only.
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { AgentExecutorFactory } from '@/infrastructure/services/agents/common/agent-executor-factory.service.js';
import { OpenRouterExecutorService } from '@/infrastructure/services/agents/common/executors/openrouter-executor.service.js';
import { TogetherAiExecutorService } from '@/infrastructure/services/agents/common/executors/together-ai-executor.service.js';
import { OllamaExecutorService } from '@/infrastructure/services/agents/common/executors/ollama-executor.service.js';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';
import type { AgentConfig } from '@/domain/generated/output.js';

describe('Factory SDK Executors Integration', () => {
  const factory = new AgentExecutorFactory(spawn);

  const openrouterConfig: AgentConfig = {
    type: AgentType.OpenRouter,
    authMethod: AgentAuthMethod.Token,
    token: 'test-openrouter-api-key',
  };

  const togetherConfig: AgentConfig = {
    type: AgentType.TogetherAi,
    authMethod: AgentAuthMethod.Token,
    token: 'test-together-api-key',
  };

  const ollamaConfig: AgentConfig = {
    type: AgentType.Ollama,
    authMethod: AgentAuthMethod.Session,
  };

  describe('OpenRouter executor creation', () => {
    it('should create a real OpenRouterExecutorService instance', () => {
      const executor = factory.createExecutor(AgentType.OpenRouter, openrouterConfig);

      expect(executor).toBeInstanceOf(OpenRouterExecutorService);
      expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
    });

    it('should set agentType to OpenRouter', () => {
      const executor = factory.createExecutor(AgentType.OpenRouter, openrouterConfig);

      expect(executor.agentType).toBe(AgentType.OpenRouter);
      expect(executor.agentType).toBe('openrouter');
    });

    it('should support streaming, structured-output, and system-prompt features', () => {
      const executor = factory.createExecutor(AgentType.OpenRouter, openrouterConfig);

      expect(executor.supportsFeature('streaming' as any)).toBe(true);
      expect(executor.supportsFeature('structured-output' as any)).toBe(true);
      expect(executor.supportsFeature('system-prompt' as any)).toBe(true);
    });

    it('should not support session-resume or tool-scoping features', () => {
      const executor = factory.createExecutor(AgentType.OpenRouter, openrouterConfig);

      expect(executor.supportsFeature('session-resume' as any)).toBe(false);
      expect(executor.supportsFeature('tool-scoping' as any)).toBe(false);
    });
  });

  describe('Together AI executor creation', () => {
    it('should create a real TogetherAiExecutorService instance', () => {
      // Use a separate factory to avoid cache interference from previous tests
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.TogetherAi, togetherConfig);

      expect(executor).toBeInstanceOf(TogetherAiExecutorService);
      expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
    });

    it('should set agentType to TogetherAi', () => {
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.TogetherAi, togetherConfig);

      expect(executor.agentType).toBe(AgentType.TogetherAi);
      expect(executor.agentType).toBe('together-ai');
    });

    it('should support streaming, structured-output, and system-prompt features', () => {
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.TogetherAi, togetherConfig);

      expect(executor.supportsFeature('streaming' as any)).toBe(true);
      expect(executor.supportsFeature('structured-output' as any)).toBe(true);
      expect(executor.supportsFeature('system-prompt' as any)).toBe(true);
    });
  });

  describe('Ollama executor creation', () => {
    it('should create a real OllamaExecutorService instance', () => {
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.Ollama, ollamaConfig);

      expect(executor).toBeInstanceOf(OllamaExecutorService);
      expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
    });

    it('should set agentType to Ollama', () => {
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.Ollama, ollamaConfig);

      expect(executor.agentType).toBe(AgentType.Ollama);
      expect(executor.agentType).toBe('ollama');
    });

    it('should support streaming, structured-output, and system-prompt features', () => {
      const freshFactory = new AgentExecutorFactory(spawn);
      const executor = freshFactory.createExecutor(AgentType.Ollama, ollamaConfig);

      expect(executor.supportsFeature('streaming' as any)).toBe(true);
      expect(executor.supportsFeature('structured-output' as any)).toBe(true);
      expect(executor.supportsFeature('system-prompt' as any)).toBe(true);
    });
  });

  describe('Executor caching', () => {
    it('should cache OpenRouter executor (same reference on second call)', () => {
      const cachingFactory = new AgentExecutorFactory(spawn);

      const first = cachingFactory.createExecutor(AgentType.OpenRouter, openrouterConfig);
      const second = cachingFactory.createExecutor(AgentType.OpenRouter, openrouterConfig);

      expect(first).toBe(second);
    });

    it('should cache Together AI executor (same reference on second call)', () => {
      const cachingFactory = new AgentExecutorFactory(spawn);

      const first = cachingFactory.createExecutor(AgentType.TogetherAi, togetherConfig);
      const second = cachingFactory.createExecutor(AgentType.TogetherAi, togetherConfig);

      expect(first).toBe(second);
    });

    it('should return different instances for different SDK agent types', () => {
      const cachingFactory = new AgentExecutorFactory(spawn);

      const openrouter = cachingFactory.createExecutor(AgentType.OpenRouter, openrouterConfig);
      const together = cachingFactory.createExecutor(AgentType.TogetherAi, togetherConfig);

      expect(openrouter).not.toBe(together);
      expect(openrouter).toBeInstanceOf(OpenRouterExecutorService);
      expect(together).toBeInstanceOf(TogetherAiExecutorService);
    });

    it('should not interfere with CLI executor caching', () => {
      const cachingFactory = new AgentExecutorFactory(spawn);

      const sdkExecutor = cachingFactory.createExecutor(AgentType.OpenRouter, openrouterConfig);
      const cliExecutor = cachingFactory.createExecutor(AgentType.ClaudeCode, {
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Session,
      });

      expect(sdkExecutor).not.toBe(cliExecutor);
      expect(sdkExecutor.agentType).toBe('openrouter');
      expect(cliExecutor.agentType).toBe('claude-code');
    });
  });

  describe('Factory metadata for SDK agents', () => {
    it('should include all SDK agents in getSupportedAgents', () => {
      const supported = factory.getSupportedAgents();

      expect(supported).toContain('openrouter');
      expect(supported).toContain('together-ai');
      expect(supported).toContain('ollama');
    });

    it('should not include SDK agents in getCliInfo (no CLI binary)', () => {
      const cliInfos = factory.getCliInfo();
      const sdkAgents = cliInfos.filter(
        (info) =>
          (info.agentType as string) === 'openrouter' ||
          (info.agentType as string) === 'together-ai' ||
          (info.agentType as string) === 'ollama'
      );

      expect(sdkAgents).toHaveLength(0);
    });

    it('should return curated model lists for all SDK agents', () => {
      const openrouterModels = factory.getSupportedModels(AgentType.OpenRouter);
      const togetherModels = factory.getSupportedModels(AgentType.TogetherAi);
      const ollamaModels = factory.getSupportedModels(AgentType.Ollama);

      expect(openrouterModels.length).toBeGreaterThan(0);
      expect(togetherModels.length).toBeGreaterThan(0);
      expect(ollamaModels.length).toBeGreaterThan(0);
      expect(openrouterModels).toContain('anthropic/claude-sonnet-4.5');
      expect(togetherModels).toContain('meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8');
      expect(ollamaModels).toContain('llama3.2');
    });

    it('should not support interactive sessions for SDK agents', () => {
      expect(factory.supportsInteractive(AgentType.OpenRouter)).toBe(false);
      expect(factory.supportsInteractive(AgentType.TogetherAi)).toBe(false);
      expect(factory.supportsInteractive(AgentType.Ollama)).toBe(false);
    });

    it('should throw when creating interactive executor for SDK agents', () => {
      expect(() =>
        factory.createInteractiveExecutor(AgentType.OpenRouter, openrouterConfig)
      ).toThrow('does not support interactive sessions');

      expect(() => factory.createInteractiveExecutor(AgentType.TogetherAi, togetherConfig)).toThrow(
        'does not support interactive sessions'
      );

      expect(() => factory.createInteractiveExecutor(AgentType.Ollama, ollamaConfig)).toThrow(
        'does not support interactive sessions'
      );
    });
  });
});
