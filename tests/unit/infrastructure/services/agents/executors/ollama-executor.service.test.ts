/**
 * OllamaExecutorService Unit Tests
 *
 * Tests for the concrete Ollama executor service.
 * Validates agentType, feature flags, and model creation behavior.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentFeature, AgentType } from '@/domain/generated/output.js';
import { OllamaExecutorService } from '@/infrastructure/services/agents/common/executors/ollama-executor.service.js';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';

describe('OllamaExecutorService', () => {
  let executor: OllamaExecutorService;

  beforeAll(() => {
    executor = new OllamaExecutorService();
  });

  it('extends AiSdkBaseExecutorService', () => {
    expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
  });

  it('agentType is ollama', () => {
    expect(executor.agentType).toBe(AgentType.Ollama);
  });

  describe('supportsFeature', () => {
    it('returns true for streaming', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('returns true for structured-output', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(true);
    });

    it('returns true for system-prompt', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(true);
    });

    it('returns false for session-resume', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(false);
    });

    it('returns false for tool-scoping', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('returns false for session-listing', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });

  it('createModel returns a model with specified model id', () => {
    const model = executor['createModel']('codellama');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('codellama');
  });

  it('createModel uses default model when none specified', () => {
    const model = executor['createModel']();

    expect(model).toBeDefined();
    expect(model.modelId).toContain('llama3.2');
  });

  it('accepts custom base URL via constructor', () => {
    const customExecutor = new OllamaExecutorService('http://remote-server:11434/v1');

    expect(customExecutor).toBeInstanceOf(AiSdkBaseExecutorService);
    expect(customExecutor.agentType).toBe(AgentType.Ollama);
  });
});
