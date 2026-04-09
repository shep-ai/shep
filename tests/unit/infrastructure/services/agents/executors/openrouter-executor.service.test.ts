/**
 * OpenRouterExecutorService Unit Tests
 *
 * Tests for the concrete OpenRouter executor service.
 * Validates agentType, feature flags, and model creation behavior.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentFeature, AgentType } from '@/domain/generated/output.js';
import { OpenRouterExecutorService } from '@/infrastructure/services/agents/common/executors/openrouter-executor.service.js';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';

describe('OpenRouterExecutorService', () => {
  let executor: OpenRouterExecutorService;

  beforeAll(() => {
    executor = new OpenRouterExecutorService('sk-or-test-key');
  });

  it('extends AiSdkBaseExecutorService', () => {
    expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
  });

  it('agentType is openrouter', () => {
    expect(executor.agentType).toBe(AgentType.OpenRouter);
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
    const model = executor['createModel']('anthropic/claude-3.5-sonnet');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('anthropic/claude-3.5-sonnet');
  });

  it('createModel uses default model when none specified', () => {
    const model = executor['createModel']();

    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude-sonnet-4.5');
  });
});
