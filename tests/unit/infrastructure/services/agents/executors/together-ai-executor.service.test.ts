/**
 * TogetherAiExecutorService Unit Tests
 *
 * Tests for the concrete Together AI executor service.
 * Validates agentType, feature flags, and model creation behavior.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentFeature, AgentType } from '@/domain/generated/output.js';
import { TogetherAiExecutorService } from '@/infrastructure/services/agents/common/executors/together-ai-executor.service.js';
import { AiSdkBaseExecutorService } from '@/infrastructure/services/agents/common/executors/ai-sdk-base-executor.service.js';

describe('TogetherAiExecutorService', () => {
  let executor: TogetherAiExecutorService;

  beforeAll(() => {
    executor = new TogetherAiExecutorService('sk-tog-test-key');
  });

  it('extends AiSdkBaseExecutorService', () => {
    expect(executor).toBeInstanceOf(AiSdkBaseExecutorService);
  });

  it('agentType is together-ai', () => {
    expect(executor.agentType).toBe(AgentType.TogetherAi);
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
    const model = executor['createModel']('meta-llama/Llama-3-70b-chat-hf');

    expect(model).toBeDefined();
    expect(model.modelId).toContain('meta-llama/Llama-3-70b-chat-hf');
  });

  it('createModel uses default model when none specified', () => {
    const model = executor['createModel']();

    expect(model).toBeDefined();
    expect(model.modelId).toContain('Llama-4-Maverick');
  });
});
